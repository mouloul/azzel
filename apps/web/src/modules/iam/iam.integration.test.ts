import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resetOrganisationIdMemoForTests, withOrg } from '@/db/org-scope';
import { applyAllMigrations, MIGRATION_DIRS } from '@/modules/inscriptions/migrate';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  CODE_REQUEST_IP_WINDOW_MS,
  CODE_REQUEST_WINDOW_MS,
  MAX_CODE_REQUESTS_PER_IP,
} from './constants';
import {
  CodeExhaustedError,
  DbUnavailableError,
  InvalidCodeError,
  RateLimitedError,
} from './errors';
import {
  getSession,
  logout,
  requestLoginCode,
  verifyLoginCode,
  sha256Hex,
  type SendCodeFn,
} from './service';
import { createIamStore, type IamStore } from './store';

const testUrls = resolveTestDatabaseUrls('iam');

function uniqueEmail(): string {
  return `coureur-${randomUUID()}@test.azzel`;
}

/** Nombre de fichiers .sql de tous les dossiers de migrations du runner. */
async function countMigrationFiles(): Promise<number> {
  let total = 0;
  for (const dir of MIGRATION_DIRS) {
    const names = await readdir(dir);
    total += names.filter((name) => name.endsWith('.sql')).length;
  }
  return total;
}

