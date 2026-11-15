import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Le vrai worker ne doit jamais tourner dans ces tests : il se connecterait à la
// base DEV et enverait de vrais emails. Helper partagé : @/test/outbox-worker-mock.
vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import type { SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  ACTION_MODIFIER_INSCRIPTION,
  CHECKLIST_VALIDATION_EN_ATTENTE,
  acceptDocuments,
  decideDossier,
  getChecklistState,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';
import type { InscriptionFormInput } from './domain';

const testUrls = resolveTestDatabaseUrls('checklist');

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
    genre: 'H',
    wilaya: '16',
    pays: '',
    hebergement: '',
  };
}

describe.skipIf(testUrls === null)('checklist — intégration Postgres (base azzel_test)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app.
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: InscriptionsStore;

  beforeAll(async () => {
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createInscriptionsStore(app);
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
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
    expect(avant.statut).toBe('en validation');
    // En validation : tout est figé jusqu'à la décision, preuve comprise.
    expect(piece(avant, 'preuve').actionLabel).toBeUndefined();
    expect(piece(avant, 'epreuve').actionLabel).toBeUndefined();
    expect(piece(avant, 'validation').texteSecondaire).toBe(CHECKLIST_VALIDATION_EN_ATTENTE);
    expect(avant.recap).toMatchObject({
      epreuve: 'La Grande Boucle',
      distanceKm: 28,
      categorieAge: 'Senior (18–39 ans)',
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

  it('dossier refusé : motif + action « Modifier mon inscription »', async () => {
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
    expect(validation.actionLabel).toBe(ACTION_MODIFIER_INSCRIPTION);
    expect(validation.actionHref).toBe('/inscription');
    expect(piece(state, 'preuve').fait).toBe(false);
    expect(piece(state, 'preuve').actionLabel).toBeUndefined();
  });

  it('refusé, repris puis nouvelle preuve : la pièce validation repasse en attente', async () => {
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

    // Reprise par « Modifier mon inscription » : preuve refusée écartée.
    await submitInscription(session, validInput(), { store });
    const repris = await getChecklistState(session, { store });
    expect(repris.statut).toBe('en constitution');
    expect(piece(repris, 'preuve').fait).toBe(false);
    expect(piece(repris, 'preuve').actionHref).toBe('/preuve');
    expect(piece(repris, 'validation').motifRefus).toBeUndefined();

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
