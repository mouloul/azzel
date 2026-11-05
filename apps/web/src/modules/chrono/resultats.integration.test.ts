import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  cleIdempotenceEvenement,
  type EvenementSyncTerrain,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import { resetOrganisationIdMemoForTests, withOrg } from '@/db/org-scope';
import type { SessionRecord } from '@/modules/iam/store';
import { createSecteur, createMission } from '@/modules/missions/service';
import { createMissionsStore, type MissionsStore } from '@/modules/missions/store';

import {
  compterVisitePartage,
  enregistrerAppareil,
  enregistrerHeuresDepart,
  getResultatsPublic,
  resetResultatsPublicCacheForTests,
  saisirAbandon,
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

// Story 7.2 — intégration résultats publics partageables (base azzel_test,
// rôle azzel_app) : getResultatsPublic sur l'organisation PAR DÉFAUT (aucune
// session, AD-7), derniers arrivés ordonnés réception DESC sur les MÊMES
// faits arbitrés que les classements (épreuve non configurée → tempsMs null),
// abandons jamais exhibés comme arrivés, comptage anonyme ?partage=1 (N
// chargements = N visites sur l'agrégat du jour, aucune colonne personnelle,
// RLS multi-org), état zéro cohérent. Toutes les heures sont RELATIVES à
// l'horloge réelle : aucune bombe temporelle.

const testUrls = resolveTestDatabaseUrls('resultats');

function jetonBase64url(squelette: string): string {
  return squelette.padEnd(22, 'x').slice(0, 22);
}

const JETON_L1 = jetonBase64url('resultats-l1'); // 201 longue, arrivé lot 1
const JETON_L2 = jetonBase64url('resultats-l2'); // 202 longue, arrivé lot 2 (le + récent)
const JETON_L3 = jetonBase64url('resultats-l3'); // 203 longue, abandonné puis scan tardif
const JETON_M1 = jetonBase64url('resultats-m1'); // 211 moyenne, arrivé lot 1
const JETON_S1 = jetonBase64url('resultats-s1'); // 221 sprint (jamais configurée), arrivé lot 2
const JETON_B1 = jetonBase64url('resultats-b1'); // 901, org B (preuve d'isolation)

function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

describe.skipIf(testUrls === null)(
  'chrono — intégration résultats publics (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;

    let chronoStore: ReturnType<typeof createChronoStore>;
    let missionsStore: MissionsStore;

    let orgAId = '';
    let orgBId = '';
    let editionAId = '';
    let epreuveLongueId = '';
    let epreuveMoyenneId = '';
    let volontaireA: SessionRecord;
    let organisateurA: SessionRecord;

    let checkpointArriveeId = '';

    /** Départs relatifs à l'horloge réelle : Longue il y a 2 h, Moyenne 90 min. */
    const departLongue = new Date(Date.now() - 7_200_000);
    const departMoyenne = new Date(Date.now() - 5_400_000);

    /** Réceptions serveur des lots, ÉTIQUETÉES (aucun indice positionnel). */
    const receptions = new Map<string, string>();

    function organisateurSession(): SessionRecord {
      return {
        accountId: randomUUID(),
        organisationId: orgAId,
        email: `pc-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };
    }

    async function creerCoureur(
      jeton: string,
      dossard: number,
      epreuveSlug: string,
    ): Promise<void> {
      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${orgAId}, ${`coureur-${accountId}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${orgAId}, ${accountId}, ${editionAId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionAId} AND slug = ${epreuveSlug} LIMIT 1),
          'Prenom', 'Nom', '+213555010998', 'Contact', '0555010997',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', ${dossard}, ${jeton}
        )
      `;
    }

    function retrait(appareilClient: string, jeton: string): EvenementSyncTerrain {
      const evenement: RetraitTerrain = {
        version: RETRAIT_SCHEMA_VERSION,
        type: 'retrait',
        editionId: editionAId,
        jeton,
        horodatage: new Date().toISOString(),
        appareilId: appareilClient,
      };
      return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
    }

    function passage(
      appareilClient: string,
      jeton: string,
      checkpointId: string,
    ): EvenementSyncTerrain {
      const evenement: PassageTerrain = {
        version: PASSAGE_SCHEMA_VERSION,
        type: 'passage',
        editionId: editionAId,
        jeton,
        checkpointId,
        horodatage: new Date().toISOString(),
        appareilId: appareilClient,
      };
      return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
    }

    /** Sync un lot, journalise sa réception serveur sous une ÉTIQUETTE. */
    async function sync(
      etiquette: string,
      appareilClient: string,
      evenements: EvenementSyncTerrain[],
    ): Promise<void> {
      const enregistrement = await enregistrerAppareil(volontaireA, appareilClient, {
        store: chronoStore,
      });
      const auth = await verifierJetonAppareil(enregistrement.jeton, { store: chronoStore });
      const reponse = await synchroniserLot(auth, { evenements }, { store: chronoStore });
      expect(reponse.compteurs.rejetes).toBe(0);
      receptions.set(etiquette, reponse.recuA);
    }

    /** Temps attendu : réception du lot étiqueté − heure de départ officielle. */
    function temps(depart: Date, etiquette: string): number {
      const recue = receptions.get(etiquette);
      if (recue === undefined) {
        throw new Error(`réception « ${etiquette} » inconnue`);
      }
      return new Date(recue).getTime() - depart.getTime();
    }

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      chronoStore = createChronoStore(app);
      missionsStore = createMissionsStore(app);
      // Le memo slug → id doit refléter CETTE base (les suites se suivent,
      // chacune recrée azzel_test).
      resetOrganisationIdMemoForTests();

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

      const epreuvesA = await sql<{ id: string; slug: string }[]>`
        SELECT id, slug FROM epreuve WHERE edition_id = ${editionAId} AND organisation_id = ${orgAId}
      `;
      epreuveLongueId = epreuvesA.find((e) => e.slug === 'longue')!.id;
      epreuveMoyenneId = epreuvesA.find((e) => e.slug === 'moyenne')!.id;
      // Le sprint reste NON configuré (configure:false attendu).
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (
          ${randomUUID()}, ${orgAId}, ${editionAId}, 'sprint', 'Le Sprint — 5 km', 5.0
        )
        ON CONFLICT DO NOTHING
      `;

      // Org B isolée (preuve RLS du comptage).
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      const editionBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-resultats-${orgBId.slice(0, 8)}`}, 'Resultats Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`resultats-${orgBId.slice(0, 8)}`}, 'Autre Trail')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionBId}, ${orgBId}, ${evenementBId}, '2027', 'Autre 2027',
                DATE '2027-05-01', TIMESTAMPTZ '2027-04-20T22:59:59Z')
      `;
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${randomUUID()}, ${orgBId}, ${editionBId}, 'unique', 'L’Unique', 21.0)
      `;

      await creerCoureur(JETON_L1, 201, 'longue');
      await creerCoureur(JETON_L2, 202, 'longue');
      await creerCoureur(JETON_L3, 203, 'longue');
      await creerCoureur(JETON_M1, 211, 'moyenne');
      await creerCoureur(JETON_S1, 221, 'sprint');

      const secteur = await createSecteur(
        organisateurSession(),
        { nom: 'Secteur arrivée', lieu: 'Stade', contact: null },
        { store: missionsStore },
      );
      const missionArrivee = await createMission(
        organisateurSession(),
        {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan arrivée stade',
          debutLe: '2020-01-01T00:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: true,
        },
        { store: missionsStore },
      );
      checkpointArriveeId = missionArrivee.id;

      volontaireA = {
        accountId: randomUUID(),
        organisationId: orgAId,
        email: `volontaire-${randomUUID()}@test.azzel`,
        role: 'volontaire',
        createdAt: new Date(),
      };
      organisateurA = organisateurSession();

      // Heures de départ officielles : Longue et Moyenne (le sprint NON).
      await enregistrerHeuresDepart(
        organisateurA,
        {
          heures: [
            { epreuveId: epreuveLongueId, heureDepart: departLongue.toISOString() },
            { epreuveId: epreuveMoyenneId, heureDepart: departMoyenne.toISOString() },
          ],
        },
        { store: chronoStore },
      );
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    beforeEach(() => {
      // Le micro-cache de getResultatsPublic est un état module : chaque test
      // doit lire l'état FRAIS de la base (les syncs arrivent entre les tests).
      resetResultatsPublicCacheForTests();
    });

    it('avant tout départ : état vide cohérent — épreuves servies, AUCUN partant, fraîcheur nulle, libellé provisoire', async () => {
      const resultats = await getResultatsPublic({ store: chronoStore });
      expect(resultats.classements.libelle).toBe('Classement provisoire');
      expect(resultats.classements.fraicheur).toBeNull();
      expect(resultats.classements.epreuves.map((e) => [e.epreuveSlug, e.configure])).toEqual([
        ['longue', true],
        ['moyenne', true],
        ['sprint', false],
      ]);
      expect(resultats.classements.epreuves.every((e) => e.lignes.length === 0)).toBe(true);
      expect(resultats.derniersArrives).toEqual([]);
    });

    it('jour J : derniers arrivés ordonnés réception DESC (mêmes faits arbitrés que les classements), temps par épreuve', async () => {
      await attendre(10);
      await sync('depart', 'resultats-appareil-depart', [
        retrait('resultats-appareil-depart', JETON_L1),
        retrait('resultats-appareil-depart', JETON_L2),
        retrait('resultats-appareil-depart', JETON_L3),
        retrait('resultats-appareil-depart', JETON_M1),
        retrait('resultats-appareil-depart', JETON_S1),
      ]);
      await attendre(10);
      // Lot 1 : L1, M1. Lot 2 (PLUS RÉCENT) : L2, S1 — l'ordre DESC attendu
      // en découle mécaniquement.
      await sync('arrivee-1', 'resultats-appareil-arrivee-1', [
        passage('resultats-appareil-arrivee-1', JETON_L1, checkpointArriveeId),
        passage('resultats-appareil-arrivee-1', JETON_M1, checkpointArriveeId),
      ]);
      await attendre(10);
      await sync('arrivee-2', 'resultats-appareil-arrivee-2', [
        passage('resultats-appareil-arrivee-2', JETON_L2, checkpointArriveeId),
        passage('resultats-appareil-arrivee-2', JETON_S1, checkpointArriveeId),
      ]);

      const resultats = await getResultatsPublic({ store: chronoStore });
      // Ordre = réception serveur DESC, dans PUIS entre lots ; ex æquo de
      // réception → dossard ASC.
      expect(resultats.derniersArrives).toEqual([
        { dossard: 202, epreuveSlug: 'longue', epreuveNom: 'La Longue', tempsMs: temps(departLongue, 'arrivee-2') },
        { dossard: 221, epreuveSlug: 'sprint', epreuveNom: 'Le Sprint — 5 km', tempsMs: null },
        { dossard: 201, epreuveSlug: 'longue', epreuveNom: 'La Longue', tempsMs: temps(departLongue, 'arrivee-1') },
        { dossard: 211, epreuveSlug: 'moyenne', epreuveNom: 'La Moyenne', tempsMs: temps(departMoyenne, 'arrivee-1') },
      ]);
      // Les classements restent CEUX de 7.1, lus tels quels (203 encore en
      // course à ce stade — l'abandon vient au test suivant).
      const longue = resultats.classements.epreuves.find((e) => e.epreuveSlug === 'longue');
      expect(longue?.lignes.map((l) => [l.dossard, l.rang])).toEqual([[201, 1], [202, 2], [203, null]]);
      // Anonymat : le contrat public ne porte que des dossards.
      expect(JSON.stringify(resultats)).not.toMatch(/jeton|first_name|email/i);
    });

    it('abandonné au scan d’arrivée tardif : JAMAIS exhibé comme arrivé (ni derniers arrivés, ni rangé)', async () => {
      const abandon = await saisirAbandon(
        organisateurA,
        { dossard: 203, lieu: 'Col 1200', motif: 'epuisement', heure: new Date().toISOString() },
        { store: chronoStore },
      );
      expect(abandon.dossard).toBe(203);

      await attendre(10);
      await sync('arrivee-203-tardif', 'resultats-appareil-203-tardif', [
        passage('resultats-appareil-203-tardif', JETON_L3, checkpointArriveeId),
      ]);

      const resultats = await getResultatsPublic({ store: chronoStore });
      expect(resultats.derniersArrives.some((arrive) => arrive.dossard === 203)).toBe(false);
      const longue = resultats.classements.epreuves.find((e) => e.epreuveSlug === 'longue');
      expect(longue?.abandons).toEqual([203]);
      expect(longue?.lignes.find((l) => l.dossard === 203)).toMatchObject({
        statut: 'abandonné',
        rang: null,
        tempsMs: null,
      });
    });

    it('comptage ?partage=1 : TROIS chargements = TROIS visites sur l’agrégat du jour (upsert, pas de doublon de ligne)', async () => {
      await compterVisitePartage({ store: chronoStore });
      await compterVisitePartage({ store: chronoStore });
      await compterVisitePartage({ store: chronoStore });

      // jour = CURRENT_DATE côté BASE : la frontière du jour est comparée
      // DANS la requête (jamais d'aller-retour Date JS ⇄ fuseaux).
      const lignes = await sql`
        SELECT edition_id, visites, (jour = CURRENT_DATE) AS aujourdhui
        FROM resultats_visite
        WHERE organisation_id = ${orgAId}
      `;
      expect(lignes).toHaveLength(1);
      const ligne = lignes[0]!;
      expect(ligne.edition_id).toBe(editionAId);
      expect(ligne.aujourdhui).toBe(true);
      expect(ligne.visites).toBe(3);
    });

    it('AUCUNE donnée personnelle : la table ne porte QUE l’agrégat (colonnes exactes, aucune IP/UA/identité)', async () => {
      const colonnes = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'resultats_visite'
        ORDER BY column_name
      `;
      expect(colonnes.map((row) => row.column_name)).toEqual([
        'edition_id',
        'id',
        'jour',
        'organisation_id',
        'visites',
      ]);
    });

    it('RLS multi-org : l’org B compte chez ELLE, l’agrégat de l’org A est introuvable sous GUC B (et réciproquement)', async () => {
      // B compte une visite chez elle (édition B courante).
      await chronoStore.compterVisitePartage(orgBId);
      const sousB = (await withOrg(app, orgBId, (tx) =>
        tx`SELECT organisation_id, visites FROM resultats_visite`,
      )) as unknown as { organisation_id: string; visites: number }[];
      expect(sousB.every((row) => row.organisation_id === orgBId)).toBe(true);
      expect(sousB).toHaveLength(1);
      expect(sousB[0]!.visites).toBe(1);

      // Sous GUC A (rôle applicatif, SANS WHERE applicatif) : la ligne de B
      // est introuvable, l'agrégat de A (3 visites) intact.
      const sousA = (await withOrg(app, orgAId, (tx) =>
        tx`SELECT organisation_id, visites FROM resultats_visite`,
      )) as unknown as { organisation_id: string; visites: number }[];
      expect(sousA.every((row) => row.organisation_id === orgAId)).toBe(true);
      expect(sousA[0]!.visites).toBe(3);
    });

    it('résultats publics = organisation PAR DÉFAUT uniquement : aucun coureur d’une autre org ne fuite', async () => {
      // Chez l'org B : un coureur VALIDÉ/numéroté réellement PARTI (retrait
      // arbitré inséré au propriétaire — les fixtures lisent, l'insert passe
      // le RLS pour semer l'état de course B).
      const editionsB = await sql`SELECT id FROM edition WHERE organisation_id = ${orgBId}`;
      const editionBId = editionsB[0]!.id;
      const epreuvesB = await sql`SELECT id FROM epreuve WHERE organisation_id = ${orgBId}`;
      const epreuveBId = epreuvesB[0]!.id;
      const accountIdB = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountIdB}, ${orgBId}, ${`b-${randomUUID()}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${orgBId}, ${accountIdB}, ${editionBId}, ${epreuveBId},
          'Prenom', 'Nom', '+213555010999', 'Contact', '0555010998',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', 901, ${JETON_B1}
        )
      `;
      await sql`
        INSERT INTO terrain_evenement (
          organisation_id, cle_idempotence, type, edition_id, jeton_coureur,
          checkpoint_id, horodatage_appareil, horodatage_reception,
          offset_estime_ms, appareil_id
        )
        VALUES (
          ${orgBId}, ${randomUUID()}, 'retrait', ${editionBId}, ${JETON_B1},
          NULL, now(), now(), 0, 'resultats-appareil-org-b'
        )
      `;

      // Preuve du vivant côté B : la lecture org-scopée B voit bien 901.
      const classementsB = await chronoStore.classements(orgBId);
      const uniqueB = classementsB.epreuves.find((e) => e.slug === 'unique');
      expect(uniqueB?.lignes.map((l) => l.dossard)).toEqual([901]);

      // Le public ne voit QUE l'organisation par défaut : ni l'épreuve de B,
      // ni son coureur, ni ses arrivées.
      const resultats = await getResultatsPublic({ store: chronoStore });
      expect(resultats.classements.epreuves.map((e) => e.epreuveSlug)).not.toContain('unique');
      const dossards = resultats.classements.epreuves.flatMap((e) => e.lignes.map((l) => l.dossard));
      expect(dossards).not.toContain(901);
      expect(resultats.derniersArrives.some((arrive) => arrive.dossard === 901)).toBe(false);
    });
  },
);
