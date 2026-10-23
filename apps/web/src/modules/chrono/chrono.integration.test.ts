import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  cleIdempotenceEvenement,
  type EvenementSyncTerrain,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import { withOrg } from '@/db/org-scope';
import type { SessionRecord } from '@/modules/iam/store';

import { PLAFOND_APPAREILS_PAR_ORG } from './domain';

import {
  AppareilRevokedError,
  JetonAppareilInvalideError,
  PlafondAppareilsError,
} from './errors';
import {
  enregistrerAppareil,
  listerAppareils,
  premierRecu,
  revoquerAppareil,
  synchroniserLot,
  verifierJetonAppareil,
} from './service';
import { createChronoStore } from './store';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 4.5 — intégration chrono (base azzel_test, rôle azzel_app) : la
// preuve SQL de l'idempotence de bout en bout (ON CONFLICT, rejeu intégral
// SANS doublon), de l'arbitrage premier-reçu (AD-3), des rejets motivés
// (jeton inconnu, RLS multi-org), de la révocation (AD-5) et de l'offset
// journalisé par événement.

const testUrls = resolveTestDatabaseUrls('chrono');

function jetonBase64url(squelette: string): string {
  return squelette.padEnd(22, 'x').slice(0, 22);
}

const JETON_A1 = jetonBase64url('coureur-a1');
const JETON_A2 = jetonBase64url('coureur-a2');
const JETON_B1 = jetonBase64url('coureur-b1');

