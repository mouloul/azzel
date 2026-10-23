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
import { createSecteur, createMission, updateMission } from '@/modules/missions/service';
import { createMissionsStore, type MissionsStore } from '@/modules/missions/store';
import { InvalidMissionFieldsError, MissionArriveeUniqueError } from '@/modules/missions/errors';

import { enregistrerAppareil, getEtatCourse, synchroniserLot, verifierJetonAppareil } from './service';
import { createChronoStore } from './store';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 5.1 — intégration getEtatCourse (base azzel_test, rôle azzel_app) :
// partants par épreuve (validés seuls), retraits/passages ARBITRÉS (AD-3 —
// deux appareils qui scannent le même coureur×checkpoint = UNE ligne), arrivés
// = retirés ∧ passage au checkpoint est_arrivee, en course, fraîcheur =
// max(horodatage_reception), sans checkpoint d'arrivée (0 + drapeau), unicité
// est_arrivee côté missions, isolation multi-org (RLS).

const testUrls = resolveTestDatabaseUrls('etat-course');

function jetonBase64url(squelette: string): string {
  return squelette.padEnd(22, 'x').slice(0, 22);
}

const JETON_A1 = jetonBase64url('course-a1');
const JETON_A2 = jetonBase64url('course-a2');
const JETON_A3 = jetonBase64url('course-a3');
const JETON_A4 = jetonBase64url('course-a4');
const JETON_A5 = jetonBase64url('course-a5');

/**
 * Story 5.2 — barrière du col PASSÉE, RELATIVE à l'horloge réelle (il y a
 * 1 h) : aucune date fixe qui deviendrait une bombe temporelle. Semée dans
 * beforeAll pour DÉCOUPLER les tests d'alertes entre eux (chacun trouve le
 * checkpoint prêt, dans l'état que le test précédent a laissé).
 */
const BARRIERE_COL_PASSE = new Date(Date.now() - 3_600_000);

function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

