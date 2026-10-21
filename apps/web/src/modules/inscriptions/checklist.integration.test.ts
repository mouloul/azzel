import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '@/modules/iam/env';
import type { SessionRecord } from '@/modules/iam/store';

import { applyAllMigrations } from './migrate';
import {
  CHECKLIST_VALIDATION_EN_ATTENTE,
  acceptDocuments,
  decideDossier,
  getChecklistState,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';
import type { InscriptionFormInput } from './domain';

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
  console.warn('intégration checklist SKIPPÉE — bash scripts/dev-db.sh up pour l’activer');
}

const RACE_DATE = '2027-03-26';

function validInput(): InscriptionFormInput {
  return {
    epreuve: 'longue',
    prenom: 'Yani',
    nom: 'Ulahianne',
    telephone: '+213 555 010 203',
    contactUrgenceNom: 'Lounis Ulahianne',
    contactUrgenceTelephone: '0555 010 204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
  };
}

describe.skipIf(serverUrl === null)('checklist — intégration Postgres (base azzel_test)', () => {
  const baseUrl = serverUrl as URL;
  let sql: postgres.Sql;
  let store: InscriptionsStore;

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
    await applyAllMigrations(sql);
    store = createInscriptionsStore(sql);
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  });

  async function createSession(
    role: 'coureur' | 'organisateur' = 'coureur',
  ): Promise<SessionRecord> {
    const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
    const organisation = organisations[0];
    if (!organisation) {
      throw new Error('organisation seed « ait-aissi » absente');
    }
    const accountId = randomUUID();
    await sql`
      INSERT INTO account (id, organisation_id, email)
      VALUES (${accountId}, ${organisation.id}, ${`${role}-${accountId}@test.azzel`})
    `;
    return {
      accountId,
      organisationId: organisation.id,
      email: `${role}-${accountId}@test.azzel`,
      role,
      createdAt: new Date(),
    };
  }

  function piece(state: Awaited<ReturnType<typeof getChecklistState>>, id: string) {
    const found = state.pieces.find((candidate) => candidate.id === id);
    if (!found) {
      throw new Error(`pièce ${id} absente`);
    }
    return found;
  }

  async function deposerPreuveActive(session: SessionRecord, sha256 = randomUUID()) {
    const editions = await sql`SELECT id FROM edition WHERE slug = '2027'`;
    const edition = editions[0];
    if (!edition) {
      throw new Error('édition seed « 2027 » absente');
    }
    const saved = await store.savePreuve({
      organisationId: session.organisationId,
      accountId: session.accountId,
      editionId: edition.id as string,
      file: {
        storageKey: `preuves/${randomUUID()}.jpg`,
        mime: 'image/jpeg',
        sizeBytes: 2048,
        sha256,
      },
    });
    expect(saved.preuve.status).toBe('active');
    return saved.preuve;
  }

  it('non inscrit : email vérifié seul au vert, les autres pièces en action', async () => {
    const session = await createSession();
    const state = await getChecklistState(session, { store });

    expect(state.edition?.slug).toBe('2027');
    expect(state.pieces.map((entry) => entry.id)).toEqual([
      'email',
      'epreuve',
      'decharge',
      'reglement',
      'preuve',
      'validation',
    ]);
    expect(state.pieces.filter((entry) => entry.fait)).toHaveLength(1);
    expect(piece(state, 'email').fait).toBe(true);
    expect(piece(state, 'epreuve').actionLabel).toBe('M’inscrire à l’édition 2027');
    expect(piece(state, 'epreuve').actionHref).toBe('/inscription');
    expect(piece(state, 'decharge').actionLabel).toBe('Accepter la décharge et le règlement');
    expect(piece(state, 'decharge').actionHref).toBe('/acceptations');
    expect(piece(state, 'reglement').actionLabel).toBe('Les deux documents s’acceptent ensemble');
    expect(piece(state, 'reglement').actionHref).toBeUndefined();
    expect(piece(state, 'preuve').actionLabel).toBe('Dépose ta preuve de paiement CCP');
    expect(piece(state, 'preuve').actionHref).toBe('/preuve');
    expect(piece(state, 'validation').actionLabel).toBeUndefined();
    expect(piece(state, 'validation').motifRefus).toBeUndefined();
    expect(piece(state, 'validation').texteSecondaire).toBeUndefined();
    expect(state.recap).toBeNull();
  });

  it('parcours complet : inscription, acceptations, preuve puis validation → 6/6 avec récap', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    await deposerPreuveActive(session);

    const avant = await getChecklistState(session, { store });
    expect(avant.pieces.filter((entry) => entry.fait)).toHaveLength(5);
    expect(piece(avant, 'preuve').actionLabel).toBe('Remplacer ma preuve de paiement');
    expect(piece(avant, 'epreuve').actionLabel).toBe('Modifier mon inscription');
    expect(piece(avant, 'validation').texteSecondaire).toBe(CHECKLIST_VALIDATION_EN_ATTENTE);
    expect(avant.recap).toMatchObject({
      epreuve: 'La Longue — 35 km',
      distanceKm: 35,
      categorieAge: 'Senior (20–39 ans)',
      tshirt: 'M',
      contactUrgenceNom: 'Lounis Ulahianne',
      dateCourse: RACE_DATE,
    });

    const organisateur = await createSession('organisateur');
    await decideDossier(organisateur, summary.id, { decision: 'valider' }, { store });

    const apres = await getChecklistState(session, { store });
    expect(apres.pieces.every((entry) => entry.fait)).toBe(true);
    expect(piece(apres, 'validation').fait).toBe(true);
  });

  it('dossier refusé : motif + action « Déposer une nouvelle preuve »', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    await deposerPreuveActive(session);

    const organisateur = await createSession('organisateur');
    await decideDossier(
      organisateur,
      summary.id,
      { decision: 'refuser', motif: 'reçu illisible' },
      { store },
    );

    const state = await getChecklistState(session, { store });
    const validation = piece(state, 'validation');
    expect(validation.fait).toBe(false);
    expect(validation.motifRefus).toBe('reçu illisible');
    expect(validation.actionLabel).toBe('Déposer une nouvelle preuve');
    expect(validation.actionHref).toBe('/preuve');
    expect(piece(state, 'preuve').fait).toBe(true);
    expect(piece(state, 'preuve').actionLabel).toBe('Remplacer ma preuve de paiement');
  });

  it('refusé puis redépôt de preuve : la pièce validation repasse en attente', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    await deposerPreuveActive(session, randomUUID());

    const organisateur = await createSession('organisateur');
    await decideDossier(
      organisateur,
      summary.id,
      { decision: 'refuser', motif: 'reçu illisible' },
      { store },
    );
    const refuse = await getChecklistState(session, { store });
    expect(piece(refuse, 'validation').motifRefus).toBe('reçu illisible');

    await deposerPreuveActive(session, randomUUID());

    const state = await getChecklistState(session, { store });
    const validation = piece(state, 'validation');
    expect(validation.fait).toBe(false);
    expect(validation.motifRefus).toBeUndefined();
    expect(validation.actionLabel).toBeUndefined();
    expect(validation.texteSecondaire).toBe(CHECKLIST_VALIDATION_EN_ATTENTE);
    expect(piece(state, 'preuve').fait).toBe(true);
  });

  it('lecture seule : getChecklistState ne modifie aucune ligne', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    await deposerPreuveActive(session);

    const avant = await sql`
      SELECT status, refusal_reason, decharge_version, updated_at FROM coureur WHERE id = ${summary.id}
    `;
    await getChecklistState(session, { store });
    await getChecklistState(session, { store });
    const apres = await sql`
      SELECT status, refusal_reason, decharge_version, updated_at FROM coureur WHERE id = ${summary.id}
    `;
    expect(apres[0]?.status).toBe(avant[0]?.status);
    expect(apres[0]?.refusal_reason).toBe(avant[0]?.refusal_reason);
    expect(apres[0]?.decharge_version).toBe(avant[0]?.decharge_version);
    expect((apres[0]?.updated_at as Date).toISOString()).toBe(
      (avant[0]?.updated_at as Date).toISOString(),
    );

    const preuves = await sql`
      SELECT count(*)::int AS count FROM preuve WHERE coureur_id = ${summary.id}
    `;
    expect(preuves[0]?.count).toBe(1);
  });

  it('inscriptions fermées : checklist lisible, actions inscription/preuve neutralisées', async () => {
    const session = await createSession();
    try {
      await sql`UPDATE edition SET registration_closes_at = now() - interval '1 day'`;
      const state = await getChecklistState(session, { store });

      expect(state.edition?.registrationOpen).toBe(false);
      expect(state.pieces).toHaveLength(6);
      expect(piece(state, 'email').fait).toBe(true);
      for (const id of ['epreuve', 'preuve'] as const) {
        expect(piece(state, id).actionLabel, id).toBe('Inscriptions fermées');
        expect(piece(state, id).actionHref, id).toBeUndefined();
      }
      expect(piece(state, 'decharge').actionHref).toBe('/acceptations');
    } finally {
      await sql`UPDATE edition SET registration_closes_at = TIMESTAMPTZ '2027-03-16T22:59:59Z'`;
    }
  });
});
