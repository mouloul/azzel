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

import { chercherParJeton, estAnnuaireValide } from '@azzel/shared';

import { ORGANISATION_GUC } from '@/db/org-scope';
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
  obtenirEdossard,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';

// Story 4.1 — intégration e-dossard (base azzel_test, rôle azzel_app) :
// jeton créé paresseusement à la première consultation du validé, UNE SEULE
// FOIS (idempotence, concurrence sérialisée par le verrou coureur), jamais
// pour un dossier non validé ; CHECK longueur + UNIQUE défendus en SQL
// direct ; annuaire v2 end-to-end (jeton présent, exclusions, RLS).

const testUrls = resolveTestDatabaseUrls('e-dossard');

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
  'e-dossard — intégration Postgres (base azzel_test)',
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
      storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-edossard-it-'));
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

    async function coureurIdFor(accountId: string): Promise<string> {
      const rows = await sql`SELECT id FROM coureur WHERE account_id = ${accountId}`;
      const row = rows[0];
      if (!row) {
        throw new Error('coureur absent en base');
      }
      return row.id as string;
    }

    /** Coureur avec dossier validé — le jeton n'est PAS encore créé (paresseux). */
    async function createCoureurValide(
      input: Partial<InscriptionFormInput> = {},
    ): Promise<{ coureurId: string; session: SessionRecord }> {
      const proofStore = new LocalDiskProofStore(storageDir);
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
      await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });
      await acceptDocuments(session, { decharge: true, reglement: true }, { store });
      const coureurId = await coureurIdFor(accountId);
      await decideDossier(organisateur, coureurId, { decision: 'valider' }, { store });
      return { coureurId, session };
    }

    it('première consultation : jeton créé (22 car. base64url), dossard null tant qu’il n’est pas attribué', async () => {
      const { session } = await createCoureurValide();

      const etat = await obtenirEdossard(session, { store });

      expect(etat).not.toBeNull();
      expect(etat?.jeton).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(etat?.dossard).toBeNull();
      expect(etat?.prenom).toBe('Yani');
      expect(etat?.nom).toBe('Ulahianne');
      expect(etat?.epreuveNom).toBe('La Longue');
      expect(etat?.editionNom).toBe('Édition 2027');
    });

    it('créé UNE SEULE FOIS : deux consultations successives → strictement le même jeton', async () => {
      const { session } = await createCoureurValide();

      const premier = await obtenirEdossard(session, { store });
      const deuxieme = await obtenirEdossard(session, { store });

      expect(premier?.jeton).toBe(deuxieme?.jeton);
    });

    it('concurrence : deux consultations parallèles → une seule création, même jeton (verrou coureur)', async () => {
      const { session } = await createCoureurValide();

      const [a, b] = await Promise.all([
        obtenirEdossard(session, { store }),
        obtenirEdossard(session, { store }),
      ]);

      expect(a?.jeton).toBe(b?.jeton);
    });

    it('jamais de jeton pour un dossier non validé : en constitution et refusé → null, base inchangée', async () => {
      // En constitution : inscription seule.
      const accountIdEnConstitution = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountIdEnConstitution}, ${organisationId}, ${`c-${accountIdEnConstitution}@test.azzel`}, 'coureur')
      `;
      const enConstitution: SessionRecord = {
        accountId: accountIdEnConstitution,
        organisationId,
        email: `c-${accountIdEnConstitution}@test.azzel`,
        role: 'coureur',
        createdAt: new Date(),
      };
      await submitInscription(enConstitution, validInput(), { store });
      await expect(obtenirEdossard(enConstitution, { store })).resolves.toBeNull();

      // Refusé : dossier complet puis décision négative (jamais validé — un
      // dossier validé ne peut plus être refusé).
      const proofStoreRefus = new LocalDiskProofStore(storageDir);
      const accountIdRefuse = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountIdRefuse}, ${organisationId}, ${`r-${accountIdRefuse}@test.azzel`}, 'coureur')
      `;
      const refuse: SessionRecord = {
        accountId: accountIdRefuse,
        organisationId,
        email: `r-${accountIdRefuse}@test.azzel`,
        role: 'coureur',
        createdAt: new Date(),
      };
      await submitInscription(refuse, validInput(), { store });
      await uploadPreuve(refuse, jpegBytes(20_000), { store, proofStore: proofStoreRefus });
      await acceptDocuments(refuse, { decharge: true, reglement: true }, { store });
      const coureurRefuse = await coureurIdFor(accountIdRefuse);
      await decideDossier(organisateur, coureurRefuse, {
        decision: 'refuser',
        motif: 'reçu illisible',
      }, { store });
      await expect(obtenirEdossard(refuse, { store })).resolves.toBeNull();

      const jetons = await sql`
        SELECT jeton_edossard FROM coureur
        WHERE account_id IN (${enConstitution.accountId}, ${accountIdRefuse})
      `;
      expect(jetons.every((row) => row.jeton_edossard === null)).toBe(true);
    });

    it('dossard attribué ensuite : l’e-dossard expose le numéro SANS toucher au jeton', async () => {
      const { session } = await createCoureurValide();
      const avant = await obtenirEdossard(session, { store });

      await attribuerDossards(organisateur, { store });

      const apres = await obtenirEdossard(session, { store });
      expect(apres?.dossard).not.toBeNull();
      expect(apres?.jeton).toBe(avant?.jeton);
    });

    it('CHECK longueur, alphabet et UNIQUE défendus en SQL direct (migrations 0023/0024)', async () => {
      const { coureurId } = await createCoureurValide();
      const autre = await createCoureurValide();
      // Le second coureur consulte : son jeton existe (jamais régénéré ensuite).
      const etatAutre = await obtenirEdossard(autre.session, { store });
      const existant = etatAutre?.jeton as string;

      // Trop court / trop long (0023).
      await expect(
        sql`UPDATE coureur SET jeton_edossard = ${'a'.repeat(21)} WHERE id = ${coureurId}`,
      ).rejects.toThrow();
      await expect(
        sql`UPDATE coureur SET jeton_edossard = ${'a'.repeat(23)} WHERE id = ${coureurId}`,
      ).rejects.toThrow();
      // Hors alphabet base64url (0024) : 22 caractères, mais pas les bons —
      // symétrie exacte avec estJetonEdossardValide (shared).
      await expect(
        sql`UPDATE coureur SET jeton_edossard = ${'é'.repeat(22)} WHERE id = ${coureurId}`,
      ).rejects.toThrow();
      await expect(
        sql`UPDATE coureur SET jeton_edossard = ${'+/'.repeat(11)} WHERE id = ${coureurId}`,
      ).rejects.toThrow();
      // Doublon inter-coureurs : la UNIQUE partielle défend le contrat.
      await expect(
        sql`UPDATE coureur SET jeton_edossard = ${existant} WHERE id = ${coureurId}`,
      ).rejects.toThrow();
      // Base64url de 22 caractères accepté, plusieurs NULL cohabitent.
      await expect(
        sql`UPDATE coureur SET jeton_edossard = ${'c'.repeat(22)} WHERE id = ${coureurId}`,
      ).resolves.toBeDefined();
      await expect(
        sql`UPDATE coureur SET jeton_edossard = NULL WHERE id = ${coureurId}`,
      ).resolves.toBeDefined();
    });

    it('annuaire v2 end-to-end : jeton présent par coureur, chercherParJeton résout, sans-jeton exclu', async () => {
      // Consultés : ils entrent dans la réplique.
      const consulte1 = await createCoureurValide({ prenom: 'Consulte1' });
      const consulte2 = await createCoureurValide({ prenom: 'Consulte2' });
      await obtenirEdossard(consulte1.session, { store });
      await obtenirEdossard(consulte2.session, { store });

      // Validé numéroté mais JAMAIS consulté : hors réplique (jeton requis).
      const nonConsulte = await createCoureurValide({ prenom: 'JamaisConsulte' });
      await attribuerDossards(organisateur, { store });
      // Le non-consulté est bien numéroté : son exclusion relève du jeton,
      // pas du dossard.
      const dossardNonConsulte = await sql`
        SELECT dossard FROM coureur WHERE id = ${nonConsulte.coureurId}
      `;
      expect(dossardNonConsulte[0]?.dossard).not.toBeNull();
      // Numérotation posée, relecture fraîche de l'e-dossard (même jeton).
      const etat1 = await obtenirEdossard(consulte1.session, { store });
      expect(etat1?.dossard).not.toBeNull();

      const volontaire: SessionRecord = {
        accountId: randomUUID(),
        organisationId,
        email: `volontaire-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      const annuaire = await getAnnuaireEdition(volontaire, { store: missionsStore });

      expect(estAnnuaireValide(annuaire)).toBe(true);
      expect(annuaire.version).toBe(2);
      const exclus = annuaire.coureurs.filter(
        (coureur) => coureur.prenom === 'JamaisConsulte',
      );
      expect(exclus).toEqual([]);
      // Identité minimale v2 : dossard + noms + jeton.
      for (const coureur of annuaire.coureurs) {
        expect(Object.keys(coureur).sort()).toEqual(['dossard', 'jeton', 'nom', 'prenom']);
      }
      // Le scanneur (4.2) résout le QR via chercherParJeton.
      const retrouve = chercherParJeton(annuaire, etat1?.jeton as string);
      expect(retrouve?.prenom).toBe('Consulte1');
      expect(retrouve?.dossard).toBe(etat1?.dossard);
    });

    it('RLS : un coureur anomalie (org B sur l’édition A) reste invisible sous GUC A', async () => {
      // Anomalie de données : le coureur porte l'organisation B mais l'ÉDITION
      // A — pour un scanner de l'org A, la dimension édition NE suffit pas à
      // l'exclure : seule l'isolation structurelle (RLS) doit le cacher.
      const orgB = randomUUID();
      const suffixe = randomUUID().slice(0, 8);
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgB}, ${`org-edossard-${suffixe}`}, 'Autre organisation')
      `;
      const accountB = randomUUID();
      const coureurAnomalie = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountB}, ${orgB}, ${`b-${accountB}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${coureurAnomalie}, ${orgB}, ${accountB}, ${editionId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionId} LIMIT 1),
          'PrenomAnomalie', 'NomAnomalie', '+213555010998', 'Contact', '0555010997',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', 9877, ${'z'.repeat(22)}
        )
      `;

      // 1) La réplique du volontaire A ne contient pas l'anomalie.
      const volontaireA: SessionRecord = {
        accountId: randomUUID(),
        organisationId,
        email: `volontaire-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      const annuaire = await getAnnuaireEdition(volontaireA, { store: missionsStore });
      expect(estAnnuaireValide(annuaire)).toBe(true);
      expect(
        annuaire.coureurs.find((coureur) => coureur.nom === 'NomAnomalie'),
      ).toBeUndefined();

      // 2) Preuve RLS non triviale : la requête ne filtre QUE par édition
      //    (aucun filtre applicatif d'organisation), exécutée en rôle
      //    applicatif sous GUC org A — sans les politiques RLS, la ligne
      //    anomalie fuiterait dans ce résultat.
      const sousGucA = await app.begin(async (tx) => {
        await tx`SELECT set_config(${ORGANISATION_GUC}, ${organisationId}, true)`;
        return tx`
          SELECT id, jeton_edossard FROM coureur
          WHERE edition_id = ${editionId} AND jeton_edossard IS NOT NULL
        `;
      });
      expect(sousGucA.some((row) => row.jeton_edossard === 'z'.repeat(22))).toBe(false);

      // 3) La ligne existe pourtant bien (le propriétaire bypass RLS) : le
      //    test n'est pas trivialement vrai.
      const vueProprietaire = await sql`
        SELECT id FROM coureur WHERE id = ${coureurAnomalie} AND edition_id = ${editionId}
      `;
      expect(vueProprietaire.length).toBe(1);
    });
  },
);
