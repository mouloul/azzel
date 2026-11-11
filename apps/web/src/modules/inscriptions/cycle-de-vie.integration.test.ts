import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

import type { InscriptionFormInput } from './domain';
import {
  DossierAReprendreError,
  DossierEnValidationError,
  DossierListeAttenteError,
  toPreuveApiError,
  DossierHorsValidationError,
  DossierValidatedError,
  toAdminApiError,
  toApiError,
} from './errors';
import { uploadPreuve } from './proof-service';
import { LocalDiskProofStore } from './proof-store';
import {
  ACTION_MODIFIER_INSCRIPTION,
  acceptDocuments,
  decideDossier,
  getChecklistState,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';

/**
 * Cycle de vie du dossier — matrice I/O de spec-dossier-refuse-modifiable.md
 * (décision PO du 11/11/2026), prouvée contre Postgres en rôle applicatif.
 */

const testUrls = resolveTestDatabaseUrls('cycle de vie du dossier');

const MIGRATION_0044 = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
  '0044_statut_en_validation.sql',
);

function validInput(overrides: Partial<InscriptionFormInput> = {}): InscriptionFormInput {
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
    ...overrides,
  };
}

function jpegBytes(size: number, remplissage = 0xab): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(remplissage, 11);
  return bytes;
}

interface LigneCoureur {
  id: string;
  status: string;
  refusal_reason: string | null;
  preuve_due_at: Date | null;
  expired_at: Date | null;
  hebergement: boolean;
  updated_at: Date;
}

