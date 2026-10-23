import { randomUUID } from 'node:crypto';

import { Workbook } from 'exceljs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withOrg } from '@/db/org-scope';
import { createIamStore, type IamStore, type SessionRecord } from '@/modules/iam/store';
import { sha256Hex } from '@/modules/iam/service';
import type { InscriptionFormInput } from '@/modules/inscriptions/domain';
import { submitInscription } from '@/modules/inscriptions/service';
import {
  createInscriptionsStore,
  type InscriptionsStore,
} from '@/modules/inscriptions/store';
import { importVolontaires, renvoyerInvitation } from '@/modules/missions/service';
import { MissionNotFoundError, VolontaireNotFoundError } from '@/modules/missions/errors';
import { createMissionsStore } from '@/modules/missions/store';
import {
  enregistrerAppareil,
  synchroniserLot,
  verifierJetonAppareil,
} from '@/modules/chrono/service';
import { createChronoStore } from '@/modules/chrono/store';
import {
  PASSAGE_SCHEMA_VERSION,
  cleIdempotenceEvenement,
  type PassageTerrain,
} from '@azzel/shared';
import {
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  closeAzzelTestDb,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 1.9 — LA preuve FR-27 : une seconde organisation complète vit à côté de la
// première sans changement de schéma, et le RLS rend l'invisibilité croisée
// STRUCTURELLE (aucun WHERE applicatif dans les assertions ci-dessous).

const testUrls = resolveTestDatabaseUrls('multi-org');

// Tables métier portant organisation_id : l'isolation doit y être totale.
// (invitation : voir le test dédié — pattern 0011, cherchée par secret pré-org.)
const ORG_TABLES = [
  'evenement',
  'edition',
  'epreuve',
  'coureur',
  'document',
  'preuve',
  'email_outbox',
  'account',
  'volontaire',
  'secteur',
  'mission',
  'affectation',
  // Story 4.5 — ingestion chrono : isolation stricte (toujours sous GUC).
  'terrain_evenement',
  // (appareil : pattern 0011, cherché par secret AVANT l'org — voir le test
  // dédié « story 4.5 : appareil » ci-dessous.)
] as const;

function validInput(epreuve: string): InscriptionFormInput {
  return {
    epreuve,
    prenom: 'Yani',
    nom: 'Ulahianne',
    telephone: '+213 555 010 203',
    contactUrgenceNom: 'Lounis Ulahianne',
    contactUrgenceTelephone: '0555 010 204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
  };
}

describe.skipIf(testUrls === null)(
  'multi-org — preuve FR-27 (RLS + GUC, base azzel_test, rôle azzel_app)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app.
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let store: InscriptionsStore;
    let iamStore: IamStore;

    let orgAId = '';
    let orgBId = '';
    let editionAId = '';
    let editionBId = '';
    let accountAId = '';
    let accountBId = '';
    let emailA = '';
    let emailB = '';
    let coureurAId = '';
    let coureurBId = '';
    let missionsStore: ReturnType<typeof createMissionsStore>;
    let volontaireAId = '';
    let volontaireBId = '';
    let schemaBefore: { table: string; columns: string[] }[] = [];
    let schemaAfter: { table: string; columns: string[] }[] = [];
    let policiesBefore = 0;
    let policiesAfter = 0;

    /** Import réel d'un volontaire (xlsx exceljs) via le service missions. */
    async function importerUnVolontaire(
      sessionAdmin: SessionRecord,
      nom: string,
    ): Promise<string> {
      const classeur = new Workbook();
      const feuille = classeur.addWorksheet('Volontaires');
      feuille.addRow(['Nom', 'Email', 'Téléphone']);
      feuille.addRow([nom, `${sessionAdmin.organisationId}@test.azzel`, '+213 555 010 210']);
      const bytes = new Uint8Array(
        (await classeur.xlsx.writeBuffer()) as ArrayBuffer,
      );
      const rapport = await importVolontaires(sessionAdmin, {
        bytes,
        filename: 'volontaires.xlsx',
      }, { store: missionsStore });
      const cree = rapport.lignes.find((ligne) => ligne.statut === 'créé');
      if (!cree) {
        throw new Error(`import volontaire « ${nom} » sans ligne créée`);
      }
      const rows = await sql<{ id: string }[]>`
        SELECT v.id FROM volontaire v
        JOIN account a ON a.id = v.account_id
        WHERE a.email = ${cree.email} AND v.organisation_id = ${sessionAdmin.organisationId}
      `;
      const id = rows[0]?.id;
      if (!id) {
        throw new Error(`fiche volontaire « ${nom} » absente en base`);
      }
      return id;
    }

    async function schemaFingerprint(): Promise<{ table: string; columns: string[] }[]> {
      const rows = await sql<{ table_name: string; columns: string[] }[]>`
        SELECT table_name, array_agg(column_name ORDER BY column_name) AS columns
        FROM information_schema.columns
        WHERE table_schema = 'public'
        GROUP BY table_name
        ORDER BY table_name
      `;
      return rows.map((row) => ({ table: row.table_name, columns: row.columns }));
    }

    async function policyCount(): Promise<number> {
      const rows = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_policy`;
      return rows[0]?.count ?? 0;
    }

    async function coureurIdFor(accountId: string): Promise<string> {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM coureur WHERE account_id = ${accountId} LIMIT 1
      `;
      const row = rows[0];
      if (!row) {
        throw new Error(`coureur du compte ${accountId} absent en base`);
      }
      return row.id;
    }

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      store = createInscriptionsStore(app);
      iamStore = createIamStore(app);

      // Organisation A = seed des migrations (ait-aissi + édition 2027 + épreuves).
      const organisations =
        await sql<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgAId = (organisations[0]?.id ?? '') as string;
      if (!orgAId) {
        throw new Error('Seed « ait-aissi » absente : les migrations n’ont pas peuplé organisation (pnpm -F @azzel/web db:migrate).');
      }
      const editions = await sql<{ id: string }[]>`
        SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${orgAId}
      `;
      editionAId = (editions[0]?.id ?? '') as string;
      if (!editionAId) {
        throw new Error('Seed édition « 2027 » absente : les migrations n’ont pas peuplé edition.');
      }

      // Comptes A et B posés en fixtures propriétaire (DML, pas de DDL).
      accountAId = randomUUID();
      emailA = `org-a-${accountAId}@test.azzel`;
      await sql`INSERT INTO account (id, organisation_id, email) VALUES (${accountAId}, ${orgAId}, ${emailA})`;
      accountBId = randomUUID();
      emailB = `org-b-${accountBId}@test.azzel`;

      // FR-27 : empreinte du schéma AVANT la création de l'organisation B.
      schemaBefore = await schemaFingerprint();
      policiesBefore = await policyCount();

      // Création de l'organisation B (DML uniquement — opérateur/seed, aucune DDL) :
      // organisation + evenement + edition + epreuve + documents.
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      editionBId = randomUUID();
      const epreuveBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-b-${orgBId.slice(0, 8)}`}, 'Autre Trail')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`autre-trail-${orgBId.slice(0, 8)}`}, 'Autre Trail')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionBId}, ${orgBId}, ${evenementBId}, '2027', 'Autre édition 2027',
                DATE '2027-05-01', TIMESTAMPTZ '2027-04-20T22:59:59Z')
      `;
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${epreuveBId}, ${orgBId}, ${editionBId}, 'unique', 'L’Unique — 21 km', 21.0)
      `;
      for (const slug of ['decharge', 'reglement'] as const) {
        await sql`
          INSERT INTO document (organisation_id, slug, version, content)
          VALUES (${orgBId}, ${slug}, 'v1', ${`Texte ${slug} org B`})
        `;
      }
      await sql`INSERT INTO account (id, organisation_id, email) VALUES (${accountBId}, ${orgBId}, ${emailB})`;

      schemaAfter = await schemaFingerprint();
      policiesAfter = await policyCount();

      // Population via le rôle applicatif : inscriptions + preuves de A et de B
      // passent par les stores (withOrg, GUC de chaque organisation).
      const noTrigger = async (): Promise<void> => {};
      const sessionA: SessionRecord = {
        accountId: accountAId,
        organisationId: orgAId,
        email: emailA,
        role: 'coureur',
        createdAt: new Date(),
      };
      const sessionB: SessionRecord = {
        accountId: accountBId,
        organisationId: orgBId,
        email: emailB,
        role: 'coureur',
        createdAt: new Date(),
      };
      const summaryA = await submitInscription(sessionA, validInput('longue'), {
        store,
        triggerOutbox: noTrigger,
      });
      const summaryB = await submitInscription(sessionB, validInput('unique'), {
        store,
        triggerOutbox: noTrigger,
      });
      if (summaryA.status !== 'en constitution' || summaryB.status !== 'en constitution') {
        throw new Error(`population A/B inattendue : ${summaryA.status} / ${summaryB.status}`);
      }
      await store.savePreuve({
        organisationId: orgAId,
        accountId: accountAId,
        editionId: editionAId,
        file: {
          storageKey: `preuves/${randomUUID()}.jpg`,
          mime: 'image/jpeg',
          sizeBytes: 2048,
          sha256: randomUUID(),
        },
      });
      await store.savePreuve({
        organisationId: orgBId,
        accountId: accountBId,
        editionId: editionBId,
        file: {
          storageKey: `preuves/${randomUUID()}.jpg`,
          mime: 'image/jpeg',
          sizeBytes: 4096,
          sha256: randomUUID(),
        },
      });
      coureurAId = await coureurIdFor(accountAId);
      coureurBId = await coureurIdFor(accountBId);

      // Story 3.1 — volontaires importés dans CHAQUE organisation via le
      // service réel (xlsx exceljs) : peuple account/volontaire/invitation/
      // email_outbox pour les preuves d'isolation ci-dessous.
      missionsStore = createMissionsStore(app);
      const sessionAdminA: SessionRecord = {
        accountId: accountAId,
        organisationId: orgAId,
        email: emailA,
        role: 'organisateur',
        createdAt: new Date(),
      };
      const sessionAdminB: SessionRecord = {
        accountId: accountBId,
        organisationId: orgBId,
        email: emailB,
        role: 'organisateur',
        createdAt: new Date(),
      };
      volontaireAId = await importerUnVolontaire(sessionAdminA, 'Volontaire A');
      volontaireBId = await importerUnVolontaire(sessionAdminB, 'Volontaire B');

      // Story 3.2 — secteurs + missions + affectations dans CHAQUE organisation
      // via le store réel : peuple secteur/mission/affectation pour les preuves
      // d'isolation ci-dessous (ORG_TABLES étendu aux 3 tables).
      const missionsParOrg = new Map<string, string>();
      for (const [orgId, editionId, volontaireId] of [
        [orgAId, editionAId, volontaireAId],
        [orgBId, editionBId, volontaireBId],
      ] as const) {
        const secteur = await missionsStore.createSecteur({
          organisationId: orgId,
          editionId,
          nom: `Village ${orgId.slice(0, 4)}`,
          lieu: 'Place du village',
          contact: null,
        });
        // Story 4.5 (revue) — le checkpoint du passage doit être une mission
        // scan_checkpoint (validation chrono) : la mission peuplée sert des
        // deux rôles (isolation 3.2 + checkpoint 4.5).
        const mission = await missionsStore.createMission({
          organisationId: orgId,
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Accueil village',
          debutLe: new Date('2027-05-16T06:00:00.000Z'),
          finLe: new Date('2027-05-16T12:00:00.000Z'),
          consignes: null,
          estArrivee: false,
        });
        missionsParOrg.set(orgId, mission.id);
        const affectation = await missionsStore.affecter({
          organisationId: orgId,
          missionId: mission.id,
          volontaireId,
        });
        if (!affectation.cree) {
          throw new Error(`affectation initiale non créée pour ${orgId}`);
        }
      }

      // Story 4.5 — appareils + événements terrain dans CHAQUE organisation
      // via le module chrono réel (find-or-create, Bearer, ingestion
      // idempotente) : peuple appareil/terrain_evenement pour les preuves
      // d'isolation ci-dessous (ORG_TABLES étendu aux 2 tables).
      for (const [orgId, editionId, accountId, coureurId] of [
        [orgAId, editionAId, accountAId, coureurAId],
        [orgBId, editionBId, accountBId, coureurBId],
      ] as const) {
        const jeton = `jeton-multi-org-${orgId.slice(0, 8)}`.padEnd(22, 'z').slice(0, 22);
        await sql`
          UPDATE coureur
          SET status = 'validé', dossard = 900, jeton_edossard = ${jeton}
          WHERE id = ${coureurId}
        `;
        const chronoStore = createChronoStore(app);
        const sessionVolontaire: SessionRecord = {
          accountId,
          organisationId: orgId,
          email: `volontaire-sync-${orgId}@test.azzel`,
          role: 'volontaire',
          createdAt: new Date(),
        };
        const enregistrement = await enregistrerAppareil(
          sessionVolontaire,
          `appareil-${orgId.slice(0, 8)}`,
          { store: chronoStore },
        );
        const auth = await verifierJetonAppareil(enregistrement.jeton, { store: chronoStore });
        // Checkpoint = id de la mission créée ci-dessus (V1 documentée).
        const checkpointId = missionsParOrg.get(orgId) as string;
        const evenement: PassageTerrain = {
          version: PASSAGE_SCHEMA_VERSION,
          type: 'passage',
          editionId,
          jeton,
          checkpointId,
          horodatage: '2027-05-16T07:05:09.000Z',
          appareilId: `appareil-${orgId.slice(0, 8)}`,
        };
        const reponse = await synchroniserLot(
          auth,
          { evenements: [{ ...evenement, cle: cleIdempotenceEvenement(evenement) }] },
          { store: chronoStore },
        );
        if (reponse.compteurs.acceptes !== 1) {
          throw new Error(`population chrono inattendue pour ${orgId}`);
        }
      }
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    it('la seconde organisation se crée sans changement de schéma (FR-27)', async () => {
      // Colonnes, tables et politiques strictement inchangés par la création de B.
      expect(schemaAfter).toEqual(schemaBefore);
      expect(policiesAfter).toBe(policiesBefore);
    });

    it('population via le rôle applicatif : coureurs, preuves et outbox de chaque organisation', async () => {
      expect(coureurAId).not.toBe(coureurBId);

      const preuvesByOrg = await sql<{ organisation_id: string; count: number }[]>`
        SELECT organisation_id, count(*)::int AS count FROM preuve GROUP BY organisation_id
      `;
      expect(preuvesByOrg).toEqual(
        expect.arrayContaining([
          { organisation_id: orgAId, count: 1 },
          { organisation_id: orgBId, count: 1 },
        ]),
      );

      // La file d'envoi a au moins une ligne par organisation (GUC de chaque tx) :
      // 1 notification d'inscription (story 1.8) + 1 invitation volontaire
      // (story 3.1) par organisation.
      const outboxByOrg = await sql<{ organisation_id: string; count: number }[]>`
        SELECT organisation_id, count(*)::int AS count FROM email_outbox GROUP BY organisation_id
      `;
      expect(outboxByOrg).toEqual(
        expect.arrayContaining([
          { organisation_id: orgAId, count: 2 },
          { organisation_id: orgBId, count: 2 },
        ]),
      );
    });

    it('isolation structurelle : GUC A ne voit AUCUNE ligne B, et inversement (sans WHERE applicatif)', async () => {
      for (const table of ORG_TABLES) {
        const rowsA = (await withOrg(app, orgAId, (tx) =>
          tx.unsafe(`SELECT organisation_id FROM ${table}`),
        )) as unknown as { organisation_id: string }[];
        expect(rowsA.length, table).toBeGreaterThan(0);
        expect(
          rowsA.every((row) => row.organisation_id === orgAId),
          table,
        ).toBe(true);

        const rowsB = (await withOrg(app, orgBId, (tx) =>
          tx.unsafe(`SELECT organisation_id FROM ${table}`),
        )) as unknown as { organisation_id: string }[];
        expect(rowsB.length, table).toBeGreaterThan(0);
        expect(
          rowsB.every((row) => row.organisation_id === orgBId),
          table,
        ).toBe(true);
      }
    });

    it('sans GUC : zéro ligne sur les tables métier, aucune erreur SQL (AD-4)', async () => {
      for (const table of ORG_TABLES) {
        const rows = await app.unsafe(`SELECT count(*)::int AS count FROM ${table}`);
        expect(rows[0]?.count, table).toBe(0);
      }
    });

    it('écritures croisées refusées : INSERT hors org rejeté par WITH CHECK, UPDATE de B sous GUC A touche 0 ligne', async () => {
      await expect(
        withOrg(app, orgAId, (tx) => tx`
          INSERT INTO email_outbox (organisation_id, destinataire, type, payload)
          VALUES (${orgBId}, 'pirate@exemple.dz', 'inscription_recue', '{}'::jsonb)
        `),
      ).rejects.toThrow(/row-level security/i);

      const updated = await withOrg(app, orgAId, (tx) => tx`
        UPDATE coureur SET first_name = 'Pirate' WHERE id = ${coureurBId}
      `);
      expect(updated).toHaveLength(0);
      const rows = await sql`SELECT first_name FROM coureur WHERE id = ${coureurBId}`;
      expect(rows[0]?.first_name).toBe('Yani');
    });

    it('DDL refusée au rôle applicatif (CREATE TABLE)', async () => {
      await expect(app`CREATE TABLE rls_probe (id integer)`).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('session → organisation : findSessionByTokenHash porte l’org de la session (A et B)', async () => {
      const tokenHashA = sha256Hex(`multi-org-a-${randomUUID()}`);
      const tokenHashB = sha256Hex(`multi-org-b-${randomUUID()}`);
      await sql`
        INSERT INTO session (organisation_id, account_id, token_hash, expires_at)
        VALUES (${orgAId}, ${accountAId}, ${tokenHashA}, now() + interval '1 day')
      `;
      await sql`
        INSERT INTO session (organisation_id, account_id, token_hash, expires_at)
        VALUES (${orgBId}, ${accountBId}, ${tokenHashB}, now() + interval '1 day')
      `;

      const recordA = await iamStore.findSessionByTokenHash(tokenHashA);
      expect(recordA?.organisationId).toBe(orgAId);
      expect(recordA?.email).toBe(emailA);

      const recordB = await iamStore.findSessionByTokenHash(tokenHashB);
      expect(recordB?.organisationId).toBe(orgBId);
      expect(recordB?.email).toBe(emailB);
    });

    // --- Story 3.1 — volontaires et invitations --------------------------------

    it('story 3.1 : chaque organisation voit SES volontaires, l’import B n’a rien créé chez A', async () => {
      const listeA = await missionsStore.listVolontaires(orgAId);
      const listeB = await missionsStore.listVolontaires(orgBId);
      expect(listeA.map((v) => v.email)).toEqual([`${orgAId}@test.azzel`]);
      expect(listeB.map((v) => v.email)).toEqual([`${orgBId}@test.azzel`]);
    });

    it('story 3.1 : invitation — pattern 0011 (secret d’abord) : sous GUC A, les invitations de B sont invisibles', async () => {
      // Le compte des invitations doit être IDENTIQUE vu sous GUC A et GUC B :
      // chaque organisation ne voit que la sienne (le contrôle d'accès hors GUC
      // reste le secret — le hash du jeton).
      for (const [orgId, autreOrgId] of [
        [orgAId, orgBId],
        [orgBId, orgAId],
      ] as const) {
        const compte = await withOrg(app, orgId, async (tx) => {
          const rows = await tx<{ count: number; autres: number }[]>`
            SELECT count(*)::int AS count,
              count(*) FILTER (WHERE organisation_id = ${autreOrgId})::int AS autres
            FROM invitation
          `;
          return rows[0];
        });
        expect(compte?.count).toBe(1);
        expect(compte?.autres).toBe(0);
      }
    });

    it('story 3.1 : renvoi d’invitation croisé refusé — B ne peut pas réinviter le volontaire de A', async () => {
      const sessionAdminB: SessionRecord = {
        accountId: accountBId,
        organisationId: orgBId,
        email: emailB,
        role: 'organisateur',
        createdAt: new Date(),
      };
      await expect(
        renvoyerInvitation(sessionAdminB, volontaireAId, { store: missionsStore }),
      ).rejects.toBeInstanceOf(VolontaireNotFoundError);
      // Et l'inverse.
      const sessionAdminA: SessionRecord = {
        accountId: accountAId,
        organisationId: orgAId,
        email: emailA,
        role: 'organisateur',
        createdAt: new Date(),
      };
      await expect(
        renvoyerInvitation(sessionAdminA, volontaireBId, { store: missionsStore }),
      ).rejects.toBeInstanceOf(VolontaireNotFoundError);
    });

    // --- Story 3.2 — secteurs, missions, affectations ---------------------------

    /** Édition « 2027 » d'une organisation — échoue clairement si elle manque. */
    async function edition2027Pour(organisationId: string): Promise<string> {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${organisationId}
      `;
      const id = rows[0]?.id;
      if (!id) {
        throw new Error(
          `édition « 2027 » absente pour l’organisation ${organisationId} : fixtures incomplètes`,
        );
      }
      return id;
    }

    it('story 3.2 : chaque organisation voit SES secteurs et missions, pas ceux de l’autre', async () => {
      const editionA = await edition2027Pour(orgAId);
      const editionB = await edition2027Pour(orgBId);
      for (const [orgId, editionId] of [
        [orgAId, editionA],
        [orgBId, editionB],
      ] as const) {
        const etat = await missionsStore.listMissionsEtat(orgId, editionId);
        expect(etat.secteurs).toHaveLength(1);
        expect(etat.missions).toHaveLength(1);
        expect(etat.affectations).toHaveLength(1);
        // La couverture dérivée ne voit que les affectations de l'organisation.
        expect(etat.affectations.every((a) => a.missionId === etat.missions[0]?.id)).toBe(true);
      }
    });

    it('story 3.2 : affectation croisée refusée — le volontaire de A ne rejoint pas la mission de B', async () => {
      const editionA = await edition2027Pour(orgAId);
      const editionB = await edition2027Pour(orgBId);
      const etatA = await missionsStore.listMissionsEtat(orgAId, editionA);
      const etatB = await missionsStore.listMissionsEtat(orgBId, editionB);
      const missionB = etatB.missions[0];
      if (!missionB) {
        throw new Error('mission org B absente');
      }
      // GUC B + volontaire de A : RLS rend la fiche volontaire invisible → 404.
      await expect(
        missionsStore.affecter({
          organisationId: orgBId,
          missionId: missionB.id,
          volontaireId: volontaireAId,
        }),
      ).rejects.toBeInstanceOf(VolontaireNotFoundError);
      // Mission de B + GUC A : invisible → 404.
      await expect(
        missionsStore.affecter({
          organisationId: orgAId,
          missionId: missionB.id,
          volontaireId: volontaireAId,
        }),
      ).rejects.toBeInstanceOf(MissionNotFoundError);
      expect(etatA.affectations).toHaveLength(1);
    });

    // --- Story 4.5 — module chrono (canal sync) -------------------------------

    it('story 4.5 : terrain_evenement — chaque organisation ne voit QUE ses événements (GUC)', async () => {
      for (const orgId of [orgAId, orgBId] as const) {
        const rows = (await withOrg(app, orgId, (tx) =>
          tx.unsafe('SELECT organisation_id FROM terrain_evenement'),
        )) as unknown as { organisation_id: string }[];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((row) => row.organisation_id === orgId)).toBe(true);
      }
    });

    it('story 4.5 : appareil — pattern 0011 (secret d’abord) : lisible hors GUC pour la résolution par hash, CLOISONNÉ sous GUC', async () => {
      // Hors GUC : les lignes existent (la garde sync résout l'org depuis le
      // hash du jeton — le secret EST le contrôle d'accès, cf. session 0011).
      const sansGuc = await app.unsafe('SELECT organisation_id FROM appareil');
      expect(sansGuc.length).toBe(2);

      // Sous GUC : chaque organisation ne voit QUE son appareil, aucune
      // écriture croisée possible (WITH CHECK).
      for (const [orgId, autreOrgId] of [
        [orgAId, orgBId],
        [orgBId, orgAId],
      ] as const) {
        const rows = (await withOrg(app, orgId, (tx) =>
          tx<{ count: number; autres: number }[]>`
            SELECT count(*)::int AS count,
              count(*) FILTER (WHERE organisation_id = ${autreOrgId})::int AS autres
            FROM appareil
          `,
        )) as unknown as { count: number; autres: number }[];
        expect(rows[0]?.count).toBe(1);
        expect(rows[0]?.autres).toBe(0);
      }
    });
  },
);
