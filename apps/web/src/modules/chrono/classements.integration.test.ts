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
import { createMission, createSecteur } from '@/modules/missions/service';
import { createMissionsStore, type MissionsStore } from '@/modules/missions/store';

import {
  annulerPassage,
  enregistrerAppareil,
  enregistrerHeuresDepart,
  getClassements,
  saisirAbandon,
  synchroniserLot,
  verifierJetonAppareil,
} from './service';
import { createChronoStore } from './store';
import {
  HeuresDepartEpreuveInconnueError,
  HeuresDepartSansEditionError,
  InvalidHeuresDepartFieldsError,
} from './errors';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 7.1 — intégration classements par épreuve et heures de départ (base
// azzel_test, rôle azzel_app) : départs échelonnés (2 épreuves configurées,
// ordre d'arrivée BRUT ≠ ordre des temps), scratch + ex æquo (1, 1, 3),
// catégories d'âge servies, abandonné listé non rangé (scan d'arrivée tardif
// neutre), en-course sans rang, annulation 5.4 ré-arbitrée EN LECTURE (le
// SECOND passage fait foi), AD-3 (scan de départ SANS effet, avant ET après
// l'heure officielle), heure absente → configure:false sans temps, non
// partant et fantôme absents, fraîcheur/libellé provisoire, RLS multi-org.
//
// Heures de départ : configuration organisateur (PUT service), recalcul des
// temps après déplacement, effacement (NULL), refus ISO invalide et épreuve
// inconnue (RLS comprise).
//
// Toutes les heures sont RELATIVES à l'horloge réelle (réceptions serveur =
// now) : aucune bombe temporelle.

const testUrls = resolveTestDatabaseUrls('classements');

function jetonBase64url(squelette: string): string {
  return squelette.padEnd(22, 'x').slice(0, 22);
}

const JETON_L1 = jetonBase64url('classements-l1'); // 201 longue, ex æquo
const JETON_L2 = jetonBase64url('classements-l2'); // 202 longue, ex æquo
const JETON_L3 = jetonBase64url('classements-l3'); // 203 longue, lot suivant
const JETON_L4 = jetonBase64url('classements-l4'); // 204 longue, en course
const JETON_L5 = jetonBase64url('classements-l5'); // 205 longue, abandonné (arrivée tardive)
const JETON_L6 = jetonBase64url('classements-l6'); // 206 longue, annulation ré-arbitrée
const JETON_X = jetonBase64url('classements-x'); // 221 longue, retrait AVANT l'heure officielle
const JETON_Y = jetonBase64url('classements-y'); // 222 longue, retrait APRÈS l'heure officielle
const JETON_M1 = jetonBase64url('classements-m1'); // 211 moyenne
const JETON_S1 = jetonBase64url('classements-s1'); // 241 sprint (heure jamais configurée)
const JETON_N1 = jetonBase64url('classements-n1'); // 231 longue, validé/numéroté JAMAIS retiré
const JETON_F1 = jetonBase64url('classements-f1'); // fantôme : validé sans dossard

function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

describe.skipIf(testUrls === null)(
  'chrono — intégration classements par épreuve (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;

    let chronoStore: ReturnType<typeof createChronoStore>;
    let missionsStore: MissionsStore;

    let orgAId = '';
    let orgBId = '';
    /** Org SANS aucune édition : la config des heures n'a rien à configurer. */
    let orgCId = '';
    let editionAId = '';
    let epreuveLongueId = '';
    let epreuveMoyenneId = '';
    let epreuveSprintId = '';
    let volontaireA: SessionRecord;
    let organisateurA: SessionRecord;
    let organisateurB: SessionRecord;
    let organisateurC: SessionRecord;

    let checkpointArriveeId = '';

    /**
     * Départs échelonnés RELATIFS à l'horloge réelle : la Longue part il y a
     * 2 h, la Moyenne il y a 90 min (30 min d'écart) — les réceptions serveur
     * (~maintenant) donnent des temps honnêtes, l'écart entre épreuves prouve
     * le classement relatif.
     */
    const departLongue = new Date(Date.now() - 7_200_000);
    const departMoyenne = new Date(Date.now() - 5_400_000);

    /**
     * Réceptions serveur des lots syncés, ÉTIQUETÉES par lot (aucun indice
     * positionnel : chaque test nomme le lot dont il calcule le temps).
     */
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
      dossard: number | null,
      epreuveSlug: string,
      categorieAge: string,
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
          DATE '1990-05-12', 'M', 36, ${categorieAge}, 'validé', ${dossard}, ${jeton}
        )
      `;
    }

    function retrait(appareilClient: string, jeton: string, horodatage: string): EvenementSyncTerrain {
      const evenement: RetraitTerrain = {
        version: RETRAIT_SCHEMA_VERSION,
        type: 'retrait',
        editionId: editionAId,
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
      horodatage: string,
    ): EvenementSyncTerrain {
      const evenement: PassageTerrain = {
        version: PASSAGE_SCHEMA_VERSION,
        type: 'passage',
        editionId: editionAId,
        jeton,
        checkpointId,
        horodatage,
        appareilId: appareilClient,
      };
      return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
    }

    /** Sync un lot, journalise sa réception serveur sous une ÉTIQUETTE explicite. */
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
        throw new Error(`réception « ${etiquette} » inconnue (lots syncés : ${[...receptions.keys()].join(', ')})`);
      }
      return new Date(recue).getTime() - depart.getTime();
    }

    async function classement(slug: string) {
      const classements = await getClassements(orgAId, { store: chronoStore });
      const epreuve = classements.epreuves.find((e) => e.epreuveSlug === slug);
      expect(epreuve).toBeDefined();
      return epreuve!;
    }

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      chronoStore = createChronoStore(app);
      missionsStore = createMissionsStore(app);

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

      // Troisième épreuve SANS heure de départ (configure:false attendu).
      epreuveSprintId = randomUUID();
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${epreuveSprintId}, ${orgAId}, ${editionAId}, 'sprint', 'Le Sprint — 5 km', 5.0)
      `;
      const epreuvesA = await sql<{ id: string; slug: string }[]>`
        SELECT id, slug FROM epreuve WHERE edition_id = ${editionAId} AND organisation_id = ${orgAId}
      `;
      epreuveLongueId = epreuvesA.find((e) => e.slug === 'longue')!.id;
      epreuveMoyenneId = epreuvesA.find((e) => e.slug === 'moyenne')!.id;

      // Org B minimale + son édition/épreuve (preuve RLS).
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      const editionBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-classements-${orgBId.slice(0, 8)}`}, 'Classements Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`classements-${orgBId.slice(0, 8)}`}, 'Autre Trail')
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

      // Org C : organisation SANS édition — « aucune édition en cours ».
      orgCId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgCId}, ${`org-sans-edition-${orgCId.slice(0, 8)}`}, 'Org Sans Édition')
      `;

      // Coureurs : catégories d'âge VARIÉES (servies dans les lignes).
      await creerCoureur(JETON_L1, 201, 'longue', 'Senior');
      await creerCoureur(JETON_L2, 202, 'longue', 'V1');
      await creerCoureur(JETON_L3, 203, 'longue', 'V2');
      await creerCoureur(JETON_L4, 204, 'longue', 'Senior');
      await creerCoureur(JETON_L5, 205, 'longue', 'V2');
      await creerCoureur(JETON_L6, 206, 'longue', 'Senior');
      await creerCoureur(JETON_X, 221, 'longue', 'Senior');
      await creerCoureur(JETON_Y, 222, 'longue', 'V3');
      await creerCoureur(JETON_M1, 211, 'moyenne', 'Senior');
      await creerCoureur(JETON_S1, 241, 'sprint', 'Senior');
      await creerCoureur(JETON_N1, 231, 'longue', 'Senior');
      await creerCoureur(JETON_F1, null, 'longue', 'Senior');

      // Checkpoint d'arrivée de l'édition (coché dès la création — service).
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
      organisateurB = {
        accountId: randomUUID(),
        organisationId: orgBId,
        email: `pc-b-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };
      organisateurC = {
        accountId: randomUUID(),
        organisationId: orgCId,
        email: `pc-c-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };

      // Heures de départ officielles : Longue 09:00, Moyenne 09:30 (relatives
      // → il y a 2 h / 90 min) — le Sprint reste NON configuré.
      const epreuves = await enregistrerHeuresDepart(
        organisateurA,
        {
          heures: [
            { epreuveId: epreuveLongueId, heureDepart: departLongue.toISOString() },
            { epreuveId: epreuveMoyenneId, heureDepart: departMoyenne.toISOString() },
          ],
        },
        { store: chronoStore },
      );
      expect(epreuves.find((e) => e.epreuveId === epreuveLongueId)?.heureDepart).toBe(
        departLongue.toISOString(),
      );
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    it('avant tout départ : épreuves servies avec configure et heureDepart ISO, AUCUNE ligne (personne n’est parti), fraîcheur nulle, libellé provisoire', async () => {
      const classements = await getClassements(orgAId, { store: chronoStore });
      expect(classements.libelle).toBe('Classement provisoire');
      expect(classements.fraicheur).toBeNull();
      expect(new Date(classements.genereA).toString()).not.toBe('Invalid Date');
      expect(classements.epreuves.map((e) => [e.epreuveSlug, e.configure])).toEqual([
        ['longue', true],
        ['moyenne', true],
        ['sprint', false],
      ]);
      expect(classements.epreuves.every((e) => e.lignes.length === 0)).toBe(true);
      // Le non-partant (231, jamais retiré) et le fantôme (sans dossard) ne
      // sont nulle part — même après les retraits ci-dessous pour le premier.
    });

    it('après les retraits : partants par épreuve TOUS « en course » (sans rang ni temps), non partant et fantôme absents', async () => {
      await attendre(10);
      await sync('depart', 'classements-appareil-depart', [
        // AD-3 : horodatages APPAREIL volontairement avant/après l'heure
        // officielle — ils ne doivent JAMAIS entrer dans le calcul.
        retrait('classements-appareil-depart', JETON_X, new Date(departLongue.getTime() - 10_800_000).toISOString()),
        retrait('classements-appareil-depart', JETON_Y, new Date(departLongue.getTime() + 1_800_000).toISOString()),
        retrait('classements-appareil-depart', JETON_L1, new Date(departLongue.getTime() - 600_000).toISOString()),
        retrait('classements-appareil-depart', JETON_L2, new Date(departLongue.getTime() - 500_000).toISOString()),
        retrait('classements-appareil-depart', JETON_L3, new Date(departLongue.getTime() - 400_000).toISOString()),
        retrait('classements-appareil-depart', JETON_L4, new Date(departLongue.getTime() - 300_000).toISOString()),
        retrait('classements-appareil-depart', JETON_L5, new Date(departLongue.getTime() - 200_000).toISOString()),
        retrait('classements-appareil-depart', JETON_L6, new Date(departLongue.getTime() - 100_000).toISOString()),
        retrait('classements-appareil-depart', JETON_M1, new Date(departMoyenne.getTime() - 100_000).toISOString()),
        retrait('classements-appareil-depart', JETON_S1, new Date(departLongue.getTime() - 100_000).toISOString()),
        retrait('classements-appareil-depart', JETON_F1, new Date(departLongue.getTime() - 100_000).toISOString()),
      ]);

      const longue = await classement('longue');
      expect(longue.lignes.map((l) => [l.dossard, l.statut])).toEqual([
        [201, 'en-course'],
        [202, 'en-course'],
        [203, 'en-course'],
        [204, 'en-course'],
        [205, 'en-course'],
        [206, 'en-course'],
        [221, 'en-course'],
        [222, 'en-course'],
      ]);
      expect(longue.lignes.every((l) => l.rang === null && l.tempsMs === null)).toBe(true);
      // Non partant (231) et fantôme (sans dossard) : absents du classement.
      expect(longue.lignes.some((l) => l.dossard === 231)).toBe(false);
      const moyenne = await classement('moyenne');
      expect(moyenne.lignes.map((l) => l.dossard)).toEqual([211]);
      const sprint = await classement('sprint');
      expect(sprint.lignes.map((l) => l.dossard)).toEqual([241]);
    });

    it('scratch + EX ÆQUO : deux arrivées de MÊME lot → même temps, rangs 1, 1, puis 3 (rang sauté)', async () => {
      await attendre(10);
      // Lot B : L1 et L2 arrivent ENSEMBLE (même réception serveur) → temps
      // ÉGAUX → ex æquo 1, 1. L6 arrive au lot suivant (réception propre) → 3.
      await sync('arrivee-b', 'classements-appareil-arrivee-b', [
        passage('classements-appareil-arrivee-b', JETON_L1, checkpointArriveeId, new Date().toISOString()),
        passage('classements-appareil-arrivee-b', JETON_L2, checkpointArriveeId, new Date().toISOString()),
      ]);
      await attendre(10);
      await sync('arrivee-b2', 'classements-appareil-arrivee-b2', [
        passage('classements-appareil-arrivee-b2', JETON_L6, checkpointArriveeId, new Date().toISOString()),
      ]);

      const longue = await classement('longue');
      const arrivees = longue.lignes.filter((l) => l.statut === 'arrivé');
      expect(arrivees.map((l) => [l.dossard, l.rang, l.tempsMs])).toEqual([
        [201, 1, temps(departLongue, 'arrivee-b')],
        [202, 1, temps(departLongue, 'arrivee-b')],
        [206, 3, temps(departLongue, 'arrivee-b2')],
      ]);
      // 204 reste en course, SANS rang ni temps, APRÈS les arrivés.
      expect(longue.lignes.find((l) => l.dossard === 204)).toMatchObject({
        dossard: 204,
        statut: 'en-course',
        rang: null,
        tempsMs: null,
      });
    });

    it('départs échelonnés : arrivée BRUTE plus tardive, temps plus PETIT (ordre brut ≠ ordre des temps)', async () => {
      await attendre(10);
      // Lot C : M1 (Moyenne) arrive APRÈS L1 en ordre brut, mais la Moyenne
      // part 30 min plus tard → son temps est PLUS PETIT. Les classements
      // restent SÉPARÉS : M1 n'apparaît que dans le sien.
      await sync('arrivee-c', 'classements-appareil-arrivee-c', [
        passage('classements-appareil-arrivee-c', JETON_M1, checkpointArriveeId, new Date().toISOString()),
        passage('classements-appareil-arrivee-c', JETON_L3, checkpointArriveeId, new Date().toISOString()),
        passage('classements-appareil-arrivee-c', JETON_X, checkpointArriveeId, new Date().toISOString()),
        passage('classements-appareil-arrivee-c', JETON_Y, checkpointArriveeId, new Date().toISOString()),
        // Arrivée du sprint (épreuve SANS heure de départ : statut arrivé,
        // mais jamais de temps — configure:false).
        passage('classements-appareil-arrivee-c', JETON_S1, checkpointArriveeId, new Date().toISOString()),
        // Doublon d'appareil sur L6 : réception PLUS TARDIVE que son premier
        // passage — le PREMIER fait foi tant qu'il n'est pas annulé.
        passage('classements-appareil-arrivee-c2', JETON_L6, checkpointArriveeId, new Date().toISOString()),
      ]);

      const tempsL1 = temps(departLongue, 'arrivee-b');
      const tempsM1 = temps(departMoyenne, 'arrivee-c');
      // Ordre BRUT : L1 arrivé au lot B, M1 au lot C (APRÈS) — ordre des
      // TEMPS : M1 plus PETIT (la Moyenne part 30 min plus tard).
      expect(new Date(receptions.get('arrivee-b')!).getTime()).toBeLessThan(
        new Date(receptions.get('arrivee-c')!).getTime(),
      );
      expect(tempsM1).toBeLessThan(tempsL1);

      const longue = await classement('longue');
      expect(longue.lignes.some((l) => l.dossard === 211)).toBe(false);
      const moyenne = await classement('moyenne');
      expect(moyenne.lignes).toEqual([
        { dossard: 211, rang: 1, tempsMs: tempsM1, statut: 'arrivé', categorieAge: 'Senior' },
      ]);
      // Catégories d'âge servies sans recalcul serveur (filtrables client).
      const categories = longue.lignes.map((l) => l.categorieAge);
      for (const attendue of ['Senior', 'V1', 'V2', 'V3']) {
        expect(categories).toContain(attendue);
      }
    });

    it('AD-3 : le scan de départ (AVANT ou APRÈS l’heure officielle) ne touche JAMAIS le temps — X et Y ex æquo au centime', async () => {
      const longue = await classement('longue');
      const ligneX = longue.lignes.find((l) => l.dossard === 221);
      const ligneY = longue.lignes.find((l) => l.dossard === 222);
      // Retraits appareil : X 3 h AVANT l'heure officielle, Y 30 min APRÈS —
      // les deux arrivent dans le même lot → MÊME temps, ex æquo.
      expect(ligneX?.tempsMs).toBe(temps(departLongue, 'arrivee-c'));
      expect(ligneY?.tempsMs).toBe(ligneX?.tempsMs);
      expect(ligneX?.rang).toBe(ligneY?.rang);
      // Le temps N'EST PAS réception − horodatage appareil (écart de heures).
      expect(ligneX?.tempsMs).not.toBe(
        new Date(receptions.get('arrivee-c')!).getTime() - (departLongue.getTime() - 10_800_000),
      );
    });

    it('abandonné : jamais rangé, dossard LISTÉ À PART — un scan d’arrivée TARDIF ne le fait pas rebasculer', async () => {
      // L5 a été abandonné entre-temps ? Non : l'abandon est saisi ICI, puis
      // son scan d'arrivée (réseau différé) arrive au lot suivant.
      const abandon = await saisirAbandon(
        organisateurA,
        {
          dossard: 205,
          lieu: 'Col 1200',
          motif: 'epuisement',
          heure: new Date().toISOString(),
        },
        { store: chronoStore },
      );
      expect(abandon.dossard).toBe(205);

      await attendre(10);
      await sync('arrivee-205', 'classements-appareil-205-tardif', [
        passage('classements-appareil-205-tardif', JETON_L5, checkpointArriveeId, new Date().toISOString()),
      ]);

      const longue = await classement('longue');
      expect(longue.abandons).toEqual([205]);
      const ligne205 = longue.lignes.find((l) => l.dossard === 205);
      expect(ligne205).toEqual({
        dossard: 205,
        rang: null,
        tempsMs: null,
        statut: 'abandonné',
        categorieAge: 'V2',
      });
      // L'abandonné ferme la marche, APRÈS les arrivés et les en course.
      expect(longue.lignes[longue.lignes.length - 1]?.dossard).toBe(205);
    });

    it('annulation 5.4 : le SECOND passage arrivée fait foi — temps recalculé, rang recalculé (ré-arbitrage en lecture)', async () => {
      // Le premier passage d'arrivée de L6 (lot B, réception plus ancienne)
      // est annulé : son doublon du lot C (réception plus tardive) devient le
      // premier NON ANNULÉ.
      const longueAvant = await classement('longue');
      const tempsAvant = longueAvant.lignes.find((l) => l.dossard === 206)?.tempsMs;

      const premier = await sql<{ id: string }[]>`
        SELECT id FROM terrain_evenement
        WHERE edition_id = ${editionAId}
          AND jeton_coureur = ${JETON_L6}
          AND checkpoint_id = ${checkpointArriveeId}
        ORDER BY horodatage_reception ASC, id ASC
        LIMIT 1
      `;
      expect(premier[0]).toBeDefined();
      const resultat = await annulerPassage(
        organisateurA,
        { evenementId: premier[0]!.id, motif: 'Mauvais scan du dossard voisin' },
        { store: chronoStore },
      );
      expect(resultat.dossard).toBe(206);

      const longueApres = await classement('longue');
      const ligne206 = longueApres.lignes.find((l) => l.dossard === 206);
      expect(ligne206?.tempsMs).toBe(temps(departLongue, 'arrivee-c'));
      expect(ligne206?.tempsMs).not.toBe(tempsAvant);
      // Rangs recalculés : 201/202 ex æquo (1, 1), puis 203/221/222/206 (3, 3, 3, 3).
      expect(
        longueApres.lignes
          .filter((l) => l.statut === 'arrivé')
          .map((l) => [l.dossard, l.rang]),
      ).toEqual([
        [201, 1],
        [202, 1],
        [203, 3],
        [206, 3],
        [221, 3],
        [222, 3],
      ]);
    });

    it('heure de départ ABSENTE (sprint) : configure false, statuts honnêtes mais JAMAIS de temps faux à zéro', async () => {
      const sprint = await classement('sprint');
      expect(sprint.configure).toBe(false);
      expect(sprint.heureDepart).toBeNull();
      expect(sprint.lignes).toEqual([
        { dossard: 241, rang: null, tempsMs: null, statut: 'arrivé', categorieAge: 'Senior' },
      ]);
    });

    it('fraîcheur = max(horodatage_reception) des PASSAGES SEULS — un retrait plus récent ne la fait pas bouger', async () => {
      // Un retrait tardif (nouvel appareil sur le fantôme : clé d'idempotence
      // neuve, aucune ligne de classement concernée) arrive APRÈS le dernier
      // passage : la fraîcheur du contrat classements reste le dernier
      // PASSAGE reçu.
      await attendre(10);
      await sync('retrait-tardif', 'classements-appareil-retrait-tardif', [
        retrait('classements-appareil-retrait-tardif', JETON_F1, new Date().toISOString()),
      ]);
      expect(new Date(receptions.get('retrait-tardif')!).getTime()).toBeGreaterThan(
        new Date(receptions.get('arrivee-205')!).getTime(),
      );

      const classements = await getClassements(orgAId, { store: chronoStore });
      const attendue = Math.max(
        ...['arrivee-b', 'arrivee-b2', 'arrivee-c', 'arrivee-205'].map((etiquette) =>
          new Date(receptions.get(etiquette)!).getTime(),
        ),
      );
      expect(new Date(classements.fraicheur ?? 0).getTime()).toBe(attendue);
      // Le retrait tardif n'a changé AUCUNE ligne (fantôme sans dossard).
      expect((await classement('longue')).lignes.some((l) => l.dossard === 231)).toBe(false);
    });

    it('heures de départ : déplacement officiel → temps recalculés ; effacement (null) → configure false sans temps ; restauration', async () => {
      // La Boucle Moyenne part 15 min PLUS TARD : le temps de M1 fond d'autant.
      const departMoyenneDeplace = new Date(departMoyenne.getTime() + 900_000);
      await enregistrerHeuresDepart(
        organisateurA,
        { heures: [{ epreuveId: epreuveMoyenneId, heureDepart: departMoyenneDeplace.toISOString() }] },
        { store: chronoStore },
      );
      const moyenne = await classement('moyenne');
      expect(moyenne.heureDepart).toBe(departMoyenneDeplace.toISOString());
      expect(moyenne.lignes[0]?.tempsMs).toBe(temps(departMoyenneDeplace, 'arrivee-c'));

      // Effacement : la Longue perd son heure → configure false, plus AUCUN
      // temps (jamais faux à zéro), les autres épreuves intactes.
      await enregistrerHeuresDepart(
        organisateurA,
        { heures: [{ epreuveId: epreuveLongueId, heureDepart: null }] },
        { store: chronoStore },
      );
      const longueEffacee = await classement('longue');
      expect(longueEffacee.configure).toBe(false);
      expect(longueEffacee.heureDepart).toBeNull();
      expect(longueEffacee.lignes.every((l) => l.tempsMs === null && l.rang === null)).toBe(true);
      expect((await classement('moyenne')).configure).toBe(true);

      // Restauration : les temps reviennent, calculés sur l'heure officielle.
      await enregistrerHeuresDepart(
        organisateurA,
        { heures: [{ epreuveId: epreuveLongueId, heureDepart: departLongue.toISOString() }] },
        { store: chronoStore },
      );
      const longueRestauree = await classement('longue');
      expect(longueRestauree.configure).toBe(true);
      expect(longueRestauree.lignes.filter((l) => l.statut === 'arrivé').every((l) => l.tempsMs !== null && l.rang !== null)).toBe(true);
    });

    it('heures de départ — refus : ISO non UTC (sans Z) → erreur champ ; épreuve inconnue (uuid fantôme, épreuve de l’org B) → 400', async () => {
      await expect(
        enregistrerHeuresDepart(
          organisateurA,
          { heures: [{ epreuveId: epreuveLongueId, heureDepart: '2027-05-16T09:00:00' }] },
          { store: chronoStore },
        ),
      ).rejects.toMatchObject({
        fields: { [epreuveLongueId]: expect.stringContaining('valides') },
      });
      const idFantome = randomUUID();
      await expect(
        enregistrerHeuresDepart(
          organisateurA,
          { heures: [{ epreuveId: idFantome, heureDepart: departLongue.toISOString() }] },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(HeuresDepartEpreuveInconnueError);
      // RLS : l'épreuve de l'org B est introuvable côté A (jamais devinable).
      await expect(
        enregistrerHeuresDepart(
          organisateurA,
          { heures: [{ epreuveId: epreuveMoyenneId, heureDepart: departLongue.toISOString() }, { epreuveId: idFantome, heureDepart: null }] },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(HeuresDepartEpreuveInconnueError);
      // Aucune écriture partielle : la Moyenne garde son heure déplacée.
      expect((await classement('moyenne')).heureDepart).toBe(
        new Date(departMoyenne.getTime() + 900_000).toISOString(),
      );
    });

    it('heures de départ — AUCUNE édition en cours : refus DÉDIÉ HeuresDepartSansEditionError (pas un « épreuve inconnue » à fields vides)', async () => {
      await expect(
        enregistrerHeuresDepart(
          organisateurC,
          { heures: [{ epreuveId: epreuveLongueId, heureDepart: departLongue.toISOString() }] },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(HeuresDepartSansEditionError);
      // La lecture reste un état ZÉRO cohérent, jamais une erreur.
      const classementsC = await getClassements(orgCId, { store: chronoStore });
      expect(classementsC.epreuves).toEqual([]);
      expect(classementsC.fraicheur).toBeNull();
    });

    it('RLS : l’org B ne voit NI épreuves NI coureurs de l’org A ; CHECK SQL 0033 : heure pré-2000 refusée PAR LA BASE', async () => {
      const classementsB = await getClassements(orgBId, { store: chronoStore });
      expect(classementsB.epreuves.map((e) => [e.epreuveSlug, e.configure, e.lignes.length])).toEqual([
        ['unique', false, 0],
      ]);
      expect(classementsB.fraicheur).toBeNull();
      expect(classementsB.epreuves.every((e) => !e.lignes.some((l) => l.dossard === 201))).toBe(true);

      // Preuve structurelle : sous GUC B, SANS WHERE applicatif, aucune
      // épreuve de l'org A n'est lisible.
      const vues = (await withOrg(app, orgBId, (tx) =>
        tx.unsafe('SELECT organisation_id FROM epreuve'),
      )) as unknown as { organisation_id: string }[];
      expect(vues.every((row) => row.organisation_id === orgBId)).toBe(true);

      // Une session B ne peut pas écrire l'heure d'une épreuve de A (RLS)…
      await expect(
        enregistrerHeuresDepart(
          organisateurB,
          { heures: [{ epreuveId: epreuveLongueId, heureDepart: departLongue.toISOString() }] },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(HeuresDepartEpreuveInconnueError);

      // …et le CHECK SQL 0033 refuse une heure pré-2000 même au propriétaire
      // (défense en profondeur — le service la refuse AVANT, champ par champ).
      await expect(
        withOrg(app, orgAId, (tx) =>
          tx`UPDATE epreuve SET heure_depart = TIMESTAMPTZ '1999-01-01T00:00:00Z' WHERE id = ${epreuveLongueId}`,
        ),
      ).rejects.toThrow();
    });
  },
);