describe.skipIf(testUrls === null)(
  'chrono — intégration état course PC (base azzel_test)',
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
    let volontaireA: SessionRecord;
    let organisateurA: SessionRecord;
    let organisateurB: SessionRecord;

    let checkpointKm12Id = '';
    let checkpointArriveeId = '';
    /** Story 5.2 — checkpoint à barrière PASSÉE (alertes hors-délais). */
    let checkpointColPasseId = '';

    /** Toutes les receptions serveur des lots syncés (pour la fraîcheur). */
    const receptions: string[] = [];

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
      status: string,
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
          DATE '1990-05-12', 'M', 36, 'Senior', ${status}, ${dossard}, ${jeton}
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

    /** Sync un lot, journalise la réception serveur (fraîcheur attendue). */
    async function sync(appareilClient: string, evenements: EvenementSyncTerrain[]): Promise<void> {
      const enregistrement = await enregistrerAppareil(volontaireA, appareilClient, {
        store: chronoStore,
      });
      const auth = await verifierJetonAppareil(enregistrement.jeton, { store: chronoStore });
      const reponse = await synchroniserLot(auth, { evenements }, { store: chronoStore });
      expect(reponse.compteurs.rejetes).toBe(0);
      receptions.push(reponse.recuA);
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

      // Org B minimale + son édition/épreuve vides (preuve RLS).
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      const editionBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-course-${orgBId.slice(0, 8)}`}, 'Course Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`course-${orgBId.slice(0, 8)}`}, 'Course Autre Trail')
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

      // Partants : 2 validés sur la Longue (101, 102), 1 validé sur la Moyenne
      // (103), 1 EN CONSTITUTION (104) — hors partants mais synchronisable —
      // et 1 FANTÔME (A5 : validé mais jamais numéroté, dossard NULL).
      await creerCoureur(JETON_A1, 101, 'longue', 'validé');
      await creerCoureur(JETON_A2, 102, 'longue', 'validé');
      await creerCoureur(JETON_A3, 103, 'moyenne', 'validé');
      await creerCoureur(JETON_A4, 104, 'longue', 'en constitution');
      await creerCoureur(JETON_A5, null, 'longue', 'validé');

      // Checkpoints = missions scan_checkpoint de l'édition (service missions).
      const secteur = await createSecteur(organisateurSession(), {
        nom: 'Secteur course',
        lieu: 'Zone blanche',
        contact: null,
      }, { store: missionsStore });
      const missionKm12 = await createMission(organisateurSession(), {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan km 12',
        debutLe: '2027-05-16T06:00:00.000Z',
        finLe: '2027-05-16T18:00:00.000Z',
        consignes: null,
        estArrivee: false,
      }, { store: missionsStore });
      const missionArrivee = await createMission(organisateurSession(), {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan arrivée stade',
        debutLe: '2027-05-16T06:00:00.000Z',
        finLe: '2027-05-16T18:00:00.000Z',
        consignes: null,
        estArrivee: false,
      }, { store: missionsStore });
      const missionAutre = await createMission(organisateurSession(), {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan km 30',
        debutLe: '2027-05-16T06:00:00.000Z',
        finLe: '2027-05-16T18:00:00.000Z',
        consignes: null,
        estArrivee: false,
      }, { store: missionsStore });
      checkpointKm12Id = missionKm12.id;
      checkpointArriveeId = missionArrivee.id;
      expect(missionAutre.estArrivee).toBe(false);

      // Story 5.2 — checkpoint col à barrière PASSÉE (il y a 1 h), SEMÉ ICI
      // pour découpler les tests d'alertes entre eux. Horaires larges
      // (2020 → 2100) : la barrière relative y vit toujours, bornes incluses.
      const secteurCol = await createSecteur(organisateurSession(), {
        nom: 'Secteur col 1200',
        lieu: 'Col 1200',
        contact: null,
      }, { store: missionsStore });
      const missionColPasse = await createMission(organisateurSession(), {
        secteurId: secteurCol.id,
        type: 'scan_checkpoint',
        titre: 'Scan col passé',
        debutLe: '2020-01-01T00:00:00.000Z',
        finLe: '2100-01-01T00:00:00.000Z',
        consignes: null,
        estArrivee: false,
        barriereLe: BARRIERE_COL_PASSE.toISOString(),
      }, { store: missionsStore });
      checkpointColPasseId = missionColPasse.id;

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
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    it('état initial : partants par épreuve (validés SEULS), tout à 0, boards vides, aucune donnée reçue', async () => {
      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(etat.edition).toEqual({ id: editionAId, nom: 'Édition 2027' });
      // La Longue = 3 validés (A5 sans dossard COMPTE : partants = validés,
      // la numérotation n'y change rien ; l'en constitution ne part pas),
      // la Moyenne = 1.
      expect(etat.partants).toEqual([
        { epreuveId: expect.any(String), epreuveNom: 'La Longue — 35 km', total: 3 },
        { epreuveId: expect.any(String), epreuveNom: 'La Moyenne — 12 km', total: 1 },
      ]);
      expect(etat.retraits).toBe(0);
      expect(etat.arrives).toBe(0);
      expect(etat.enCourse).toBe(0);
      expect(etat.abandones).toBe(0);
      expect(etat.arriveeDefinie).toBe(false);
      expect(etat.fraicheur).toBeNull();
      expect(etat.checkpoints.map((c) => c.titre)).toEqual([
        'Scan col passé',
        'Scan km 12',
        'Scan arrivée stade',
        'Scan km 30',
      ]);
      expect(etat.checkpoints.every((c) => c.passages.length === 0)).toBe(true);
    });

    it('après sync : retraits, boards ARBITRÉS (un doublon d’appareil = UNE ligne), tri décroissant, fraîcheur = max réception', async () => {
      // Lot 1 (appareil X) : retraits A1/A2 + passages km12.
      await sync('course-appareil-x', [
        retrait('course-appareil-x', JETON_A1, '2027-05-16T06:12:30.000Z'),
        retrait('course-appareil-x', JETON_A2, '2027-05-16T06:13:00.000Z'),
        passage('course-appareil-x', JETON_A1, checkpointKm12Id, '2027-05-16T07:05:09.000Z'),
      ]);
      await attendre(10);
      // Lot 2 (appareil Y) : RÉ-SCAN de A1 au km 12 (doublon d'appareil) +
      // passage A2 au km 12 + A1 au futur point d'arrivée.
      await sync('course-appareil-y', [
        passage('course-appareil-y', JETON_A1, checkpointKm12Id, '2027-05-16T07:06:00.000Z'),
        passage('course-appareil-y', JETON_A2, checkpointKm12Id, '2027-05-16T07:07:00.000Z'),
        passage('course-appareil-y', JETON_A1, checkpointArriveeId, '2027-05-16T09:40:00.000Z'),
      ]);

      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(etat.retraits).toBe(2);
      // A1 a franchi le futur point d'arrivée, mais AUCUN checkpoint d'arrivée
      // n'est défini : arrivés = 0, tout reste en course.
      expect(etat.arriveeDefinie).toBe(false);
      expect(etat.arrives).toBe(0);
      expect(etat.enCourse).toBe(2);

      const km12 = etat.checkpoints.find((c) => c.id === checkpointKm12Id);
      expect(km12?.passages).toHaveLength(2); // doublon d'appareil ARBITRÉ : UNE ligne pour A1
      // Tri heure DÉCROISSANT : A2 (reçu lot 2) DEVANT A1 (reçu lot 1 — le
      // ré-scan plus tardif ne déplace pas la ligne, premier reçu fait foi).
      expect(km12?.passages.map((p) => p.dossard)).toEqual([102, 101]);

      const arrivee = etat.checkpoints.find((c) => c.id === checkpointArriveeId);
      expect(arrivee?.passages.map((p) => p.dossard)).toEqual([101]);

      // Fraîcheur = MAX des horodatages de réception serveur.
      const attendue = receptions
        .map((iso) => new Date(iso).getTime())
        .reduce((max, valeur) => Math.max(max, valeur));
      expect(new Date(etat.fraicheur ?? '').getTime()).toBe(attendue);

      // Coureur FANTÔME (A5 : jeton connu de l'ingestion, validé mais JAMAIS
      // numéroté — dossard NULL, irrésolu côté PC) : ses événements restent
      // en audit mais n'altèrent NI retraits NI en course NI les boards.
      await attendre(10);
      await sync('course-appareil-fantome', [
        retrait('course-appareil-fantome', JETON_A5, '2027-05-16T06:14:00.000Z'),
        passage('course-appareil-fantome', JETON_A5, checkpointKm12Id, '2027-05-16T07:08:00.000Z'),
      ]);
      const apresFantome = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(apresFantome.retraits).toBe(2);
      expect(apresFantome.arrives).toBe(0);
      expect(apresFantome.enCourse).toBe(2);
      const km12Apres = apresFantome.checkpoints.find((c) => c.id === checkpointKm12Id);
      expect(km12Apres?.passages.map((p) => p.dossard)).toEqual([102, 101]);
      // Seule la fraîcheur — un fait de RÉCEPTION, pas de classement — avance.
      expect(new Date(apresFantome.fraicheur ?? '').getTime()).toBeGreaterThan(attendue);
    });

    it('checkpoint d’arrivée coché en admin : arrivés alimenté (retirés ∧ passage), en course recule', async () => {
      const modifiee = await updateMission(
        organisateurA,
        checkpointArriveeId,
        {
          secteurId: (await sql<{ secteur_id: string }[]>`
            SELECT secteur_id FROM mission WHERE id = ${checkpointArriveeId}
          `)[0]!.secteur_id,
          type: 'scan_checkpoint',
          titre: 'Scan arrivée stade',
          debutLe: '2027-05-16T06:00:00.000Z',
          finLe: '2027-05-16T18:00:00.000Z',
          consignes: null,
          estArrivee: true,
        },
        { store: missionsStore },
      );
      expect(modifiee.estArrivee).toBe(true);

      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(etat.arriveeDefinie).toBe(true);
      // A1 : retiré ∧ passage au point d'arrivée ; A2 retiré mais pas arrivé.
      expect(etat.arrives).toBe(1);
      expect(etat.enCourse).toBe(1);
      expect(etat.retraits).toBe(2);

      // Unicité : cocher un SECOND checkpoint d'arrivée sur l'édition → refus
      // champ (garde service missions), l'état course reste cohérent.
      await expect(
        updateMission(
          organisateurA,
          checkpointKm12Id,
          {
            secteurId: (await sql<{ secteur_id: string }[]>`
              SELECT secteur_id FROM mission WHERE id = ${checkpointKm12Id}
            `)[0]!.secteur_id,
            type: 'scan_checkpoint',
            titre: 'Scan km 12',
            debutLe: '2027-05-16T06:00:00.000Z',
            finLe: '2027-05-16T18:00:00.000Z',
            consignes: null,
            estArrivee: true,
          },
          { store: missionsStore },
        ),
      ).rejects.toBeInstanceOf(MissionArriveeUniqueError);

      const apres = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(apres.arrives).toBe(1);
    });

    it('RLS : l’org B ne voit RIEN des événements de l’org A (état B vide, GUC B sourd à terrain_evenement)', async () => {
      const etatB = await getEtatCourse(organisateurB, { store: chronoStore });
      expect(etatB.edition).not.toBeNull();
      expect(etatB.partants).toEqual([
        { epreuveId: expect.any(String), epreuveNom: 'L’Unique', total: 0 },
      ]);
      expect(etatB.retraits).toBe(0);
      expect(etatB.arrives).toBe(0);
      expect(etatB.fraicheur).toBeNull();
      expect(etatB.checkpoints).toEqual([]);

      // Preuve structurelle (pattern multi-org) : sous GUC B, SANS WHERE
      // applicatif, aucun événement de l'org A n'est lisible.
      const vus = (await withOrg(app, orgBId, (tx) =>
        tx.unsafe('SELECT organisation_id FROM terrain_evenement'),
      )) as unknown as { organisation_id: string }[];
      expect(vus).toEqual([]);
    });

    // -----------------------------------------------------------------
    // Story 5.2 — alertes hors-délais (barrières horaires, calcul serveur).
    // Le col passé est SEMÉ dans beforeAll (barrière = il y a 1 h, relative à
    // l'horloge réelle) ; le gué futur est créé avec une barrière relative
    // (dans 1 h). Le fantôme A5 (retrait jamais résolu) et le coureur A3
    // (jamais retiré) ne doivent JAMAIS alerter ; A1 est ARRIVÉ (passage
    // arbitré au checkpoint est_arrivee coché plus haut) : sa course est
    // finie, la sécurité est réglée — jamais alerté, sur aucun checkpoint.
    // -----------------------------------------------------------------

    it('story 5.2 — barrière passée + retiré non arrivé sans passage → alerte (contact du secteur joint) ; arrivé exclu, barrière future/absente, non retiré, fantôme → rien', async () => {
      const secteurGue = await createSecteur(
        organisateurSession(),
        { nom: 'Secteur gué', lieu: 'Gué PK 30', contact: '+213 555 010 777' },
        { store: missionsStore },
      );
      const gueFutur = await createMission(
        organisateurSession(),
        {
          secteurId: secteurGue.id,
          type: 'scan_checkpoint',
          titre: 'Scan gué futur',
          debutLe: '2020-01-01T00:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: false,
          // Futur RELATIF (dans 1 h) : aucune bombe temporelle.
          barriereLe: new Date(Date.now() + 3_600_000).toISOString(),
        },
        { store: missionsStore },
      );

      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      // Attendus au col passé : A2 (102) SEUL — retiré résolu sans passage à
      // CE checkpoint. Le contact du secteur de la mission remonte (null : le
      // secteur col n'en a pas) pour l'action « Appeler le secteur ».
      expect(etat.alertes).toEqual([
        {
          dossard: 102,
          checkpointId: checkpointColPasseId,
          checkpointTitre: 'Scan col passé',
          barriereLe: BARRIERE_COL_PASSE.toISOString(),
          contactSecteur: null,
        },
      ]);
      // JAMAIS d'alerte : barrière future (gué), barrière absente (km12,
      // arrivée), coureur non retiré (A3 — dossard 103), fantôme (A5 —
      // retrait jamais résolu : pas de dossard), ARRIVÉ (A1 — dossard 101,
      // vu au point d'arrivée 09:40 : la sécurité est réglée).
      expect(etat.alertes.every((a) => a.checkpointId !== gueFutur.id)).toBe(true);
      expect(etat.alertes.some((a) => a.dossard === 103)).toBe(false);
      expect(etat.alertes.some((a) => a.dossard === 101)).toBe(false);
    });

    it('story 5.2 — déplacement de la barrière (updateMission) : l’alerte suit la NOUVELLE barrière', async () => {
      const barriereDeplacee = new Date(Date.now() - 7_200_000);
      await updateMission(
        organisateurA,
        checkpointColPasseId,
        {
          secteurId: (await sql<{ secteur_id: string }[]>`
            SELECT secteur_id FROM mission WHERE id = ${checkpointColPasseId}
          `)[0]!.secteur_id,
          type: 'scan_checkpoint',
          titre: 'Scan col passé',
          debutLe: '2020-01-01T00:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: false,
          barriereLe: barriereDeplacee.toISOString(),
        },
        { store: missionsStore },
      );
      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      // A2 reste attendu au col, mais sur la barrière DÉPLACÉE (il y a 2 h).
      expect(etat.alertes).toEqual([
        {
          dossard: 102,
          checkpointId: checkpointColPasseId,
          checkpointTitre: 'Scan col passé',
          barriereLe: barriereDeplacee.toISOString(),
          contactSecteur: null,
        },
      ]);
    });

    it('story 5.2 — le passage arbitré règle l’alerte : elle disparaît à l’état suivant', async () => {
      await attendre(10);
      await sync('course-appareil-col', [
        passage('course-appareil-col', JETON_A2, checkpointColPasseId, '2027-05-16T11:00:00.000Z'),
      ]);
      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      // A2 vu au col → son alerte part ; A1 est arrivé (exclu d'office).
      expect(etat.alertes).toEqual([]);
    });

    it('story 5.2 — garde domaine en base : barrière avant le début refusée AVANT le SQL (erreur champ)', async () => {
      const secteur = await createSecteur(
        organisateurSession(),
        { nom: 'Secteur garde barrière', lieu: 'PK 42', contact: null },
        { store: missionsStore },
      );
      await expect(
        createMission(
          organisateurSession(),
          {
            secteurId: secteur.id,
            type: 'scan_checkpoint',
            titre: 'Scan incohérent',
            debutLe: '2027-05-16T08:00:00.000Z',
            finLe: '2027-05-16T18:00:00.000Z',
            consignes: null,
            estArrivee: false,
            barriereLe: '2027-05-16T07:00:00.000Z',
          },
          { store: missionsStore },
        ),
      ).rejects.toBeInstanceOf(InvalidMissionFieldsError);
    });
  },
);