describe.skipIf(testUrls === null)('cycle de vie du dossier — intégration Postgres', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: InscriptionsStore;
  let storageDir = '';
  let proofStore: LocalDiskProofStore;
  let organisationId: string;

  beforeAll(async () => {
    storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-cycle-it-'));
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createInscriptionsStore(app);
    proofStore = new LocalDiskProofStore(storageDir);
    const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
    organisationId = organisations[0]?.id as string;
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    if (storageDir) {
      rmSync(storageDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    await sql`UPDATE edition SET capacite = 600, capacite_hebergement = 200, delai_preuve_jours = 2`;
    await sql`DELETE FROM email_outbox`;
    await sql`DELETE FROM preuve`;
    await sql`DELETE FROM coureur`;
  });

  async function compte(role: 'coureur' | 'organisateur' = 'coureur'): Promise<SessionRecord> {
    const accountId = randomUUID();
    const email = `${role}-${accountId}@test.azzel`;
    await sql`
      INSERT INTO account (id, organisation_id, email, role)
      VALUES (${accountId}, ${organisationId}, ${email}, ${role})
    `;
    return { accountId, organisationId, email, role, createdAt: new Date() };
  }

  async function inscrit(input: Partial<InscriptionFormInput> = {}): Promise<SessionRecord> {
    const session = await compte();
    await submitInscription(session, validInput(input), { store });
    return session;
  }

  async function ligne(session: SessionRecord): Promise<LigneCoureur> {
    const rows = await sql<LigneCoureur[]>`
      SELECT id, status, refusal_reason, preuve_due_at, expired_at, hebergement, updated_at
      FROM coureur WHERE account_id = ${session.accountId}
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('coureur absent en base');
    }
    return row;
  }

  async function statutsPreuves(session: SessionRecord): Promise<string[]> {
    const rows = await sql<{ status: string }[]>`
      SELECT p.status FROM preuve p JOIN coureur c ON c.id = p.coureur_id
      WHERE c.account_id = ${session.accountId}
      ORDER BY p.created_at ASC
    `;
    return rows.map((row) => row.status);
  }

  /** Inscrit, accepte, dépose : dossier « en validation » complet. */
  async function enValidation(input: Partial<InscriptionFormInput> = {}): Promise<SessionRecord> {
    const session = await inscrit(input);
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });
    return session;
  }

  async function refuse(
    input: Partial<InscriptionFormInput> = {},
    motif = 'Reçu illisible',
  ): Promise<SessionRecord> {
    const session = await enValidation(input);
    await decideDossier(
      await compte('organisateur'),
      (await ligne(session)).id,
      { decision: 'refuser', motif },
      { store },
    );
    return session;
  }

  async function expire(input: Partial<InscriptionFormInput> = {}): Promise<SessionRecord> {
    const session = await inscrit(input);
    await sql`
      UPDATE coureur SET preuve_due_at = now() - interval '1 minute'
      WHERE account_id = ${session.accountId}
    `;
    await store.expirerInscriptionsEchues(new Date());
    expect((await ligne(session)).status).toBe('expirée');
    return session;
  }

  /** Remplit le contingent : toutes les places restantes partent à d'autres coureurs. */
  async function remplirContingent(): Promise<void> {
    const occupees = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM coureur
      WHERE status IN ('en constitution', 'en validation', 'validé')
    `;
    await sql`UPDATE edition SET capacite = ${occupees[0]?.n ?? 0}`;
  }

  it('dépôt de preuve : en constitution → en validation, dans la même transaction', async () => {
    const session = await inscrit();
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    expect((await ligne(session)).status).toBe('en constitution');

    await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });

    expect((await ligne(session)).status).toBe('en validation');
    expect(await statutsPreuves(session)).toEqual(['active']);
  });

  it('en validation : occupe sa place (le suivant part en liste d’attente)', async () => {
    await sql`UPDATE edition SET capacite = 1`;
    await enValidation();
    const suivant = await inscrit();
    expect((await ligne(suivant)).status).toBe('liste d’attente');
  });

  it('échéance passée en validation : reste en validation, aucune expiration', async () => {
    const session = await enValidation();
    await sql`
      UPDATE coureur SET preuve_due_at = now() - interval '1 day'
      WHERE account_id = ${session.accountId}
    `;

    const bilan = await store.expirerInscriptionsEchues(new Date());

    expect(bilan.expirees).toBe(0);
    expect((await ligne(session)).status).toBe('en validation');
  });

  it('échéance passée sans preuve : expirée, place rendue (inchangé)', async () => {
    await sql`UPDATE edition SET capacite = 1`;
    await expire();
    const suivant = await inscrit();
    expect((await ligne(suivant)).status).toBe('en constitution');
  });

  it('décision admin hors validation (refusé, expirée) : 409, rien ne change', async () => {
    const organisateur = await compte('organisateur');
    for (const session of [await refuse(), await expire()]) {
      const avant = await ligne(session);
      for (const decision of [
        { decision: 'valider' },
        { decision: 'refuser', motif: 'nouveau motif' },
      ]) {
        const error = await decideDossier(organisateur, avant.id, decision, { store }).catch(
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(DossierHorsValidationError);
        expect(toAdminApiError(error).status).toBe(409);
      }
      const apres = await ligne(session);
      expect(apres.status).toBe(avant.status);
      expect(apres.refusal_reason).toBe(avant.refusal_reason);
      expect(apres.updated_at.toISOString()).toBe(avant.updated_at.toISOString());
    }
  });

  it('modifier un refusé, place dispo : en constitution, nouvelle échéance, motif effacé, preuve refusée inactive', async () => {
    const session = await refuse();
    const avantReprise = Date.now();

    const resume = await submitInscription(session, validInput({ prenom: 'Yanis' }), { store });

    expect(resume.status).toBe('en constitution');
    const row = await ligne(session);
    expect(row.status).toBe('en constitution');
    expect(row.refusal_reason).toBeNull();
    // Nouvelle échéance J+délai à compter de la reprise, pas l'ancienne.
    expect(row.preuve_due_at).not.toBeNull();
    expect((row.preuve_due_at as Date).getTime()).toBeGreaterThan(avantReprise + 24 * 3600 * 1000);
    expect(await statutsPreuves(session)).toEqual(['refusée']);
    expect(
      await store.findActivePreuveByAccount(session.accountId, await editionId(), organisationId),
    ).toBeNull();
  });

  it('modifier un refusé ou un expiré, complet : liste d’attente, sans échéance', async () => {
    const refuseSession = await refuse();
    const expireSession = await expire();
    await remplirContingent();

    for (const session of [refuseSession, expireSession]) {
      await submitInscription(session, validInput(), { store });
      const row = await ligne(session);
      expect(row.status).toBe('liste d’attente');
      expect(row.preuve_due_at).toBeNull();
      expect(row.refusal_reason).toBeNull();
    }
  });

  it('modifier un expiré, place dispo : en constitution, nouvelle échéance, expired_at conservé', async () => {
    const session = await expire();
    const expireLe = (await ligne(session)).expired_at;
    expect(expireLe).not.toBeNull();

    await submitInscription(session, validInput(), { store });

    const row = await ligne(session);
    expect(row.status).toBe('en constitution');
    expect(row.expired_at?.toISOString()).toBe(expireLe?.toISOString());
    expect((row.preuve_due_at as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('reprise : le lit suit le contingent commun', async () => {
    await sql`UPDATE edition SET capacite_hebergement = 1`;
    const session = await refuse({ hebergement: 'oui' });
    expect((await ligne(session)).hebergement).toBe(true);
    // Refusé : le lit est rendu, un autre coureur le prend.
    const autre = await inscrit({ hebergement: 'oui' });
    expect((await ligne(autre)).hebergement).toBe(true);

    await submitInscription(session, validInput({ hebergement: 'oui' }), { store });

    const row = await ligne(session);
    expect(row.status).toBe('en constitution');
    expect(row.hebergement).toBe(false);
  });

  it('modifier en validation : 409 figé ; remplacement de preuve accepté, reste en validation', async () => {
    const session = await enValidation();
    const avant = await ligne(session);

    const error = await submitInscription(session, validInput({ prenom: 'Autre' }), {
      store,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DossierEnValidationError);
    const apiError = toApiError(error);
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('inscriptions.dossier_en_validation');
    expect(apiError.envelope.error.message).not.toContain('validé');
    const apres = await ligne(session);
    expect(apres.updated_at.toISOString()).toBe(avant.updated_at.toISOString());

    await uploadPreuve(session, jpegBytes(25_000, 0x11), { store, proofStore });
    expect((await ligne(session)).status).toBe('en validation');
    expect(await statutsPreuves(session)).toEqual(['replaced', 'active']);
  });

  it('modifier un validé : 409 « Dossier déjà validé »', async () => {
    const session = await enValidation();
    await decideDossier(
      await compte('organisateur'),
      (await ligne(session)).id,
      { decision: 'valider' },
      { store },
    );

    const error = await submitInscription(session, validInput(), { store }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(DossierValidatedError);
    expect(toApiError(error).status).toBe(409);
    expect((await ligne(session)).status).toBe('validé');
  });

  it('espace coureur refusé : motif visible et action « Modifier mon inscription »', async () => {
    const session = await refuse({}, 'Montant incomplet');

    const state = await getChecklistState(session, { store });

    expect(state.statut).toBe('refusé');
    const validation = state.pieces.find((piece) => piece.id === 'validation');
    expect(validation?.motifRefus).toBe('Montant incomplet');
    expect(validation?.actionLabel).toBe(ACTION_MODIFIER_INSCRIPTION);
    expect(validation?.actionHref).toBe('/inscription');
    // Seule action proposée : aucun dépôt, aucune acceptation.
    const actions = state.pieces.filter((piece) => piece.actionHref != null);
    expect(actions.map((piece) => piece.actionHref)).toEqual(['/inscription']);
  });

  it('espace coureur expiré : action « Modifier mon inscription »', async () => {
    const session = await expire();

    const state = await getChecklistState(session, { store });

    const validation = state.pieces.find((piece) => piece.id === 'validation');
    expect(validation?.actionLabel).toBe(ACTION_MODIFIER_INSCRIPTION);
    expect(validation?.actionHref).toBe('/inscription');
    const actions = state.pieces.filter((piece) => piece.actionHref != null);
    expect(actions.map((piece) => piece.actionHref)).toEqual(['/inscription']);
  });

  it('migration 0044 : rejouable, aucun dossier avec preuve active ne reste en constitution', async () => {
    // Situation héritée : preuve active sur un dossier resté « en constitution ».
    const session = await inscrit();
    const coureur = await ligne(session);
    await sql`
      INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
      VALUES (${organisationId}, ${coureur.id}, 'k-legacy', 'image/jpeg', 1024, 'legacy', 'active')
    `;
    const sansPreuve = await inscrit();
    expect((await ligne(session)).status).toBe('en constitution');

    const contenu = await readFile(MIGRATION_0044, 'utf8');
    await sql.unsafe(contenu);
    await sql.unsafe(contenu);

    expect((await ligne(session)).status).toBe('en validation');
    expect((await ligne(sansPreuve)).status).toBe('en constitution');
    const restants = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM coureur c
      WHERE c.status = 'en constitution'
        AND EXISTS (SELECT 1 FROM preuve p WHERE p.coureur_id = c.id AND p.status = 'active')
    `;
    expect(restants[0]?.n).toBe(0);
  });

  it('dépôt sur un dossier expiré : 409 « à reprendre », message qui dit « expiré »', async () => {
    const session = await expire();
    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(DossierAReprendreError);

    const error = await uploadPreuve(session, jpegBytes(20_000), { store, proofStore }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(DossierAReprendreError);
    const apiError = toPreuveApiError(error);
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.message).toContain('expiré');
    expect((await ligne(session)).status).toBe('expirée');
  });

  it('liste d’attente : dépôt et acceptations → 409 dédié, jamais « déjà validé »', async () => {
    await sql`UPDATE edition SET capacite = 0`;
    const session = await inscrit();
    expect((await ligne(session)).status).toBe('liste d’attente');

    for (const action of [
      () => acceptDocuments(session, { decharge: true, reglement: true }, { store }),
      () => uploadPreuve(session, jpegBytes(20_000), { store, proofStore }),
    ]) {
      const error = await action().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DossierListeAttenteError);
      const apiError = toApiError(error);
      expect(apiError.status).toBe(409);
      expect(apiError.envelope.error.code).toBe('inscriptions.dossier_liste_attente');
      expect(apiError.envelope.error.message).not.toContain('validé');
    }
  });

  it('second cycle : un dossier repris reçoit un second rappel et un second email d’expiration', async () => {
    async function compter(type: string, session: SessionRecord): Promise<number> {
      const coureurId = (await ligne(session)).id;
      const rows = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM email_outbox
        WHERE type = ${type} AND payload ->> 'coureurId' = ${coureurId}
      `;
      return rows[0]?.n ?? 0;
    }
    async function cycle(session: SessionRecord): Promise<void> {
      await sql`
        UPDATE coureur SET preuve_due_at = now() + interval '20 hours'
        WHERE account_id = ${session.accountId}
      `;
      await store.enfilerRappelsPreuve(new Date());
      // Rejeu du cron horaire à la même échéance : aucun doublon.
      await store.enfilerRappelsPreuve(new Date());
      await sql`
        UPDATE coureur SET preuve_due_at = now() - interval '1 minute'
        WHERE account_id = ${session.accountId}
      `;
      await store.expirerInscriptionsEchues(new Date());
      await store.expirerInscriptionsEchues(new Date());
      expect((await ligne(session)).status).toBe('expirée');
    }

    const session = await inscrit();
    await cycle(session);
    expect(await compter('rappel_preuve', session)).toBe(1);
    expect(await compter('inscription_expiree', session)).toBe(1);

    await submitInscription(session, validInput(), { store });
    expect((await ligne(session)).status).toBe('en constitution');
    await cycle(session);

    expect(await compter('rappel_preuve', session)).toBe(2);
    expect(await compter('inscription_expiree', session)).toBe(2);
  });

  async function editionId(): Promise<string> {
    const rows = await sql<{ id: string }[]>`SELECT id FROM edition WHERE slug = '2027'`;
    return rows[0]?.id as string;
  }
});