describe.skipIf(testUrls === null)(
  'chrono — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;

    let orgAId = '';
    let orgBId = '';
    let editionAId = '';
    let editionBId = '';
    let volontaireA: SessionRecord;
    let organisateurA: SessionRecord;
    let checkpointKm12Id = '';
    let checkpointKm30Id = '';
    let checkpointArbId = '';
    let checkpointRejetId = '';
    let checkpointRlsId = '';
    let checkpointRevokId = '';

    /** Coureur validé numéroté avec jeton, posé en fixtures propriétaire. */
    async function creerCoureur(
      organisationId: string,
      editionId: string,
      jeton: string,
      dossard: number,
    ): Promise<void> {
      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${`coureur-${accountId}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${organisationId}, ${accountId}, ${editionId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionId} LIMIT 1),
          'Prenom', 'Nom', '+213555010998', 'Contact', '0555010997',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', ${dossard}, ${jeton}
        )
      `;
    }

    /**
     * Checkpoint réel pour l'org A : une mission scan_checkpoint (V1 — le
     * checkpoint EST la mission, id uuid en clé naturelle).
     */
    async function creerCheckpoint(nom: string): Promise<string> {
      const secteurId = randomUUID();
      await sql`
        INSERT INTO secteur (id, organisation_id, edition_id, nom, lieu)
        VALUES (${secteurId}, ${orgAId}, ${editionAId}, ${`Secteur ${nom}`}, 'Zone blanche')
      `;
      const missionId = randomUUID();
      await sql`
        INSERT INTO mission (id, organisation_id, secteur_id, type, titre, debut_le, fin_le)
        VALUES (${missionId}, ${orgAId}, ${secteurId}, 'scan_checkpoint', ${`Scan ${nom}`},
                TIMESTAMPTZ '2027-05-16T06:00:00Z', TIMESTAMPTZ '2027-05-16T18:00:00Z')
      `;
      return missionId;
    }

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);

      const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgAId = (organisations[0]?.id ?? '') as string;
      if (!orgAId) {
        throw new Error('Seed « ait-aissi » absente (pnpm -F @azzel/web db:migrate).');
      }
      const editions = await sql`
        SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${orgAId}
      `;
      editionAId = (editions[0]?.id ?? '') as string;
      if (!editionAId) {
        throw new Error('Seed édition « 2027 » absente.');
      }

      // Organisation B minimale (DML uniquement) + son édition propre.
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      editionBId = randomUUID();
      const epreuveBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-chrono-${orgBId.slice(0, 8)}`}, 'Chrono Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`chrono-${orgBId.slice(0, 8)}`}, 'Chrono Autre Trail')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionBId}, ${orgBId}, ${evenementBId}, '2027', 'Autre 2027',
                DATE '2027-05-01', TIMESTAMPTZ '2027-04-20T22:59:59Z')
      `;
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${epreuveBId}, ${orgBId}, ${editionBId}, 'unique', 'L’Unique', 21.0)
      `;

      await creerCoureur(orgAId, editionAId, JETON_A1, 101);
      await creerCoureur(orgAId, editionAId, JETON_A2, 102);
      await creerCoureur(orgBId, editionBId, JETON_B1, 201);

      checkpointKm12Id = await creerCheckpoint('km12');
      checkpointKm30Id = await creerCheckpoint('km30');
      checkpointArbId = await creerCheckpoint('arbitrage');
      checkpointRejetId = await creerCheckpoint('rejets');
      checkpointRlsId = await creerCheckpoint('rls');
      checkpointRevokId = await creerCheckpoint('revocation');

      volontaireA = {
        accountId: randomUUID(),
        organisationId: orgAId,
        email: `volontaire-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      organisateurA = {
        accountId: randomUUID(),
        organisationId: orgAId,
        email: `pc-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    function retrait(
      appareilClient: string,
      jeton: string,
      horodatage = '2027-05-16T06:12:30.000Z',
      editionId: string = editionAId,
    ): EvenementSyncTerrain {
      const evenement: RetraitTerrain = {
        version: RETRAIT_SCHEMA_VERSION,
        type: 'retrait',
        editionId,
        jeton,
        horodatage,
        appareilId: appareilClient,
      };
      return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
    }

    function passage(
      appareilClient: string,
      jeton: string,
      checkpointId: string,
      horodatage = '2027-05-16T07:05:09.000Z',
      editionId: string = editionAId,
    ): EvenementSyncTerrain {
      const evenement: PassageTerrain = {
        version: PASSAGE_SCHEMA_VERSION,
        type: 'passage',
        editionId,
        jeton,
        checkpointId,
        horodatage,
        appareilId: appareilClient,
      };
      return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
    }

    /** Enregistre un appareil et résout son auth Bearer prête à sync. */
    async function appareilPret(appareilClient: string, session = volontaireA) {
      const enregistrement = await enregistrerAppareil(session, appareilClient, {
        store: createChronoStore(app),
      });
      const auth = await verifierJetonAppareil(enregistrement.jeton, {
        store: createChronoStore(app),
      });
      return { enregistrement, auth };
    }

    async function compterEvenements(): Promise<number> {
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM terrain_evenement
      `;
      return rows[0]?.count ?? 0;
    }

    it('enregistrement : find-or-create puis ROTATION — l’ancien jeton meurt, le nouveau vit', async () => {
      const premier = await enregistrerAppareil(volontaireA, 'appareil-chrono-x', {
        store: createChronoStore(app),
      });
      expect(premier.rotation).toBe(false);
      expect(premier.jeton.length).toBeGreaterThan(20);

      await expect(
        verifierJetonAppareil(premier.jeton, { store: createChronoStore(app) }),
      ).resolves.toMatchObject({ appareilClient: 'appareil-chrono-x' });

      const second = await enregistrerAppareil(volontaireA, 'appareil-chrono-x', {
        store: createChronoStore(app),
      });
      expect(second.rotation).toBe(true);
      expect(second.appareilId).toBe(premier.appareilId);
      expect(second.jeton).not.toBe(premier.jeton);

      await expect(
        verifierJetonAppareil(premier.jeton, { store: createChronoStore(app) }),
      ).rejects.toBeInstanceOf(JetonAppareilInvalideError);
      await expect(
        verifierJetonAppareil(second.jeton, { store: createChronoStore(app) }),
      ).resolves.toMatchObject({ id: premier.appareilId });
    });

    it('enregistrement concurrent du MÊME appareil client : l’upsert ne crée QU’UNE ligne, aucun échec', async () => {
      const store = createChronoStore(app);
      // Concurrence simulée : deux enregistrements en parallèle (deux onglets).
      const [premier, second] = await Promise.all([
        enregistrerAppareil(volontaireA, 'appareil-chrono-course', { store }),
        enregistrerAppareil(volontaireA, 'appareil-chrono-course', { store }),
      ]);
      expect(premier.appareilId).toBe(second.appareilId);
      const lignes = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM appareil
        WHERE organisation_id = ${orgAId} AND appareil_client = 'appareil-chrono-course'
      `;
      expect(lignes[0]?.count).toBe(1);
      // Le jeton du dernier upsert gagnant fonctionne toujours.
      const gagnant = await verifierJetonAppareil(second.jeton, { store });
      expect(gagnant.appareilClient).toBe('appareil-chrono-course');
    });

    it(`plafond : ${PLAFOND_APPAREILS_PAR_ORG} appareils max par org — le ${PLAFOND_APPAREILS_PAR_ORG + 1}ᵉ est refusé, la rotation reste libre`, async () => {
      const store = createChronoStore(app);
      // Org dédiée au plafond pour ne pas dépendre des autres tests.
      const orgPlafondId = randomUUID();
      const evenementPlafondId = randomUUID();
      const editionPlafondId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgPlafondId}, ${`org-plafond-${orgPlafondId.slice(0, 8)}`}, 'Plafond Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementPlafondId}, ${orgPlafondId}, ${`plafond-${orgPlafondId.slice(0, 8)}`}, 'Plafond Trail')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionPlafondId}, ${orgPlafondId}, ${evenementPlafondId}, '2027', 'Plafond 2027',
                DATE '2027-05-01', TIMESTAMPTZ '2027-04-20T22:59:59Z')
      `;
      const sessionPlafondOrg: SessionRecord = {
        accountId: randomUUID(),
        organisationId: orgPlafondId,
        email: `volontaire-plafond-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      for (let index = 0; index < PLAFOND_APPAREILS_PAR_ORG; index += 1) {
        await enregistrerAppareil(sessionPlafondOrg, `appareil-plafond-${index}`, { store });
      }
      await expect(
        enregistrerAppareil(sessionPlafondOrg, 'appareil-plafond-51', { store }),
      ).rejects.toBeInstanceOf(PlafondAppareilsError);
      // Rotation d'un appareil EXISTANT sous plafond saturé : toujours libre.
      const tourne = await enregistrerAppareil(sessionPlafondOrg, 'appareil-plafond-0', {
        store,
      });
      expect(tourne.rotation).toBe(true);
    });

    it('sync nominale : lot mixte accepté, stocké avec offset journalisé par événement', async () => {
      const avant = await compterEvenements();
      const { auth } = await appareilPret('appareil-chrono-nominal');

      const lot = [
        retrait('appareil-chrono-nominal', JETON_A1),
        passage('appareil-chrono-nominal', JETON_A1, checkpointKm12Id),
        passage('appareil-chrono-nominal', JETON_A2, checkpointKm12Id),
      ];
      const reponse = await synchroniserLot(auth, { evenements: lot }, {
        store: createChronoStore(app),
      });
      expect(reponse.resultats.map((r) => r.statut)).toEqual(['accepté', 'accepté', 'accepté']);
      expect(reponse.compteurs).toEqual({ acceptes: 3, dejaConnus: 0, rejetes: 0 });
      expect(await compterEvenements()).toBe(avant + 3);

      // AD-3 : l'offset estimé est journalisé PAR événement (donnée d'audit),
      // exactement reception serveur − heure appareil.
      const cleRetraitNominal = lot[0]?.cle ?? '';
      const rows = await sql`
        SELECT cle_idempotence, offset_estime_ms, horodatage_reception,
               horodatage_appareil, checkpoint_id, type
        FROM terrain_evenement
        WHERE cle_idempotence = ${cleRetraitNominal}
      `;
      const row = rows[0];
      expect(row?.type).toBe('retrait');
      expect(row?.checkpoint_id).toBeNull();
      expect(Number(row?.offset_estime_ms)).toBe(
        new Date(reponse.recuA).getTime() - new Date('2027-05-16T06:12:30.000Z').getTime(),
      );
    });

    it('rejeu INTÉGRAL : tout « déjà-connu », AUCUN doublon en base (ON CONFLICT)', async () => {
      const { auth } = await appareilPret('appareil-chrono-rejeu');
      const lot = [
        retrait('appareil-chrono-rejeu', JETON_A1, '2027-05-16T06:13:00.000Z'),
        passage('appareil-chrono-rejeu', JETON_A2, checkpointKm30Id),
      ];
      const store = createChronoStore(app);
      const premiere = await synchroniserLot(auth, { evenements: lot }, { store });
      expect(premiere.compteurs).toEqual({ acceptes: 2, dejaConnus: 0, rejetes: 0 });

      const apresPremiere = await compterEvenements();
      // Crash avant ack : le client REJOUE le lot entier à l'identique.
      const seconde = await synchroniserLot(auth, { evenements: lot }, { store });
      expect(seconde.resultats.map((r) => r.statut)).toEqual(['déjà-connu', 'déjà-connu']);
      expect(seconde.compteurs).toEqual({ acceptes: 0, dejaConnus: 2, rejetes: 0 });
      expect(await compterEvenements()).toBe(apresPremiere);
    });

    it('arbitrage : deux appareils scannent le MÊME passage — le premier reçu fait foi (AD-3)', async () => {
      const store = createChronoStore(app);
      const { auth: authX } = await appareilPret('appareil-chrono-x2');
      const { auth: authY } = await appareilPret('appareil-chrono-y2');

      // X passe d'abord (coureur A2 au km 12), Y ré-scanne derrière.
      const passageX = passage('appareil-chrono-x2', JETON_A2, checkpointArbId, '2027-05-16T07:10:00.000Z');
      const passageY = passage('appareil-chrono-y2', JETON_A2, checkpointArbId, '2027-05-16T07:11:00.000Z');
      const lotX = await synchroniserLot(authX, { evenements: [passageX] }, { store });
      const lotY = await synchroniserLot(authY, { evenements: [passageY] }, { store });
      expect(lotX.compteurs.acceptes).toBe(1);
      // Le second n'est PAS un doublon : accepté, stocké pour audit, NEUTRE
      // pour le classement (l'arbitrage se lit, jamais ne supprime).
      expect(lotY.compteurs.acceptes).toBe(1);

      const arbitre = await premierRecu(
        volontaireA,
        { editionId: editionAId, jeton: JETON_A2, checkpointId: checkpointArbId },
        { store },
      );
      expect(arbitre?.appareilId).toBe('appareil-chrono-x2');
      expect(arbitre?.cleIdempotence).toBe(passageX.cle);

      // Retrait : même arbitrage, clé naturelle sans checkpoint (NULL).
      const retraitX = retrait('appareil-chrono-x2', JETON_A2, '2027-05-16T06:15:00.000Z');
      await synchroniserLot(authX, { evenements: [retraitX] }, { store });
      const premierRetrait = await premierRecu(
        volontaireA,
        { editionId: editionAId, jeton: JETON_A2, checkpointId: null },
        { store },
      );
      expect(premierRetrait?.appareilId).toBe('appareil-chrono-x2');
    });

    it('rejets : jeton inconnu et coureur d’une AUTRE org → coureur inconnu, non stocké', async () => {
      const store = createChronoStore(app);
      const { auth } = await appareilPret('appareil-chrono-rejets');
      const avant = await compterEvenements();

      const inconnu = passage('appareil-chrono-rejets', jetonBase64url('fantome'), checkpointRejetId);
      const autreOrg = passage('appareil-chrono-rejets', JETON_B1, checkpointRejetId);
      const valide = passage('appareil-chrono-rejets', JETON_A1, checkpointRejetId);

      const reponse = await synchroniserLot(auth, { evenements: [inconnu, autreOrg, valide] }, { store });
      expect(reponse.resultats).toEqual([
        { cle: inconnu.cle, statut: 'rejeté', motif: 'coureur inconnu' },
        { cle: autreOrg.cle, statut: 'rejeté', motif: 'coureur inconnu' },
        { cle: valide.cle, statut: 'accepté' },
      ]);
      expect(reponse.compteurs).toEqual({ acceptes: 1, dejaConnus: 0, rejetes: 2 });
      expect(await compterEvenements()).toBe(avant + 1);
    });

    it('checkpoint fantôme : mission inexistante (ou non-UUID) → « checkpoint inconnu », NON stocké', async () => {
      const store = createChronoStore(app);
      const { auth } = await appareilPret('appareil-chrono-checkpoint');
      const avant = await compterEvenements();

      const fantomeUuid = passage(
        'appareil-chrono-checkpoint',
        JETON_A1,
        randomUUID(), // UUID bien formé mais AUCUNE mission scan_checkpoint derrière.
      );
      const pasUuid = passage('appareil-chrono-checkpoint', JETON_A1, 'mission-fantome-texte');
      const valide = passage('appareil-chrono-checkpoint', JETON_A1, checkpointKm12Id);

      const reponse = await synchroniserLot(
        auth,
        { evenements: [fantomeUuid, pasUuid, valide] },
        { store },
      );
      expect(reponse.resultats).toEqual([
        { cle: fantomeUuid.cle, statut: 'rejeté', motif: 'checkpoint inconnu' },
        { cle: pasUuid.cle, statut: 'rejeté', motif: 'checkpoint inconnu' },
        { cle: valide.cle, statut: 'accepté' },
      ]);
      // Seul l'événement au checkpoint RÉEL est stocké.
      expect(await compterEvenements()).toBe(avant + 1);
      const stockes = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM terrain_evenement
        WHERE cle_idempotence = ${fantomeUuid.cle}
      `;
      expect(stockes[0]?.count).toBe(0);
    });

    it('contrat invalide : clé forgée rejetée PAR ÉVÉNEMENT (« contrat invalide »), JAMAIS stockée', async () => {
      const store = createChronoStore(app);
      const { auth } = await appareilPret('appareil-chrono-forgé');
      const avant = await compterEvenements();
      const forge = { ...passage('appareil-chrono-forgé', JETON_A1, checkpointRejetId), cle: 'cle:forgée' };
      const reponse = await synchroniserLot(auth, { evenements: [forge] }, { store });
      expect(reponse.resultats).toEqual([
        { cle: 'cle:forgée', statut: 'rejeté', motif: 'contrat invalide' },
      ]);
      expect(await compterEvenements()).toBe(avant);
    });

    it('RLS : les événements de l’org A sont INVISIBLES sous GUC B (aucun WHERE applicatif)', async () => {
      const { auth } = await appareilPret('appareil-chrono-rls');
      await synchroniserLot(
        auth,
        { evenements: [passage('appareil-chrono-rls', JETON_A1, checkpointRlsId)] },
        { store: createChronoStore(app) },
      );
      const vus = (await withOrg(app, orgBId, (tx) =>
        tx.unsafe('SELECT organisation_id FROM terrain_evenement'),
      )) as unknown as { organisation_id: string }[];
      expect(vus).toEqual([]);
      // Et les appareils de A sont invisibles sous GUC B aussi.
      const appareilsVus = (await withOrg(app, orgBId, (tx) =>
        tx.unsafe('SELECT organisation_id FROM appareil'),
      )) as unknown as { organisation_id: string }[];
      expect(appareilsVus).toEqual([]);
    });

    it('révocation (AD-5) : 401 dédié après, sync IMPOSSIBLE, ré-enregistrement refusé, liste PC à jour', async () => {
      const store = createChronoStore(app);
      const { enregistrement, auth } = await appareilPret('appareil-chrono-revok');
      // La sync passe AVANT la révocation.
      await synchroniserLot(
        auth,
        { evenements: [passage('appareil-chrono-revok', JETON_A1, checkpointRevokId)] },
        { store },
      );

      const revoque = await revoquerAppareil(organisateurA, enregistrement.appareilId, { store });
      expect(revoque.revokedAt).not.toBeNull();

      // Bearer révoqué → 401 DÉDIÉ (pas un jeton inconnu) : la garde du canal
      // (route) refuse avant toute ingestion — preuve par le service.
      const avant = await compterEvenements();
      await expect(verifierJetonAppareil(enregistrement.jeton, { store })).rejects.toBeInstanceOf(
        AppareilRevokedError,
      );
      expect(await compterEvenements()).toBe(avant);

      // Ré-enregistrement du même appareil client : REFUSÉ — assistance
      // humaine, jamais de retour silencieux.
      await expect(
        enregistrerAppareil(volontaireA, 'appareil-chrono-revok', { store }),
      ).rejects.toBeInstanceOf(AppareilRevokedError);

      // Révocation idempotente : la PREMIÈRE date d'audit est conservée.
      const revoqueDeuxieme = await revoquerAppareil(organisateurA, enregistrement.appareilId, {
        store,
      });
      expect(revoqueDeuxieme.revokedAt?.toISOString()).toBe(revoque.revokedAt?.toISOString());

      const liste = await listerAppareils(organisateurA, { store });
      const fiche = liste.find((a) => a.id === enregistrement.appareilId);
      expect(fiche?.revokedAt).not.toBeNull();
      expect(fiche?.lastSyncAt).not.toBeNull();
    });

    it('la sync ne connaît AUCUNE session : Bearer seul suffit (AD-5, boîte d’envoi immortelle)', async () => {
      // Aucune session dans ce test — uniquement le canal appareil.
      const { enregistrement } = await appareilPret('appareil-chrono-sans-session');
      const auth = await verifierJetonAppareil(enregistrement.jeton, {
        store: createChronoStore(app),
      });
      const reponse = await synchroniserLot(
        auth,
        { evenements: [retrait('appareil-chrono-sans-session', JETON_A1)] },
        { store: createChronoStore(app) },
      );
      expect(reponse.compteurs.acceptes).toBe(1);
    });
  },
);
