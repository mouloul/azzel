import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations } from './migrate';
import { readDatabaseUrl } from './env';
import {
  CodeExhaustedError,
  DbUnavailableError,
  InvalidCodeError,
  RateLimitedError,
} from './errors';
import {
  getSession,
  requestLoginCode,
  verifyLoginCode,
  type SendCodeFn,
} from './service';
import { createIamStore, type IamStore } from './store';

function parseUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const serverUrl = parseUrl(readDatabaseUrl());

const ALLOWED_TEST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

if (serverUrl !== null && !ALLOWED_TEST_HOSTS.has(serverUrl.hostname)) {
  throw new Error(
    `Base de test refusée : DATABASE_URL pointe vers « ${serverUrl.hostname} », seules localhost / 127.0.0.1 / ::1 sont autorisées.`,
  );
}

if (serverUrl === null) {
  console.warn('intégration iam SKIPPÉE — bash scripts/dev-db.sh up pour l’activer');
}

function uniqueEmail(): string {
  return `coureur-${randomUUID()}@test.azzel`;
}

describe.skipIf(serverUrl === null)('iam — intégration Postgres (base azzel_test)', () => {
  const baseUrl = serverUrl as URL;
  let sql: postgres.Sql;
  let store: IamStore;

  beforeAll(async () => {
    const adminUrl = new URL(baseUrl.toString());
    adminUrl.pathname = '/postgres';
    const admin = postgres(adminUrl.toString(), { max: 1 });
    await admin`DROP DATABASE IF EXISTS azzel_test WITH (FORCE)`;
    await admin`CREATE DATABASE azzel_test`;
    await admin.end({ timeout: 5 });

    const testUrl = new URL(baseUrl.toString());
    testUrl.pathname = '/azzel_test';
    sql = postgres(testUrl.toString(), { max: 2 });
    await applyMigrations(sql);
    store = createIamStore(sql);
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  });

  const noopSendCode: SendCodeFn = async () => {};

  async function captureSendCode(): Promise<{ sendCode: SendCodeFn; getCode: () => string }> {
    let captured = '';
    return {
      sendCode: async (_email: string, code: string) => {
        captured = code;
      },
      getCode: () => captured,
    };
  }

  function wrongCodeFor(code: string): string {
    return code === '000000' ? '000001' : '000000';
  }

  it('premier accès : code correct → compte créé et session active', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    const session = await verifyLoginCode(email, capture.getCode(), { store });
    expect(session.email).toBe(email);

    const accounts = await sql`SELECT id, organisation_id FROM account WHERE email = ${email}`;
    expect(accounts.length).toBe(1);
    const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
    expect(accounts[0]?.organisation_id).toBe(organisations[0]?.id);

    const found = await getSession(session.token, { store });
    expect(found?.email).toBe(email);
  });

  it('code erroné : refus sans créer de compte, tentative comptée', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    await expect(
      verifyLoginCode(email, wrongCodeFor(capture.getCode()), { store }),
    ).rejects.toBeInstanceOf(InvalidCodeError);

    const accounts = await sql`SELECT id FROM account WHERE email = ${email}`;
    expect(accounts.length).toBe(0);
    const codes = await sql`SELECT attempts FROM login_code WHERE email = ${email}`;
    expect(codes[0]?.attempts).toBe(1);
  });

  it('cinq tentatives échouées : code invalidé, nouveau code requis', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });
    const wrong = wrongCodeFor(capture.getCode());

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(verifyLoginCode(email, wrong, { store })).rejects.toBeInstanceOf(
        InvalidCodeError,
      );
    }
    await expect(verifyLoginCode(email, wrong, { store })).rejects.toBeInstanceOf(
      CodeExhaustedError,
    );
    await expect(verifyLoginCode(email, capture.getCode(), { store })).rejects.toBeInstanceOf(
      InvalidCodeError,
    );

    const accounts = await sql`SELECT id FROM account WHERE email = ${email}`;
    expect(accounts.length).toBe(0);
    const codes =
      await sql`SELECT attempts, invalidated_at FROM login_code WHERE email = ${email}`;
    expect(codes[0]?.invalidated_at).not.toBeNull();
  });

  it('code expiré (plus de 10 minutes) : refus sans créer de compte', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });
    await sql`UPDATE login_code SET expires_at = now() - interval '1 minute' WHERE email = ${email}`;

    await expect(verifyLoginCode(email, capture.getCode(), { store })).rejects.toBeInstanceOf(
      InvalidCodeError,
    );
    const accounts = await sql`SELECT id FROM account WHERE email = ${email}`;
    expect(accounts.length).toBe(0);
  });

  it('renvoi limité : 4e demande en moins de 10 minutes refusée avec délai', async () => {
    const email = uniqueEmail();
    for (let request = 0; request < 3; request += 1) {
      await requestLoginCode(email, { store, sendCode: noopSendCode });
    }
    try {
      await requestLoginCode(email, { store, sendCode: noopSendCode });
      expect.unreachable('la 4e demande devait être refusée');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).retryAfterSec).toBeGreaterThan(0);
      expect((error as RateLimitedError).retryAfterSec).toBeLessThanOrEqual(600);
    }
  });

  it('demandes parallèles : le comptage et l’insertion sous verrou bornent à 3 par fenêtre', async () => {
    const email = uniqueEmail();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        requestLoginCode(email, { store, sendCode: noopSendCode }),
      ),
    );
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof RateLimitedError,
    );
    expect(fulfilled.length).toBe(3);
    expect(rejected.length).toBe(2);
    const rows = await sql`SELECT count(*)::int AS count FROM login_code WHERE email = ${email}`;
    expect(rows[0]?.count).toBe(3);
  });

  it('un nouveau code invalide le précédent : seul le dernier est vérifiable', async () => {
    const email = uniqueEmail();
    const first = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: first.sendCode });
    let latest = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: latest.sendCode });
    if (latest.getCode() === first.getCode()) {
      latest = await captureSendCode();
      await requestLoginCode(email, { store, sendCode: latest.sendCode });
    }
    expect(latest.getCode()).not.toBe(first.getCode());

    await expect(
      verifyLoginCode(email, first.getCode(), { store }),
    ).rejects.toBeInstanceOf(InvalidCodeError);
    const session = await verifyLoginCode(email, latest.getCode(), { store });
    expect(session.email).toBe(email);
  });

  it('session unique (AD-5) : une nouvelle connexion révoque la précédente', async () => {
    const email = uniqueEmail();
    const first = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: first.sendCode });
    const firstSession = await verifyLoginCode(email, first.getCode(), { store });

    const second = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: second.sendCode });
    const secondSession = await verifyLoginCode(email, second.getCode(), { store });

    expect(firstSession.token).not.toBe(secondSession.token);
    expect(await getSession(firstSession.token, { store })).toBeNull();
    expect((await getSession(secondSession.token, { store }))?.email).toBe(email);
  });

  it('email jamais demandé : même refus qu’un code erroné, aucun compte', async () => {
    const email = uniqueEmail();
    await expect(verifyLoginCode(email, '123456', { store })).rejects.toBeInstanceOf(
      InvalidCodeError,
    );
    const accounts = await sql`SELECT id FROM account WHERE email = ${email}`;
    expect(accounts.length).toBe(0);
  });

  it('normalisation : majuscules et espaces aboutissent au même compte', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(`  ${email.toUpperCase()} `, { store, sendCode: capture.sendCode });
    const session = await verifyLoginCode(email, capture.getCode(), { store });
    expect(session.email).toBe(email);
    const accounts = await sql`SELECT id FROM account WHERE email = ${email}`;
    expect(accounts.length).toBe(1);
  });

  it('base injoignable : DbUnavailableError', async () => {
    const badSql = postgres('postgres://azzel:azzel@127.0.0.1:54330/azzel', {
      max: 1,
      connect_timeout: 1,
    });
    const badStore = createIamStore(badSql);
    try {
      await expect(badStore.getDefaultOrganisationId()).rejects.toBeInstanceOf(
        DbUnavailableError,
      );
    } finally {
      try {
        await badSql.end({ timeout: 1 });
      } catch {}
    }
  });

  it('migrations idempotentes : re-exécution sans erreur ni doublon', async () => {
    const applied = await applyMigrations(sql);
    expect(applied).toEqual([]);
    const rows = await sql`SELECT count(*)::int AS count FROM schema_migrations`;
    expect(rows[0]?.count).toBe(1);
  });
});
