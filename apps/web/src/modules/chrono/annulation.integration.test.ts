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
  getEtatCourse,
  premierRecu,
  saisirAbandon,
  synchroniserLot,
  verifierJetonAppareil,
} from './service';
import { createChronoStore } from './store';
import { AnnulationEvenementIntrouvableError, AnnulationRetraitRefuseError } from './errors';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 5.4 — intégration annulation auditable (base azzel_test, rôle
// azzel_app) : AD-8 en preuve SQL — terrain_evenement reste INTACT (aucune
// mutation, aucune suppression), l'annulation vit dans sa table append-only
// (auteur, horodatage serveur, motif), UNIQUE (evenement_id) rend le rejeu
// idempotent (« déjà annulé », jamais deux lignes). Les lectures arbitrées
// (etatCourse, premierRecu) excluent les annulés : ré-arbitrage « le SECOND
// fait foi » en lecture, retour au vide d'un passage unique, arrivée annulée
// → arrivés −1 / en course +1 / alertes recalculées. Refus V1 du retrait
// (409), introuvable RLS comprise (404), grants append-only.

const testUrls = resolveTestDatabaseUrls('annulation');

function jetonBase64url(squelette: string): string {
  return squelette.padEnd(22, 'x').slice(0, 22);
}

const JETON_A1 = jetonBase64url('annul-a1');
const JETON_A2 = jetonBase64url('annul-a2');
const JETON_A3 = jetonBase64url('annul-a3');
/** Coureur NON VALIDÉ (en constitution) : événement synchronisable, jamais annulable. */
const JETON_A4 = jetonBase64url('annul-a4');
/** Coureur de l'org B (preuve RLS symétrique : B annule SON événement). */
const JETON_B1 = jetonBase64url('annul-b1');

/** Barrières RELATIVES à l'horloge réelle (passées il y a 1 h) : aucune bombe temporelle. */
const BARRIERE_PASSEE = new Date(Date.now() - 3_600_000);

function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

describe.skipIf(testUrls === null)(
  'chrono — intégration annulation auditable (base azzel_test)',
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
    let organisateurA: SessionRecord;
    let organisateurB: SessionRecord;

    let checkpointKm12Id = '';
    let checkpointArriveeId = '';
    let checkpointColId = '';
    /** Checkpoint de l'org B (résolution réelle du titre pour l'annulation B). */
    let checkpointBId = '';

    /** Clés d'alertes compactes et triées : « dossard@checkpoint ». */
    function alertesCles(etat: Awaited<ReturnType<typeof getEtatCourse>>): string[] {
      return etat.alertes.map((a) => `${a.dossard}@${a.checkpointTitre}`).sort();
    }

    function organisateurSession(): SessionRecord {
      return {
        accountId: randomUUID(),
        organisationId: orgAId,
        email: `pc-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };
    }

    async function creerCoureur(jeton: string, dossard: number, status = 'validé'): Promise<void> {
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
          (SELECT id FROM epreuve WHERE edition_id = ${editionAId} AND slug = 'longue' LIMIT 1),
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

    const volontaireA: SessionRecord = {
      accountId: randomUUID(),
      organisationId: '',
      email: `volontaire-${randomUUID()}@test.azzel`,
      role: 'volontaire',
      createdAt: new Date(),
    };

    /** Sync un lot via le canal appareil complet (aucun rejet attendu). */
    async function sync(appareilClient: string, evenements: EvenementSyncTerrain[]): Promise<void> {
      const enregistrement = await enregistrerAppareil(volontaireA, appareilClient, {
        store: chronoStore,
      });
      const auth = await verifierJetonAppareil(enregistrement.jeton, { store: chronoStore });
      const reponse = await synchroniserLot(auth, { evenements }, { store: chronoStore });
      expect(reponse.compteurs.rejetes).toBe(0);
    }

    /** Id de l'événement terrain par (jeton, checkpoint, heure appareil) — fixtures propriétaire. */
    async function idEvenement(
      jeton: string,
      checkpointId: string,
      horodatageAppareil: string,
    ): Promise<string> {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM terrain_evenement
        WHERE organisation_id = ${orgAId}
          AND edition_id = ${editionAId}
          AND jeton_coureur = ${jeton}
          AND checkpoint_id = ${checkpointId}
          AND horodatage_appareil = ${horodatageAppareil}::timestamptz
        LIMIT 1
      `;
      if (!rows[0]?.id) {
        throw new Error(`événement fixture introuvable (${jeton} @ ${checkpointId})`);
      }
      return rows[0].id;
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

      // Org B minimale + une édition (preuve RLS sur l'annulation).
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      const editionBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-annul-${orgBId.slice(0, 8)}`}, 'Course Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`annul-${orgBId.slice(0, 8)}`}, 'Autre Trail')
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
      // Org B RÉSOLVABLE : secteur + mission scan_checkpoint + coureur
      // numéroté — l'annulation côté B doit trouver dossard ET titre.
      const secteurBId = randomUUID();
      await sql`
        INSERT INTO secteur (id, organisation_id, edition_id, nom, lieu)
        VALUES (${secteurBId}, ${orgBId}, ${editionBId}, 'Secteur B', 'Zone blanche')
      `;
      checkpointBId = randomUUID();
      await sql`
        INSERT INTO mission (id, organisation_id, secteur_id, type, titre, debut_le, fin_le)
        VALUES (${checkpointBId}, ${orgBId}, ${secteurBId}, 'scan_checkpoint', 'Scan org B',
                TIMESTAMPTZ '2020-01-01T00:00:00Z', TIMESTAMPTZ '2100-01-01T00:00:00Z')
      `;
      const accountBId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountBId}, ${orgBId}, ${`coureur-${accountBId}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${orgBId}, ${accountBId}, ${editionBId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionBId} LIMIT 1),
          'Prenom', 'Nom', '+213555010998', 'Contact', '0555010997',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', 201, ${JETON_B1}
        )
      `;
      organisateurB = {
        accountId: randomUUID(),
        organisationId: orgBId,
        email: `pc-b-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };

      // Trois coureurs validés numérotés : 101 (ré-arbitrage), 102 (arrivée
      // annulée), 103 (passage unique → retour au vide).
      await creerCoureur(JETON_A1, 101);
      await creerCoureur(JETON_A2, 102);
      await creerCoureur(JETON_A3, 103);

      // Checkpoints = missions scan_checkpoint de l'édition. Le checkpoint
      // d'arrivée porte une barrière PASSÉE : son annulation doit RÉÉMETTRE
      // l'alerte (compteurs ET alertes recalculés).
      const secteur = await createSecteur(
        organisateurSession(),
        { nom: 'Secteur annulation', lieu: 'Zone blanche', contact: null },
        { store: missionsStore },
      );
      const missionKm12 = await createMission(
        organisateurSession(),
        {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan km 12',
          debutLe: '2020-01-01T00:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: false,
        },
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
          barriereLe: BARRIERE_PASSEE.toISOString(),
        },
        { store: missionsStore },
      );
      const missionCol = await createMission(
        organisateurSession(),
        {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan col passé',
          debutLe: '2020-01-01T00:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: false,
          barriereLe: BARRIERE_PASSEE.toISOString(),
        },
        { store: missionsStore },
      );
      checkpointKm12Id = missionKm12.id;
      checkpointArriveeId = missionArrivee.id;
      checkpointColId = missionCol.id;

      volontaireA.organisationId = orgAId;
      organisateurA = organisateurSession();

      // Départs (lot 1), puis passages en lots SÉPARÉS (appareils distincts)
      // : l'ordre de réception serveur fonde l'arbitrage AD-3. Le second scan
      // de 101 au km 12 vient d'un AUTRE appareil (même jeton×checkpoint =
      // même clé d'idempotence sinon, jamais stocké).
      await sync('annul-appareil-x', [
        retrait('annul-appareil-x', JETON_A1, '2027-05-16T06:12:30.000Z'),
        retrait('annul-appareil-x', JETON_A2, '2027-05-16T06:13:00.000Z'),
        retrait('annul-appareil-x', JETON_A3, '2027-05-16T06:14:00.000Z'),
      ]);
      await attendre(10);
      await sync('annul-appareil-x', [
        passage('annul-appareil-x', JETON_A1, checkpointKm12Id, '2027-05-16T07:05:09.000Z'),
      ]);
      await attendre(10);
      await sync('annul-appareil-y', [
        passage('annul-appareil-y', JETON_A1, checkpointKm12Id, '2027-05-16T07:06:00.000Z'),
      ]);
      await attendre(10);
      await sync('annul-appareil-x', [
        passage('annul-appareil-x', JETON_A2, checkpointArriveeId, '2027-05-16T09:40:00.000Z'),
      ]);
      await attendre(10);
      await sync('annul-appareil-x', [
        passage('annul-appareil-x', JETON_A3, checkpointColId, '2027-05-16T08:00:00.000Z'),
      ]);
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    it('état de départ : 3 retraits, 1 arrivé (102), boards arbitrés — le PREMIER reçu fait foi au km 12', async () => {
      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(etat.retraits).toBe(3);
      expect(etat.arrives).toBe(1);
      expect(etat.enCourse).toBe(2);
      expect(etat.abandones).toBe(0);
      const km12 = etat.checkpoints.find((c) => c.id === checkpointKm12Id);
      // Doublon d'appareil ARBITRÉ : le premier reçu (appareil x, 07:05) fait
      // foi — c'est LUI la cible de l'annulation.
      expect(km12?.passages).toHaveLength(1);
      expect(km12?.passages[0]?.dossard).toBe(101);
      const premier = km12?.passages[0];
      const attendu = await idEvenement(JETON_A1, checkpointKm12Id, '2027-05-16T07:05:09.000Z');
      expect(premier?.evenementId).toBe(attendu);
      // Alertes de CONTEXTE (5.2) : les deux barrières (col, arrivée) sont
      // PASSÉES — 101 (non arrivé, passé nulle part à barrière) et 103 (non
      // arrivé, jamais vu à l'arrivée) alertent ; 102 est ARRIVÉ, jamais
      // alerté ; 103 a passé le col → pas d'alerte col.
      expect(alertesCles(etat)).toEqual([
        '101@Scan arrivée stade',
        '101@Scan col passé',
        '103@Scan arrivée stade',
      ]);
    });

    it('annulation nominale + ré-arbitrage : le premier annulé → le SECOND fait foi, événement INTACT, annulation tracée', async () => {
      const cible = await idEvenement(JETON_A1, checkpointKm12Id, '2027-05-16T07:05:09.000Z');
      const resultat = await annulerPassage(
        organisateurA,
        { evenementId: cible, motif: 'Mauvais scan du dossard voisin' },
        { store: chronoStore },
      );
      expect(resultat).toEqual({
        dejaAnnule: false,
        evenementId: cible,
        dossard: 101,
        checkpointTitre: 'Scan km 12',
      });

      // AD-8 : terrain_evenement reste INTACT — l'événement annulé est
      // toujours là, mot pour mot.
      const intact = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM terrain_evenement WHERE id = ${cible}
      `;
      expect(intact[0]?.count).toBe(1);

      // Ré-arbitrage en lecture : la ligne du board devient le SECOND passage
      // (heure de réception du second), le premier a disparu du board.
      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      const km12 = etat.checkpoints.find((c) => c.id === checkpointKm12Id);
      expect(km12?.passages).toHaveLength(1);
      expect(km12?.passages[0]?.dossard).toBe(101);
      const second = await idEvenement(JETON_A1, checkpointKm12Id, '2027-05-16T07:06:00.000Z');
      expect(km12?.passages[0]?.evenementId).toBe(second);

      // premierRecu (épopées 5/7) exclut aussi l'annulé : le second fait foi.
      const arbitre = await premierRecu(
        organisateurA,
        { editionId: editionAId, jeton: JETON_A1, checkpointId: checkpointKm12Id },
        { store: chronoStore },
      );
      expect(arbitre?.id).toBe(second);

      // Audit complet en base : auteur, motif, horodatage serveur.
      const tracees = await sql<{
        auteur_email: string;
        motif: string;
        horodatage_reception: Date;
      }[]>`
        SELECT auteur_email, motif, horodatage_reception FROM annulation
        WHERE organisation_id = ${orgAId} AND evenement_id = ${cible}
      `;
      expect(tracees).toHaveLength(1);
      expect(tracees[0]?.auteur_email).toBe(organisateurA.email);
      expect(tracees[0]?.motif).toBe('Mauvais scan du dossard voisin');
      expect(tracees[0]?.horodatage_reception.getTime()).toBeLessThanOrEqual(Date.now());

      // Compteurs inchangés : le passage km 12 n'est ni une arrivée ni un
      // retrait — seuls les boards bougent.
      expect(etat.retraits).toBe(3);
      expect(etat.arrives).toBe(1);
      expect(etat.enCourse).toBe(2);
    });

    it('passage UNIQUE annulé : ligne disparue, coureur redevenu ATTENDU (alerte col réémise)', async () => {
      const cible = await idEvenement(JETON_A3, checkpointColId, '2027-05-16T08:00:00.000Z');
      const resultat = await annulerPassage(
        organisateurA,
        { evenementId: cible, motif: 'Doublon d’appareil — scan repris' },
        { store: chronoStore },
      );
      expect(resultat.dossard).toBe(103);
      expect(resultat.dejaAnnule).toBe(false);

      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      const col = etat.checkpoints.find((c) => c.id === checkpointColId);
      // Retour au vide : plus AUCUNE ligne au col.
      expect(col?.passages).toEqual([]);
      // 103 redevient « attendu » au col à barrière PASSÉE : l'alerte col
      // est RÉÉMISE à l'état suivant (recalcul complet), les alertes
      // préexistantes (101×2, 103 arrivée) restent.
      expect(alertesCles(etat)).toEqual([
        '101@Scan arrivée stade',
        '101@Scan col passé',
        '103@Scan arrivée stade',
        '103@Scan col passé',
      ]);
    });

    it('arrivée annulée : arrivés −1, en course +1, alerte réémise au checkpoint d’arrivée', async () => {
      const avant = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(avant.arrives).toBe(1);
      expect(avant.enCourse).toBe(2);

      const cible = await idEvenement(JETON_A2, checkpointArriveeId, '2027-05-16T09:40:00.000Z');
      const resultat = await annulerPassage(
        organisateurA,
        { evenementId: cible, motif: 'Scan d’un coureur déjà arrivé — mauvais dossard' },
        { store: chronoStore },
      );
      expect(resultat.dossard).toBe(102);
      expect(resultat.checkpointTitre).toBe('Scan arrivée stade');

      const etat = await getEtatCourse(organisateurA, { store: chronoStore });
      // 102 repart « en course » : arrivés 0, en course 3 (101, 102, 103).
      expect(etat.arrives).toBe(0);
      expect(etat.enCourse).toBe(3);
      expect(etat.retraits).toBe(3);
      // Le board d'arrivée est vide ET les alertes de 102 sont réémises (col
      // ET arrivée, barrières passées) — recalcul complet, tous attendus.
      const arrivee = etat.checkpoints.find((c) => c.id === checkpointArriveeId);
      expect(arrivee?.passages).toEqual([]);
      expect(alertesCles(etat)).toEqual([
        '101@Scan arrivée stade',
        '101@Scan col passé',
        '102@Scan arrivée stade',
        '102@Scan col passé',
        '103@Scan arrivée stade',
        '103@Scan col passé',
      ]);

      // Garde « déjà arrivé » de saisirAbandon : SYMÉTRIQUE de la lecture
      // arbitrée — l'arrivée ANNULÉE ne clôt plus la course, l'abandon de
      // 102 redevient SAISISSABLE (heure = maintenant, après le retrait).
      const abandon = await saisirAbandon(
        organisateurA,
        { dossard: 102, lieu: 'Gué PK 30', motif: 'hors_delais', heure: new Date().toISOString() },
        { store: chronoStore },
      );
      expect(abandon.dossard).toBe(102);
      const apresAbandon = await getEtatCourse(organisateurA, { store: chronoStore });
      expect(apresAbandon.abandones).toBe(1);
      expect(apresAbandon.enCourse).toBe(2); // 3 − l'abandonné 102
      // L'abandonné sort des alertes de sécurité (course finie), les autres
      // restent : recalcul complet compteurs ET alertes.
      expect(alertesCles(apresAbandon)).toEqual([
        '101@Scan arrivée stade',
        '101@Scan col passé',
        '103@Scan arrivée stade',
        '103@Scan col passé',
      ]);
    });

    it('idempotence : rejouer « Confirmer » → succès « déjà annulé », JAMAIS de seconde ligne', async () => {
      const cible = await idEvenement(JETON_A2, checkpointArriveeId, '2027-05-16T09:40:00.000Z');
      const rejeu = await annulerPassage(
        organisateurA,
        { evenementId: cible, motif: 'Rejeu du double clic — motif différent ignoré' },
        { store: chronoStore },
      );
      // Succès (pas d'erreur) : la PREMIÈRE annulation reste, motif d'origine.
      expect(rejeu.dejaAnnule).toBe(true);
      expect(rejeu.dossard).toBe(102);

      const comptees = await sql<{ count: number; motifs: string[] }[]>`
        SELECT count(*)::int AS count, array_agg(motif) AS motifs
        FROM annulation WHERE evenement_id = ${cible}
      `;
      expect(comptees[0]?.count).toBe(1);
      expect(comptees[0]?.motifs).toEqual(['Scan d’un coureur déjà arrivé — mauvais dossard']);
    });

    it('retrait refusé (V1) : « seuls les passages peuvent être annulés », rien d’écrit', () => {
      // Fixture : id du retrait de 101.
      return (async () => {
        const retraits = await sql<{ id: string }[]>`
          SELECT id FROM terrain_evenement
          WHERE organisation_id = ${orgAId}
            AND edition_id = ${editionAId}
            AND jeton_coureur = ${JETON_A1}
            AND type = 'retrait'
          LIMIT 1
        `;
        const retraitId = retraits[0]?.id;
        expect(retraitId).toBeDefined();
        await expect(
          annulerPassage(
            organisateurA,
            { evenementId: retraitId as string, motif: 'Retrait scanné par erreur' },
            { store: chronoStore },
          ),
        ).rejects.toBeInstanceOf(AnnulationRetraitRefuseError);
        const comptees = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM annulation WHERE evenement_id = ${retraitId as string}
        `;
        expect(comptees[0]?.count).toBe(0);
      })();
    });

    it('introuvable : uuid inconnu, non-UUID, coureur NON VALIDÉ, événement d’une AUTRE org (RLS) → 404, rien d’écrit', async () => {
      await expect(
        annulerPassage(
          organisateurA,
          { evenementId: randomUUID(), motif: 'N’importe quoi' },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(AnnulationEvenementIntrouvableError);
      await expect(
        annulerPassage(
          organisateurA,
          { evenementId: 'pas-un-uuid', motif: 'N’importe quoi' },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(AnnulationEvenementIntrouvableError);

      // Coureur NON VALIDÉ (en constitution) : son passage est INGÉRÉ (le
      // canal sync ne filtre pas le statut — donnée d'audit) mais le dossard
      // ne se résout QUE chez les validés (symétrie dossardParJeton) —
      // l'événement n'est PILOTABLE nulle part, jamais annulable à l'aveugle.
      await creerCoureur(JETON_A4, 104, 'en constitution');
      await attendre(10);
      await sync('annul-appareil-104', [
        passage('annul-appareil-104', JETON_A4, checkpointKm12Id, '2027-05-16T07:10:00.000Z'),
      ]);
      const evenementNonValide = await idEvenement(
        JETON_A4,
        checkpointKm12Id,
        '2027-05-16T07:10:00.000Z',
      );
      await expect(
        annulerPassage(
          organisateurA,
          { evenementId: evenementNonValide, motif: 'Coureur non validé' },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(AnnulationEvenementIntrouvableError);

      // Événement de l'org B (fixture propriétaire, résolu : checkpoint
      // mission B + coureur B) : INVISIBLE côté A, l'id deviné est introuvable.
      const evenementBId = randomUUID();
      await sql`
        INSERT INTO terrain_evenement (
          id, organisation_id, cle_idempotence, type, edition_id, jeton_coureur,
          checkpoint_id, horodatage_appareil, horodatage_reception,
          offset_estime_ms, appareil_id
        )
        VALUES (
          ${evenementBId}, ${orgBId}, ${`cle-rls-${evenementBId}`}, 'passage',
          (SELECT id FROM edition WHERE organisation_id = ${orgBId} LIMIT 1),
          ${JETON_B1}, ${checkpointBId},
          now(), now(), 0, 'appareil-b'
        )
      `;
      await expect(
        annulerPassage(
          organisateurA,
          { evenementId: evenementBId, motif: 'Id deviné d’une autre org' },
          { store: chronoStore },
        ),
      ).rejects.toBeInstanceOf(AnnulationEvenementIntrouvableError);
      // …et l'org B, elle, PEUT annuler son propre événement (RLS symétrique).
      const sien = await annulerPassage(
        organisateurB,
        { evenementId: evenementBId, motif: 'Annulation côté B' },
        { store: chronoStore },
      );
      expect(sien.dejaAnnule).toBe(false);
      expect(sien.dossard).toBe(201);
      expect(sien.checkpointTitre).toBe('Scan org B');

      // Aucune écriture fantôme côté A : le total d'annulations de l'org A
      // reste 3 (km12 101, col 103, arrivée 102).
      const comptees = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM annulation WHERE organisation_id = ${orgAId}
      `;
      expect(comptees[0]?.count).toBe(3);
    });

    it('AD-8 structurel : UPDATE/DELETE refusés au rôle applicatif, terrain_evenement INTACT de bout en bout', async () => {
      await expect(
        withOrg(app, orgAId, (tx) => tx`UPDATE annulation SET motif = 'réécrit'`),
      ).rejects.toThrow();
      await expect(
        withOrg(app, orgAId, (tx) => tx`DELETE FROM annulation`),
      ).rejects.toThrow();
      await expect(
        withOrg(app, orgAId, (tx) => tx`UPDATE terrain_evenement SET type = 'retrait'`),
      ).rejects.toThrow();
      await expect(
        withOrg(app, orgAId, (tx) => tx`DELETE FROM terrain_evenement`),
      ).rejects.toThrow();

      // Aucun événement n'a été touché par les annulations : 3 retraits +
      // 5 passages (101×2, 102, 103 + le coureur non validé 104, ingéré en
      // audit) + 1 côté org B.
      const comptes = await sql<{ retraits: number; passages: number }[]>`
        SELECT count(*) FILTER (WHERE type = 'retrait')::int AS retraits,
               count(*) FILTER (WHERE type = 'passage')::int AS passages
        FROM terrain_evenement WHERE organisation_id = ${orgAId}
      `;
      expect(comptes[0]).toEqual({ retraits: 3, passages: 5 });
    });

    it('RLS : sous GUC B, SANS WHERE applicatif, aucune annulation de l’org A n’est lisible', async () => {
      const vues = (await withOrg(app, orgBId, (tx) =>
        tx.unsafe('SELECT organisation_id FROM annulation'),
      )) as unknown as { organisation_id: string }[];
      // B ne voit QUE sa propre annulation (créée au test précédent) —
      // celle de l'org A (3 lignes) est structurellement invisible.
      expect(vues).toHaveLength(1);
      expect(vues[0]?.organisation_id).toBe(orgBId);
    });
  },
);
