import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

import {
  AcceptationsManquantesError,
  DecisionInvalidError,
  DossierAReprendreError,
  DossierEnValidationError,
  DossierHorsValidationError,
  DossierIncompletError,
  DossierNotFoundError,
  DossierValidatedError,
  PreuveIdenticalRefusedError,
  PreuveNotFoundError,
  PreuveStorageError,
  RefusalReasonRequiredError,
  RefusalReasonTooLongError,
  toAdminApiError,
  toApiError,
  toPreuveApiError,
} from './errors';
import { LocalDiskProofStore } from './proof-store';
import { readPreuveForOrganisation, uploadPreuve } from './proof-service';
import {
  acceptDocuments,
  decideDossier,
  getDossierDetail,
  getDossiersState,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';
import type { InscriptionFormInput } from './domain';

const testUrls = resolveTestDatabaseUrls('dossiers admin');

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

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

describe.skipIf(testUrls === null)(
  'dossiers admin — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app.
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let store: InscriptionsStore;
    let storageDir = '';
    let proofStore: LocalDiskProofStore;
    let organisationId: string;
    let editionId: string;

    beforeAll(async () => {
      // Répertoire temporaire posé avant toute autre chose : afterAll reste sûr si la
      // suite échoue plus loin (base injoignable, etc.).
      storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-admin-it-'));
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      store = createInscriptionsStore(app);
      proofStore = new LocalDiskProofStore(storageDir);

      const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      organisationId = organisations[0]?.id as string;
      const editions = await sql`SELECT id FROM edition WHERE slug = '2027'`;
      editionId = editions[0]?.id as string;
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
      if (sql) {
        await sql`UPDATE edition SET registration_closes_at = TIMESTAMPTZ '2027-03-16T22:59:59Z'`;
      }
    });

    /**
     * Coureur inscrit. Par défaut, décharge et règlement acceptés : la preuve
     * ne se dépose qu'après eux (PO, 11/11/2026).
     */
    async function createCoureurSession(
      input: Partial<InscriptionFormInput> = {},
      { accepter = true }: { accepter?: boolean } = {},
    ): Promise<SessionRecord> {
      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${`coureur-${accountId}@test.azzel`}, 'coureur')
      `;
      const session: SessionRecord = {
        accountId,
        organisationId,
        email: `coureur-${accountId}@test.azzel`,
        role: 'coureur',
        createdAt: new Date(),
      };
      await submitInscription(session, validInput(input), { store });
      if (accepter) {
        await acceptDocuments(session, { decharge: true, reglement: true }, { store });
      }
      return session;
    }

    /**
     * Dossier complet au sens des stories 1.4 et 1.6 : preuve active + les deux
     * acceptations. Préalable obligatoire à toute validation.
     */
    async function completerDossier(session: SessionRecord): Promise<void> {
      await acceptDocuments(session, { decharge: true, reglement: true }, { store });
      await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });
    }

    async function organisateurSession(): Promise<SessionRecord> {
      const accountId = randomUUID();
      const email = `organisateur-${accountId}@test.azzel`;
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${email}, 'organisateur')
      `;
      return {
        accountId,
        organisationId,
        email,
        role: 'organisateur',
        createdAt: new Date(),
      };
    }

    async function coureurRow(coureurId: string) {
      const rows = await sql`
        SELECT status, refusal_reason, updated_at FROM coureur WHERE id = ${coureurId}
      `;
      return rows[0];
    }

    async function coureurIdFor(accountId: string): Promise<string> {
      const rows = await sql`SELECT id FROM coureur WHERE account_id = ${accountId}`;
      const row = rows[0];
      if (!row) {
        throw new Error('coureur absent en base');
      }
      return row.id as string;
    }

    it('CHECK SQL : refus sans motif rejeté, motif sans refus rejeté, statuts bornés', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);

      await expect(
        sql`UPDATE coureur SET status = 'refusé' WHERE id = ${coureurId}`,
      ).rejects.toThrow();

      await expect(
        sql`UPDATE coureur SET status = 'validé', refusal_reason = 'motif orphelin' WHERE id = ${coureurId}`,
      ).rejects.toThrow();

      await expect(
        sql`UPDATE coureur SET status = 'annulé' WHERE id = ${coureurId}`,
      ).rejects.toThrow();

      await expect(
        sql`UPDATE coureur SET status = 'en constitution', refusal_reason = 'motif orphelin' WHERE id = ${coureurId}`,
      ).rejects.toThrow();

      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('en constitution');
      expect(row?.refusal_reason).toBeNull();
    });

    it('validation : en validation → validé, horodaté, sans motif, traçabilité décidée par', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await completerDossier(session);
      const organisateur = await organisateurSession();
      const before = new Date();

      const summary = await decideDossier(organisateur, coureurId, {
        decision: 'valider',
      }, { store });

      expect(summary.status).toBe('validé');
      expect(summary.refusalReason).toBeNull();
      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('validé');
      expect(row?.refusal_reason).toBeNull();
      // Marge d'horloge 1 s : updated_at vient de now() côté Postgres (VM Docker),
      // dont l'horloge peut dériver légèrement de celle de l'hôte.
      expect((row?.updated_at as Date).getTime()).toBeGreaterThanOrEqual(
        before.getTime() - 1000,
      );
      const trace = await sql`
        SELECT decided_by, decided_at, a.email FROM coureur c
        JOIN account a ON a.id = c.decided_by WHERE c.id = ${coureurId}
      `;
      expect(trace[0]?.decided_by).toBe(organisateur.accountId);
      expect(trace[0]?.decided_at).not.toBeNull();
      expect(trace[0]?.email).toBe(organisateur.email);
      const detail = await getDossierDetail(organisateur, coureurId, { store });
      expect(detail?.decidePar?.email).toBe(organisateur.email);
    });

    it('décision sur un dossier en constitution (sans preuve) : 409 hors validation, rien ne change', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await acceptDocuments(session, { decharge: true, reglement: true }, { store });
      const before = await coureurRow(coureurId);

      for (const decision of [
        { decision: 'valider' },
        { decision: 'refuser', motif: 'aucune preuve déposée' },
      ]) {
        const error = await decideDossier(
          await organisateurSession(),
          coureurId,
          decision,
          { store },
        ).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(DossierHorsValidationError);
        const apiError = toAdminApiError(error);
        expect(apiError.status).toBe(409);
        expect(apiError.envelope.error.code).toBe('admin.dossier_hors_validation');
        expect(apiError.envelope.error.message).toContain('en constitution');
      }

      const after = await coureurRow(coureurId);
      expect(after?.status).toBe('en constitution');
      expect(after?.refusal_reason).toBeNull();
      expect((after?.updated_at as Date).toISOString()).toBe(
        (before?.updated_at as Date).toISOString(),
      );
    });

    it('dépôt sans acceptations : 409 nommé, renvoi vers les acceptations, dossier inchangé', async () => {
      const session = await createCoureurSession({}, { accepter: false });
      const coureurId = await coureurIdFor(session.accountId);

      const error = await uploadPreuve(session, jpegBytes(21_000), { store, proofStore }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(AcceptationsManquantesError);
      const apiError = toPreuveApiError(error);
      expect(apiError.status).toBe(409);
      expect(apiError.envelope.error.code).toBe('preuve.acceptations_manquantes');
      expect(apiError.envelope.error.action).toContain('/acceptations');
      expect((await coureurRow(coureurId))?.status).toBe('en constitution');
      const preuves = await sql`SELECT count(*)::int AS n FROM preuve WHERE coureur_id = ${coureurId}`;
      expect(preuves[0]?.n).toBe(0);
    });

    it('en validation : aucune acceptation possible, le dossier est figé', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await uploadPreuve(session, jpegBytes(21_500), { store, proofStore });
      expect((await coureurRow(coureurId))?.status).toBe('en validation');

      const error = await acceptDocuments(
        session,
        { decharge: true, reglement: true },
        { store },
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DossierEnValidationError);
      expect(toApiError(error).envelope.error.code).toBe('inscriptions.dossier_en_validation');
      expect((await coureurRow(coureurId))?.status).toBe('en validation');
    });

    it('défense en profondeur : en validation SANS preuve active (donnée forcée) → DossierIncompletError', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await sql`UPDATE coureur SET status = 'en validation' WHERE id = ${coureurId}`;

      const error = await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'valider' },
        { store },
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DossierIncompletError);
      expect((error as DossierIncompletError).pieces).toEqual(['preuve']);
      expect((await coureurRow(coureurId))?.status).toBe('en validation');
    });

    it('défense en profondeur : en validation SANS acceptations (donnée héritée) → validation refusée, refus possible', async () => {
      const session = await createCoureurSession({}, { accepter: false });
      const coureurId0 = await coureurIdFor(session.accountId);
      // Situation antérieure à la règle « acceptations avant preuve » : preuve
      // active posée sans acceptations, dossier migré en validation.
      await sql`
        INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
        VALUES (${organisationId}, ${coureurId0}, ${`${randomUUID()}.jpg`}, 'image/jpeg', 1024, ${randomUUID()}, 'active')
      `;
      await sql`UPDATE coureur SET status = 'en validation' WHERE id = ${coureurId0}`;
      const incomplet = await decideDossier(
        await organisateurSession(),
        coureurId0,
        { decision: 'valider' },
        { store },
      ).catch((caught: unknown) => caught);
      expect(incomplet).toBeInstanceOf(DossierIncompletError);
      expect((incomplet as DossierIncompletError).pieces).toEqual(['decharge', 'reglement']);
      expect(toAdminApiError(incomplet).envelope.error.code).toBe('admin.dossier_incomplet');

      const summary = await decideDossier(
        await organisateurSession(),
        coureurId0,
        { decision: 'refuser', motif: 'acceptations manquantes' },
        { store },
      );

      expect(summary.status).toBe('refusé');
    });

    it('refus sans motif : RefusalReasonRequiredError (400 admin), rien ne change en base', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      const before = await coureurRow(coureurId);

      const error = await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'refuser', motif: '   ' },
        { store },
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RefusalReasonRequiredError);
      const apiError = toAdminApiError(error);
      expect(apiError.status).toBe(400);
      expect(apiError.envelope.error.code).toBe('admin.refusal_reason_required');
      expect(apiError.envelope.error.message).toContain('motif');

      const after = await coureurRow(coureurId);
      expect(after?.status).toBe(before?.status);
      expect(after?.refusal_reason).toBeNull();
    });

    it('refus avec motif : refusé + motif stocké, visible côté coureur', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await uploadPreuve(session, jpegBytes(23_000), { store, proofStore });

      const summary = await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'refuser', motif: 'Reçu de paiement illisible' },
        { store },
      );

      expect(summary.status).toBe('refusé');
      expect(summary.refusalReason).toBe('Reçu de paiement illisible');
      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('refusé');
      expect(row?.refusal_reason).toBe('Reçu de paiement illisible');

      const detail = await getDossierDetail(await organisateurSession(), coureurId, { store });
      expect(detail?.coureur.refusalReason).toBe('Reçu de paiement illisible');
    });

    it('motif trop long : RefusalReasonTooLongError, refus non enregistré', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);

      await expect(
        decideDossier(
          await organisateurSession(),
          coureurId,
          { decision: 'refuser', motif: 'x'.repeat(281) },
          { store },
        ),
      ).rejects.toBeInstanceOf(RefusalReasonTooLongError);

      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('en constitution');
    });

    it('décision inconnue : DecisionInvalidError', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);

      await expect(
        decideDossier(await organisateurSession(), coureurId, { decision: 'annuler' }, { store }),
      ).rejects.toBeInstanceOf(DecisionInvalidError);
      await expect(
        decideDossier(await organisateurSession(), coureurId, null, { store }),
      ).rejects.toBeInstanceOf(DecisionInvalidError);
    });

    it('décision depuis refusé : 409 hors validation — le coureur doit d’abord reprendre son dossier', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await completerDossier(session);
      await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'refuser', motif: 'premier refus' },
        { store },
      );

      await expect(
        decideDossier(await organisateurSession(), coureurId, { decision: 'valider' }, { store }),
      ).rejects.toBeInstanceOf(DossierHorsValidationError);

      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('refusé');
      expect(row?.refusal_reason).toBe('premier refus');
    });

    it('re-validation après reprise : refusé → modifier → nouvelle preuve → validé', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await completerDossier(session);
      await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'refuser', motif: 'premier refus' },
        { store },
      );

      await submitInscription(session, validInput(), { store });
      await uploadPreuve(session, jpegBytes(20_500), { store, proofStore });
      const summary = await decideDossier(await organisateurSession(), coureurId, {
        decision: 'valider',
      }, { store });

      expect(summary.status).toBe('validé');
      expect(summary.refusalReason).toBeNull();
      const row = await coureurRow(coureurId);
      expect(row?.refusal_reason).toBeNull();
    });

    it('re-validation depuis validé : no-op idempotent, rien ne change', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await completerDossier(session);
      await decideDossier(await organisateurSession(), coureurId, { decision: 'valider' }, { store });
      const before = await coureurRow(coureurId);

      const summary = await decideDossier(await organisateurSession(), coureurId, {
        decision: 'valider',
      }, { store });

      expect(summary.status).toBe('validé');
      const after = await coureurRow(coureurId);
      expect(after?.status).toBe('validé');
      expect((after?.updated_at as Date).toISOString()).toBe(
        (before?.updated_at as Date).toISOString(),
      );
    });

    it('refus depuis validé : DossierValidatedError, statut inchangé', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      await completerDossier(session);
      await decideDossier(await organisateurSession(), coureurId, { decision: 'valider' }, { store });

      await expect(
        decideDossier(
          await organisateurSession(),
          coureurId,
          { decision: 'refuser', motif: 'trop tard' },
          { store },
        ),
      ).rejects.toBeInstanceOf(DossierValidatedError);

      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('validé');
      expect(row?.refusal_reason).toBeNull();
    });

    it('dossier inconnu ou hors organisation : DossierNotFoundError', async () => {
      await expect(
        decideDossier(await organisateurSession(), randomUUID(), { decision: 'valider' }, { store }),
      ).rejects.toBeInstanceOf(DossierNotFoundError);
      expect(await getDossierDetail(await organisateurSession(), randomUUID(), { store })).toBeNull();
    });

    it('cycle de correction : refusé → dépôt direct interdit ; reprise puis nouvelle preuve → en validation', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      const first = await uploadPreuve(session, jpegBytes(50_000), { store, proofStore });
      await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'refuser', motif: 'reçu flou' },
        { store },
      );

      // Depuis refusé, la seule action est « Modifier mon inscription ».
      const direct = await uploadPreuve(session, jpegBytes(55_000), { store, proofStore }).catch(
        (caught: unknown) => caught,
      );
      expect(direct).toBeInstanceOf(DossierAReprendreError);
      expect(toPreuveApiError(direct).status).toBe(409);
      expect(toPreuveApiError(direct).envelope.error.action).toContain('Modifier mon inscription');

      await submitInscription(session, validInput(), { store });
      const repris = await coureurRow(coureurId);
      expect(repris?.status).toBe('en constitution');
      expect(repris?.refusal_reason).toBeNull();

      const second = await uploadPreuve(session, jpegBytes(60_000), { store, proofStore });

      expect(second.id).not.toBe(first.id);
      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('en validation');
      expect(row?.refusal_reason).toBeNull();

      const preuves = await sql`
        SELECT id, status FROM preuve WHERE coureur_id = ${coureurId} ORDER BY created_at ASC
      `;
      expect(preuves.map((preuve) => preuve.status)).toEqual(['refusée', 'active']);
    });

    it('re-dépôt identique après reprise d’un refus : PreuveIdenticalRefusedError, dossier et preuves inchangés', async () => {
      const session = await createCoureurSession();
      const coureurId = await coureurIdFor(session.accountId);
      const bytes = jpegBytes(40_000);
      await uploadPreuve(session, bytes, { store, proofStore });
      await decideDossier(
        await organisateurSession(),
        coureurId,
        { decision: 'refuser', motif: 'montant illisible' },
        { store },
      );

      // Reprise faite : la preuve refusée n'est plus active, mais ses octets
      // restent reconnus.
      await submitInscription(session, validInput(), { store });

      await expect(
        uploadPreuve(session, bytes, { store, proofStore }),
      ).rejects.toBeInstanceOf(PreuveIdenticalRefusedError);
      const apiError = toPreuveApiError(new PreuveIdenticalRefusedError());
      expect(apiError.status).toBe(409);
      expect(apiError.envelope.error.code).toBe('preuve.identique_refusee');
      expect(apiError.envelope.error.message).toContain('déjà été refusée');

      const row = await coureurRow(coureurId);
      expect(row?.status).toBe('en constitution');
      expect(row?.refusal_reason).toBeNull();
      const preuves = await sql`
        SELECT status FROM preuve WHERE coureur_id = ${coureurId}
      `;
      expect(preuves.map((preuve) => preuve.status)).toEqual(['refusée']);
    });

    it('liste : recherche nom/email, preuve et acceptations exposées, LIMIT 200', async () => {
      const mail = `cherche-${randomUUID()}@test.azzel`;
      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email)
        VALUES (${accountId}, ${organisationId}, ${mail})
      `;
      await submitInscription(
        {
          accountId,
          organisationId,
          email: mail,
          role: 'coureur',
          createdAt: new Date(),
        },
        validInput({ prenom: 'Iness', nom: 'Cherchée' }),
        { store },
      );

      const state = await getDossiersState(await organisateurSession(), null, { store });
      expect(state.edition).not.toBeNull();
      expect(state.hasMore).toBe(false);
      const found = state.dossiers.find((dossier) => dossier.email === mail);
      expect(found).toBeDefined();
      expect(found?.status).toBe('en constitution');
      expect(found?.hasActivePreuve).toBe(false);
      expect(found?.acceptationsCompletes).toBe(false);

      const parNom = await getDossiersState(await organisateurSession(), 'Cherchée', { store });
      expect(parNom.dossiers.map((dossier) => dossier.email)).toContain(mail);

      const parEmail = await getDossiersState(await organisateurSession(), mail, { store });
      expect(parEmail.dossiers.map((dossier) => dossier.email)).toEqual([mail]);

      const sansResultat = await getDossiersState(await organisateurSession(), 'inexistant-xyz', {
        store,
      });
      expect(sansResultat.dossiers).toEqual([]);
    });

    it('isolation : coureur d’une autre organisation invisible (liste, détail, preuve)', async () => {
      const orgB = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgB}, ${`org-b-${randomUUID()}`}, 'Autre organisation')
      `;
      const accountB = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email)
        VALUES (${accountB}, ${orgB}, ${`autre-${accountB}@test.azzel`})
      `;
      const coureurB = randomUUID();
      const epreuve = await sql`SELECT id FROM epreuve LIMIT 1`;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category
        )
        VALUES (
          ${coureurB}, ${orgB}, ${accountB}, ${editionId}, ${epreuve[0]?.id},
          'Autre', 'Organisation', '+213555010999', 'Contact', '0555010998',
          DATE '1990-05-12', 'M', 36, 'Senior'
        )
      `;
      const preuveB = randomUUID();
      await sql`
        INSERT INTO preuve (id, organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
        VALUES (${preuveB}, ${orgB}, ${coureurB}, ${`${randomUUID()}.jpg`}, 'image/jpeg', 1024, ${randomUUID()}, 'active')
      `;

      const state = await getDossiersState(await organisateurSession(), null, { store });
      expect(state.dossiers.find((dossier) => dossier.coureurId === coureurB)).toBeUndefined();

      expect(
        await getDossierDetail(await organisateurSession(), coureurB, { store }),
      ).toBeNull();

      const organisateur = await organisateurSession();
      expect(await store.findPreuveByIdForOrganisation(preuveB, organisateur.organisationId)).toBeNull();
      await expect(
        readPreuveForOrganisation(organisateur, preuveB, { store, proofStore }),
      ).rejects.toBeInstanceOf(PreuveNotFoundError);
    });

    it('download : preuve active de son organisation lue et streamée ; replaced non téléchargeable', async () => {
      const session = await createCoureurSession();
      const bytes = jpegBytes(30_000);
      const uploaded = await uploadPreuve(session, bytes, { store, proofStore });
      // Plus de remplacement en validation (PO, 11/11/2026) : la preuve
      // « replaced » est une situation héritée, reconstituée ici en remettant
      // le dossier en constitution avant un second dépôt.
      await sql`
        UPDATE coureur SET status = 'en constitution'
        WHERE id = ${await coureurIdFor(session.accountId)}
      `;
      const autre = jpegBytes(31_000);
      const remplacante = await uploadPreuve(session, autre, { store, proofStore });
      expect(
        (await sql`SELECT status FROM preuve WHERE id = ${uploaded.id}`)[0]?.status,
      ).toBe('replaced');

      const file = await readPreuveForOrganisation(await organisateurSession(), remplacante.id, {
        store,
        proofStore,
      });

      expect(file).not.toBeNull();
      expect(file?.preuve.mime).toBe('image/jpeg');
      expect(file?.preuve.storageKey).toMatch(/\.jpg$/);
      expect(file?.bytes.byteLength).toBe(31_000);
      expect(file?.preuve.storageKey).not.toContain('recu');

      await expect(
        readPreuveForOrganisation(await organisateurSession(), uploaded.id, { store, proofStore }),
      ).rejects.toBeInstanceOf(PreuveNotFoundError);

      // Fichier absent du disque : erreur stockage distinguée du 404.
      const actuelle = await sql`
        SELECT storage_key FROM preuve WHERE id = ${remplacante.id}
      `;
      rmSync(path.join(storageDir, actuelle[0]?.storage_key as string));
      await expect(
        readPreuveForOrganisation(await organisateurSession(), remplacante.id, { store, proofStore }),
      ).rejects.toBeInstanceOf(PreuveStorageError);
    });
  },
);
