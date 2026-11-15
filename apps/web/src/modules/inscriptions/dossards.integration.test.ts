import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import { estAnnuaireValide, ANNUAIRE_SCHEMA_VERSION } from '@azzel/shared';

import type { SessionRecord } from '@/modules/iam/store';
import { getAnnuaireEdition } from '@/modules/missions/service';
import { createMissionsStore, type MissionsStore } from '@/modules/missions/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import type { InscriptionFormInput } from './domain';
import { LocalDiskProofStore } from './proof-store';
import { uploadPreuve } from './proof-service';
import {
  acceptDocuments,
  attribuerDossards,
  decideDossier,
  getDossiersState,
  obtenirEdossard,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';

// Story 3.4 — intégration dossards/annuaire (base azzel_test, rôle azzel_app) :
// attribution par lot (nominal, idempotence, suite du max, isolation par
// édition/org, UNIQUE et CHECK défendus en SQL direct) et réplique annuaire
// (validés + dossard uniquement, tri, RLS cross-org, contrat shared).

const testUrls = resolveTestDatabaseUrls('dossards annuaire');

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
  'dossards + annuaire — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let store: InscriptionsStore;
    let missionsStore: MissionsStore;
    let storageDir = '';
    let organisationId: string;
    let editionId: string;
    let organisateur: SessionRecord;

    beforeAll(async () => {
      storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-dossards-it-'));
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      store = createInscriptionsStore(app);
      missionsStore = createMissionsStore(app);

      const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      organisationId = organisations[0]?.id as string;
      const editions = await sql`SELECT id FROM edition WHERE slug = '2027'`;
      editionId = editions[0]?.id as string;

      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${`organisateur-${accountId}@test.azzel`}, 'organisateur')
      `;
      organisateur = {
        accountId,
        organisationId,
        email: `organisateur-${accountId}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };
    }, 60_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
      if (storageDir) {
        rmSync(storageDir, { recursive: true, force: true });
      }
    });

    async function createCoureurValide(
      input: Partial<InscriptionFormInput> = {},
    ): Promise<{ coureurId: string; prenom: string }> {
      const proofStore = new LocalDiskProofStore(storageDir);
      const prenom = input.prenom ?? `Prenom${randomUUID().slice(0, 6)}`;
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
      await submitInscription(session, validInput({ ...input, prenom }), { store });
      await acceptDocuments(session, { decharge: true, reglement: true }, { store });
      await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });
      const coureurId = await coureurIdFor(accountId);
      await decideDossier(organisateur, coureurId, { decision: 'valider' }, { store });
      // Story 4.1 — ces coureurs ont consulté leur e-dossard : leur jeton
      // existe, ils entrent dans la réplique annuaire v2 (contrat : jeton
      // requis par coureur).
      await obtenirEdossard(session, { store });
      return { coureurId, prenom };
    }

    async function coureurIdFor(accountId: string): Promise<string> {
      const rows = await sql`SELECT id FROM coureur WHERE account_id = ${accountId}`;
      const row = rows[0];
      if (!row) {
        throw new Error('coureur absent en base');
      }
      return row.id as string;
    }

    it('nominal : le numéro naît à la validation, incrémental dans l’ordre des validations, visible dans la liste', async () => {
      const premier = await createCoureurValide();
      const deuxieme = await createCoureurValide();
      const troisieme = await createCoureurValide();

      // Aucun lot à lancer : les trois sont déjà numérotés par leur validation.
      const resultat = await attribuerDossards(organisateur, { store });
      expect(resultat).toEqual({ attribues: 0, premier: null, dernier: null });
      const rows = await sql`
        SELECT first_name, dossard FROM coureur
        WHERE id IN (${premier.coureurId}, ${deuxieme.coureurId}, ${troisieme.coureurId})
        ORDER BY dossard ASC
      `;
      expect(rows.map((row) => row.dossard)).toEqual([1, 2, 3]);
      // La surface de liste admin expose le dossard de chaque dossier (UI 3.4).
      const state = await getDossiersState(organisateur, null, { store });
      const parId = new Map(state.dossiers.map((dossier) => [dossier.coureurId, dossier]));
      const attendus = [
        [premier.coureurId, rows[0]?.dossard],
        [deuxieme.coureurId, rows[1]?.dossard],
        [troisieme.coureurId, rows[2]?.dossard],
      ] as const;
      for (const [coureurId, dossard] of attendus) {
        expect(parId.get(coureurId)?.dossard).toBe(dossard);
      }
    });

    it('idempotent : 2ᵉ clic → attribues 0, bornes null, aucun changement en base', async () => {
      const avant = await sql`SELECT id, dossard FROM coureur WHERE edition_id = ${editionId} ORDER BY dossard`;

      const resultat = await attribuerDossards(organisateur, { store });

      expect(resultat).toEqual({ attribues: 0, premier: null, dernier: null });
      const apres = await sql`SELECT id, dossard FROM coureur WHERE edition_id = ${editionId} ORDER BY dossard`;
      expect(apres).toEqual(avant);
    });

    it('suite après max : le nouveau validé reçoit le numéro suivant, existants inchangés', async () => {
      const nouveau = await createCoureurValide();
      const existant = await sql`
        SELECT id, dossard FROM coureur
        WHERE edition_id = ${editionId} AND dossard IS NOT NULL
        ORDER BY dossard ASC LIMIT 1
      `;
      expect(existant[0]?.dossard).toBe(1);

      const row = await sql`SELECT dossard FROM coureur WHERE id = ${nouveau.coureurId}`;
      expect(row[0]?.dossard).toBe(4);
      const inchangé = await sql`SELECT dossard FROM coureur WHERE id = ${existant[0]?.id}`;
      expect(inchangé[0]?.dossard).toBe(1);
    });

    it('jamais de renumérotation : un coureur validé retiré du lot ne récupère pas un numéro libéré', async () => {
      // Un dossard n'est jamais réattribué : même si le coureur 4 repassait en
      // constitution (cycle de correction), le lot suivant continue après le max.
      const rows = await sql`SELECT id FROM coureur WHERE edition_id = ${editionId} AND dossard = 4`;
      await sql`UPDATE coureur SET status = 'en constitution' WHERE id = ${rows[0]?.id}`;
      const suivant = await createCoureurValide();

      const nouveau = await sql`SELECT dossard FROM coureur WHERE id = ${suivant.coureurId}`;
      expect(nouveau[0]?.dossard).toBe(5);
    });

    it('UNIQUE et CHECK défendus en SQL direct : doublon par édition rejeté, bornes 1–9999', async () => {
      const rows = await sql`
        SELECT id, dossard FROM coureur
        WHERE edition_id = ${editionId} AND dossard IS NOT NULL
        ORDER BY dossard ASC
      `;
      const cible = rows[0] as { id: string; dossard: number };
      const autre = rows[1] as { id: string; dossard: number };

      await expect(
        sql`UPDATE coureur SET dossard = ${cible.dossard} WHERE id = ${autre.id}`,
      ).rejects.toThrow();

      await expect(sql`UPDATE coureur SET dossard = 0 WHERE id = ${autre.id}`).rejects.toThrow();
      await expect(
        sql`UPDATE coureur SET dossard = 10000 WHERE id = ${autre.id}`,
      ).rejects.toThrow();

      // Deux coureurs NULL cohabitent (UNIQUE partielle) et la borne haute passe.
      await sql`UPDATE coureur SET dossard = NULL WHERE id = ${autre.id}`;
      await expect(
        sql`UPDATE coureur SET dossard = 9999 WHERE id = ${autre.id}`,
      ).resolves.toBeDefined();
      // Remise dans la suite pour les tests suivants.
      await sql`UPDATE coureur SET dossard = ${autre.dossard} WHERE id = ${autre.id}`;
    });

    it('isolation multi-org : l’org B numérote depuis 1 sur SA propre édition', async () => {
      const orgB = randomUUID();
      const suffixe = randomUUID().slice(0, 8);
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgB}, ${`org-dossards-${suffixe}`}, 'Autre organisation')
      `;
      const evenementB = randomUUID();
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementB}, ${orgB}, ${`event-${suffixe}`}, 'Autre trail')
      `;
      const editionB = randomUUID();
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionB}, ${orgB}, ${evenementB}, '2027', 'Édition 2027', DATE '2027-03-26', TIMESTAMPTZ '2027-03-16T22:59:59Z')
      `;
      const epreuveB = randomUUID();
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${epreuveB}, ${orgB}, ${editionB}, 'longue', 'La Grande Boucle', 35.0)
      `;
      for (let index = 0; index < 2; index += 1) {
        const accountB = randomUUID();
        const coureurB = randomUUID();
        await sql`
          INSERT INTO account (id, organisation_id, email, role)
          VALUES (${accountB}, ${orgB}, ${`b-${accountB}@test.azzel`}, 'coureur')
        `;
        await sql`
          INSERT INTO coureur (
            id, organisation_id, account_id, edition_id, epreuve_id,
            first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
            birth_date, tshirt_size, age, age_category, status
          )
          VALUES (
            ${coureurB}, ${orgB}, ${accountB}, ${editionB}, ${epreuveB},
            ${`PrenomB${index}`}, 'NomB', '+213555010999', 'Contact', '0555010998',
            DATE '1990-05-12', 'M', 36, 'Senior', 'validé'
          )
        `;
      }
      const organisateurB: SessionRecord = {
        accountId: randomUUID(),
        organisationId: orgB,
        email: `organisateur-b-${suffixe}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };

      const resultatB = await attribuerDossards(organisateurB, { store });

      expect(resultatB).toEqual({ attribues: 2, premier: 1, dernier: 2 });
      // L'org A garde SA numérotation : rien n'a bougé chez elle (5 numéros
      // posés à ce stade : 1–4 du lot initial + 5 de la suite après max).
      const orgARows = await sql`
        SELECT count(*)::int AS count FROM coureur
        WHERE edition_id = ${editionId} AND dossard IS NOT NULL
      `;
      expect(orgARows[0]?.count).toBe(5);
    });

    it('annuaire : validés + dossard uniquement, tri par dossard, contrat shared respecté', async () => {
      // Un coureur en constitution (sans dossier complet) reste hors annuaire.
      const enConstitution = randomUUID();
      const accountC = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountC}, ${organisationId}, ${`c-${accountC}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status
        )
        VALUES (
          ${enConstitution}, ${organisationId}, ${accountC}, ${editionId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionId} LIMIT 1),
          'EnConstitution', 'HorsAnnuaire', '+213555010997', 'Contact', '0555010996',
          DATE '1990-05-12', 'M', 36, 'Senior', 'en constitution'
        )
      `;

      const volontaire: SessionRecord = {
        accountId: randomUUID(),
        organisationId,
        email: `volontaire-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      const annuaire = await getAnnuaireEdition(volontaire, { store: missionsStore });

      expect(estAnnuaireValide(annuaire)).toBe(true);
      expect(annuaire.version).toBe(ANNUAIRE_SCHEMA_VERSION);
      expect(annuaire.editionId).toBe(editionId);
      // Validés + dossard uniquement, triés : le porteur du 4 repassé en
      // constitution et le dossier non validé restent hors annuaire.
      expect(annuaire.coureurs.map((coureur) => coureur.dossard)).toEqual([1, 2, 3, 5]);
      expect(annuaire.coureurs.find((coureur) => coureur.nom === 'HorsAnnuaire')).toBeUndefined();
      // Identité minimale v2 (4.1) : dossard + nom + prénom + jeton (NFR-7).
      for (const coureur of annuaire.coureurs) {
        expect(Object.keys(coureur).sort()).toEqual(['dossard', 'jeton', 'nom', 'prenom']);
        expect(coureur.jeton).toMatch(/^[A-Za-z0-9_-]{22}$/);
      }
    });

    it('RLS cross-org : un volontaire de l’org A ne précharge que les coureurs de son org', async () => {
      // L'org B (test précédent) a des dossards 1–2 sur sa propre édition :
      // invisibles pour un volontaire de l'org A (RLS, pas de WHERE applicatif).
      const volontaire: SessionRecord = {
        accountId: randomUUID(),
        organisationId,
        email: `volontaire-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      const annuaire = await getAnnuaireEdition(volontaire, { store: missionsStore });
      expect(estAnnuaireValide(annuaire)).toBe(true);
      expect(annuaire.editionId).toBe(editionId);
      for (const coureur of annuaire.coureurs) {
        expect(coureur.nom).not.toBe('NomB');
      }
    });
  },
);