describe.skipIf(testUrls === null)('iam — intégration Postgres (base azzel_test)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app
  // des stores — le RLS de la story 1.9 s'y applique réellement.
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: IamStore;

  beforeAll(async () => {
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createIamStore(app);
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
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

  it('logout : session révoquée puis introuvable, re-révocation idempotente', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });
    const session = await verifyLoginCode(email, capture.getCode(), { store });
    expect(await getSession(session.token, { store })).not.toBeNull();

    await logout(session.token, { store });
    expect(await getSession(session.token, { store })).toBeNull();

    // Idempotent : revokeSessionByTokenHash ré-exécuté ne lève pas et ne change rien.
    await expect(
      store.revokeSessionByTokenHash(sha256Hex(session.token)),
    ).resolves.toBeUndefined();
    expect(await getSession(session.token, { store })).toBeNull();
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
    resetOrganisationIdMemoForTests();
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
    const applied = await applyAllMigrations(sql);
    expect(applied).toEqual([]);
    const rows = await sql`SELECT count(*)::int AS count FROM schema_migrations`;
    // Comptage dynamique : le nombre de migrations change à chaque story, et une
    // constante en dur ici fait échouer la suite pour une raison sans rapport.
    expect(rows[0]?.count).toBe(await countMigrationFiles());
  });

  it('rôle : coureur par défaut, la session porte le rôle', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    const session = await verifyLoginCode(email, capture.getCode(), { store });
    const found = await getSession(session.token, { store });
    expect(found?.role).toBe('coureur');

    const accounts = await sql`SELECT role FROM account WHERE email = ${email}`;
    expect(accounts[0]?.role).toBe('coureur');
  });

  it('promotion AZZEL_ADMIN_EMAILS : email listé promu organisateur à la connexion', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    const outcome = await store.verifyCodeAndStartSession({
      email,
      codeHash: sha256Hex(capture.getCode()),
      tokenHash: sha256Hex(`token-promotion-${randomUUID()}`),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      adminEmails: [email],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.role).toBe('organisateur');
    }

    const accounts = await sql`SELECT role FROM account WHERE email = ${email}`;
    expect(accounts[0]?.role).toBe('organisateur');

    const sessions = await sql`
      SELECT s.token_hash FROM session s JOIN account a ON a.id = s.account_id
      WHERE a.email = ${email} AND s.revoked_at IS NULL LIMIT 1
    `;
    const record = await store.findSessionByTokenHash(sessions[0]?.token_hash as string);
    expect(record?.role).toBe('organisateur');
  });

  it('promotion idempotente : reconnexion sans adminEmails ne rétrograde pas', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });
    await store.verifyCodeAndStartSession({
      email,
      codeHash: sha256Hex(capture.getCode()),
      tokenHash: sha256Hex(`token-premiere-${randomUUID()}`),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      adminEmails: [email],
    });

    const second = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: second.sendCode });
    const outcome = await store.verifyCodeAndStartSession({
      email,
      codeHash: sha256Hex(second.getCode()),
      tokenHash: sha256Hex(`token-seconde-${randomUUID()}`),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      adminEmails: [],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.role).toBe('organisateur');
    }

    const accounts = await sql`SELECT role FROM account WHERE email = ${email}`;
    expect(accounts[0]?.role).toBe('organisateur');
  });

  it('email non listé : reste coureur même si d’autres sont promus', async () => {
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    const outcome = await store.verifyCodeAndStartSession({
      email,
      codeHash: sha256Hex(capture.getCode()),
      tokenHash: sha256Hex(`token-tierce-${randomUUID()}`),
      sessionExpiresAt: new Date(Date.now() + 60_000),
      adminEmails: ['organisateur@exemple.dz'],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.role).toBe('coureur');
    }
  });

  it('câblage service : AZZEL_ADMIN_EMAILS posé → verifyLoginCode promu organisateur', async () => {
    const previous = process.env.AZZEL_ADMIN_EMAILS;
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    try {
      process.env.AZZEL_ADMIN_EMAILS = `Autre@Exemple.DZ, ${email.toUpperCase()}`;
      const session = await verifyLoginCode(email, capture.getCode(), { store });
      const found = await getSession(session.token, { store });
      expect(found?.role).toBe('organisateur');
      const accounts = await sql`SELECT role FROM account WHERE email = ${email}`;
      expect(accounts[0]?.role).toBe('organisateur');
    } finally {
      if (previous === undefined) {
        delete process.env.AZZEL_ADMIN_EMAILS;
      } else {
        process.env.AZZEL_ADMIN_EMAILS = previous;
      }
    }
  });

  it('câblage service : sans AZZEL_ADMIN_EMAILS → verifyLoginCode reste coureur', async () => {
    const previous = process.env.AZZEL_ADMIN_EMAILS;
    const email = uniqueEmail();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });

    try {
      delete process.env.AZZEL_ADMIN_EMAILS;
      const session = await verifyLoginCode(email, capture.getCode(), { store });
      const found = await getSession(session.token, { store });
      expect(found?.role).toBe('coureur');
    } finally {
      if (previous !== undefined) {
        process.env.AZZEL_ADMIN_EMAILS = previous;
      }
    }
  });
  // --- Correctifs sécurité stories 1.2 / 1.9 ---------------------------------

  async function createOrganisation(): Promise<string> {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO organisation (slug, name)
      VALUES (${`org-${randomUUID()}`}, 'Organisation de test')
      RETURNING id
    `;
    return rows[0]?.id as string;
  }

  it('isolation : un code demandé dans l’organisation B n’invalide pas celui de A', async () => {
    const email = uniqueEmail();
    const orgA = await store.getDefaultOrganisationId();
    const orgB = await createOrganisation();
    const now = Date.now();
    const commun = {
      email,
      expiresAt: new Date(now + 600_000),
      perEmailCutoff: new Date(now - CODE_REQUEST_WINDOW_MS),
      hourlyCutoff: new Date(now - 3_600_000),
    };

    await store.insertLoginCode({ ...commun, organisationId: orgA, codeHash: sha256Hex('111111') });
    await store.insertLoginCode({ ...commun, organisationId: orgB, codeHash: sha256Hex('222222') });

    const codeA = await sql`
      SELECT invalidated_at FROM login_code
      WHERE email = ${email} AND organisation_id = ${orgA}
    `;
    expect(codeA.length).toBe(1);
    expect(codeA[0]?.invalidated_at).toBeNull();
  });

  it('isolation : la limitation par email est comptée par organisation', async () => {
    const email = uniqueEmail();
    const orgB = await createOrganisation();
    for (let demande = 0; demande < 3; demande += 1) {
      await requestLoginCode(email, { store, sendCode: noopSendCode });
    }
    await expect(
      requestLoginCode(email, { store, sendCode: noopSendCode }),
    ).rejects.toBeInstanceOf(RateLimitedError);

    // Même adresse, autre organisation : quota intact (le compteur est scopé).
    const now = Date.now();
    await expect(
      store.insertLoginCode({
        organisationId: orgB,
        email,
        codeHash: sha256Hex('333333'),
        expiresAt: new Date(now + 600_000),
        perEmailCutoff: new Date(now - CODE_REQUEST_WINDOW_MS),
        hourlyCutoff: new Date(now - 3_600_000),
      }),
    ).resolves.toBeUndefined();
  });

  it('RLS : sous le GUC d’une organisation, les login_code et session des autres sont invisibles', async () => {
    const email = uniqueEmail();
    const orgA = await store.getDefaultOrganisationId();
    const orgB = await createOrganisation();
    const capture = await captureSendCode();
    await requestLoginCode(email, { store, sendCode: capture.sendCode });
    await verifyLoginCode(email, capture.getCode(), { store });

    const vuDepuisB = await withOrg(app, orgB, async (tx) => {
      const codes = await tx`SELECT id FROM login_code WHERE email = ${email}`;
      const sessions = await tx`
        SELECT s.id FROM session s WHERE s.organisation_id = ${orgA}
      `;
      return { codes: codes.length, sessions: sessions.length };
    });
    expect(vuDepuisB).toEqual({ codes: 0, sessions: 0 });

    const vuDepuisA = await withOrg(app, orgA, async (tx) => {
      const codes = await tx`SELECT id FROM login_code WHERE email = ${email}`;
      return codes.length;
    });
    expect(vuDepuisA).toBe(1);
  });

  it('RLS : écrire une ligne d’une autre organisation est refusé (FORCE RLS)', async () => {
    const orgA = await store.getDefaultOrganisationId();
    const orgB = await createOrganisation();
    await expect(
      withOrg(app, orgB, async (tx) => {
        await tx`
          INSERT INTO login_code (organisation_id, email, code_hash, expires_at)
          VALUES (${orgA}, ${uniqueEmail()}, ${sha256Hex('444444')}, now() + interval '10 minutes')
        `;
      }),
    ).rejects.toThrow();
  });

  it('quota par IP : au-delà du seuil, la demande est refusée même avec des emails différents', async () => {
    const ipHash = sha256Hex(`ip-test-${randomUUID()}`);
    const cutoff = (): Date => new Date(Date.now() - CODE_REQUEST_IP_WINDOW_MS);
    for (let demande = 0; demande < MAX_CODE_REQUESTS_PER_IP; demande += 1) {
      await store.recordCodeRequestIp({ ipHash, cutoff: cutoff() });
    }
    try {
      await store.recordCodeRequestIp({ ipHash, cutoff: cutoff() });
      expect.unreachable('la demande au-delà du seuil devait être refusée');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).retryAfterSec).toBeGreaterThan(0);
    }

    // Une autre IP n’est pas affectée : le quota borne l’auteur, pas le service.
    await expect(
      store.recordCodeRequestIp({ ipHash: sha256Hex(randomUUID()), cutoff: cutoff() }),
    ).resolves.toBeUndefined();
  });

  it('quota par IP : demandes parallèles bornées par le verrou consultatif', async () => {
    const ipHash = sha256Hex(`ip-parallele-${randomUUID()}`);
    const cutoff = new Date(Date.now() - CODE_REQUEST_IP_WINDOW_MS);
    const results = await Promise.allSettled(
      Array.from({ length: MAX_CODE_REQUESTS_PER_IP + 3 }, () =>
        store.recordCodeRequestIp({ ipHash, cutoff }),
      ),
    );
    const acceptees = results.filter((result) => result.status === 'fulfilled');
    expect(acceptees.length).toBe(MAX_CODE_REQUESTS_PER_IP);
    const rows = await sql`
      SELECT count(*)::int AS count FROM login_code_ip_request WHERE ip_hash = ${ipHash}
    `;
    expect(rows[0]?.count).toBe(MAX_CODE_REQUESTS_PER_IP);
  });
});
