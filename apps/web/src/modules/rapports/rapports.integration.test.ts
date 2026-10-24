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

import type { SessionRecord } from '@/modules/iam/store';
import { createMission, createSecteur } from '@/modules/missions/service';
import { createMissionsStore, type MissionsStore } from '@/modules/missions/store';

import {
  annulerPassage,
  enregistrerAppareil,
  enregistrerHeuresDepart,
  saisirAbandon,
  synchroniserLot,
  verifierJetonAppareil,
} from '@/modules/chrono/service';
import { createChronoStore } from '@/modules/chrono/store';

import { formaterTempsRapport } from './domain';
import { genererCommande, genererRapportPostCourse } from './service';
import { createRapportsStore } from './store';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 7.4 — intégration rapports (base azzel_test, rôle azzel_app) :
// édition complète semée (statuts variés, tailles XS–XXL, validé SANS dossard
// — commande oui, classement non —, retraits, passages multi-checkpoints +
// annulation ré-arbitrée, arrivées avec heures de départ, abandon au lieu
// malveillant, visites multi-jours) : les DEUX CSV assertés section par
// section (valeurs, rangs/temps 7.1 repris, échappement RFC 4180, zéros sur
// édition vide), RLS multi-org (l'org B ne voit QUE son édition). Toutes les
// heures sont RELATIVES à l'horloge réelle : aucune bombe temporelle.

const testUrls = resolveTestDatabaseUrls('rapports');

function jetonBase64url(squelette: string): string {
  return squelette.padEnd(22, 'x').slice(0, 22);
}

const JETON_L1 = jetonBase64url('rapports-l1'); // 201 longue M — arrivé lot A (ex æquo)
const JETON_L2 = jetonBase64url('rapports-l2'); // 202 longue L — arrivé lot A (ex æquo)
const JETON_L3 = jetonBase64url('rapports-l3'); // 203 longue XL — km12 annulé puis repassé, arrivé lot B
const JETON_L4 = jetonBase64url('rapports-l4'); // 204 longue M — abandonné (lieu malveillant)
const JETON_L5 = jetonBase64url('rapports-l5'); // 205 longue S — en course, passée km18
const JETON_M1 = jetonBase64url('rapports-m1'); // 211 moyenne L — arrivé lot B
const JETON_S1 = jetonBase64url('rapports-s1'); // 221 sprint M — arrivé lot B (épreuve non configurée)
const JETON_X = jetonBase64url('rapports-x'); // 231 — épreuve ÉTRANGÈRE à l'édition courante : retrait IGNORÉ

function attendre(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

describe.skipIf(testUrls === null)(
  'rapports — intégration post-course et commande (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;

    let chronoStore: ReturnType<typeof createChronoStore>;
    let missionsStore: MissionsStore;
    let rapportsStore: ReturnType<typeof createRapportsStore>;

    let orgAId = '';
    let orgBId = '';
    /** Org SANS aucune édition : rapports à zéro, jamais une erreur. */
    let orgCId = '';
    let editionAId = '';
    let epreuveLongueId = '';
    let epreuveMoyenneId = '';
    let volontaireA: SessionRecord;
    let organisateurA: SessionRecord;
    let organisateurB: SessionRecord;
    let organisateurC: SessionRecord;

    let checkpointKm12Id = '';
    let checkpointKm18Id = '';
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

    async function creerCoureur(input: {
      jeton: string | null;
      dossard: number | null;
      epreuveSlug: string;
      taille: string;
      statut: string;
    }): Promise<void> {
      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${orgAId}, ${`coureur-${accountId}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, refusal_reason,
          dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${orgAId}, ${accountId}, ${editionAId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionAId} AND slug = ${input.epreuveSlug} LIMIT 1),
          'Prenom', 'Nom', '+213555010998', 'Contact', '0555010997',
          DATE '1990-05-12', ${input.taille}, 36, 'Senior', ${input.statut},
          ${input.statut === 'refusé' ? 'Dossier incomplet (test rapports)' : null},
          ${input.dossard}, ${input.jeton}
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

    /** Rapport post-course de l'org demandée, découpé en lignes. */
    async function lignesRapport(session: SessionRecord): Promise<string[]> {
      const rapport = await genererRapportPostCourse(session, { store: rapportsStore });
      expect(rapport.contenu.startsWith('\uFEFF')).toBe(true);
      expect(rapport.contenu.includes('\r\n')).toBe(true);
      return rapport.contenu.split('\r\n');
    }

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      chronoStore = createChronoStore(app);
      missionsStore = createMissionsStore(app);
      rapportsStore = createRapportsStore(app);

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

      // Troisième épreuve SANS heure de départ (arrivées sans temps → « — »).
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${randomUUID()}, ${orgAId}, ${editionAId}, 'sprint', 'Le Sprint — 5 km', 5.0)
      `;
      const epreuvesA = await sql<{ id: string; slug: string }[]>`
        SELECT id, slug FROM epreuve WHERE edition_id = ${editionAId} AND organisation_id = ${orgAId}
      `;
      epreuveLongueId = epreuvesA.find((e) => e.slug === 'longue')!.id;
      epreuveMoyenneId = epreuvesA.find((e) => e.slug === 'moyenne')!.id;

      // Org B isolée (preuve RLS) : son édition, son épreuve, son coureur 901.
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      const editionBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-rapports-${orgBId.slice(0, 8)}`}, 'Rapports Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`rapports-${orgBId.slice(0, 8)}`}, 'Autre Trail')
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
      const compteB = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${compteB}, ${orgBId}, ${`coureur-${compteB}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${orgBId}, ${compteB}, ${editionBId},
          (SELECT id FROM epreuve WHERE edition_id = ${editionBId} LIMIT 1),
          'Autre', 'Org', '+213555010999', 'Contact', '0555010998',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', 901, null
        )
      `;

      // Org C : organisation SANS édition — rapports à zéro.
      orgCId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgCId}, ${`org-sans-edition-${orgCId.slice(0, 8)}`}, 'Org Sans Édition Rapports')
      `;

      // Coureurs org A : statuts variés (validé / en constitution / refusé),
      // tailles XS–XXL, un validé SANS dossard (208 — commande oui, partant non).
      await creerCoureur({ jeton: JETON_L1, dossard: 201, epreuveSlug: 'longue', taille: 'M', statut: 'validé' });
      await creerCoureur({ jeton: JETON_L2, dossard: 202, epreuveSlug: 'longue', taille: 'L', statut: 'validé' });
      await creerCoureur({ jeton: JETON_L3, dossard: 203, epreuveSlug: 'longue', taille: 'XL', statut: 'validé' });
      await creerCoureur({ jeton: JETON_L4, dossard: 204, epreuveSlug: 'longue', taille: 'M', statut: 'validé' });
      await creerCoureur({ jeton: JETON_L5, dossard: 205, epreuveSlug: 'longue', taille: 'S', statut: 'validé' });
      await creerCoureur({ jeton: null, dossard: 206, epreuveSlug: 'longue', taille: 'XXL', statut: 'en constitution' });
      await creerCoureur({ jeton: null, dossard: 207, epreuveSlug: 'longue', taille: 'L', statut: 'refusé' });
      await creerCoureur({ jeton: null, dossard: null, epreuveSlug: 'longue', taille: 'XS', statut: 'validé' });
      await creerCoureur({ jeton: JETON_M1, dossard: 211, epreuveSlug: 'moyenne', taille: 'L', statut: 'validé' });
      await creerCoureur({ jeton: JETON_S1, dossard: 221, epreuveSlug: 'sprint', taille: 'M', statut: 'validé' });

      // Édition ANCIENNE de l'org A (race_date passée : la 2027 reste
      // courante) + un coureur de l'édition COURANTE dont l'épreuve lui
      // appartient (FK libre) : son retrait doit rester NEUTRE — cohérence
      // retraits ≤ somme des partants (les classements l'ignorent déjà).
      const editionAncienneId = randomUUID();
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionAncienneId}, ${orgAId},
                (SELECT evenement_id FROM edition WHERE id = ${editionAId}),
                '2026', 'Édition 2026', DATE '2026-06-13', TIMESTAMPTZ '2026-06-06T22:59:59Z')
      `;
      const epreuveAncienneId = randomUUID();
      await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${epreuveAncienneId}, ${orgAId}, ${editionAncienneId}, 'ancienne', 'L’Ancienne — 10 km', 10.0)
      `;
      const compteX = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${compteX}, ${orgAId}, ${`coureur-${compteX}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard, jeton_edossard
        )
        VALUES (
          ${randomUUID()}, ${orgAId}, ${compteX}, ${editionAId}, ${epreuveAncienneId},
          'Prenom', 'Nom', '+213555010998', 'Contact', '0555010997',
          DATE '1990-05-12', 'M', 36, 'Senior', 'validé', 231, ${JETON_X}
        )
      `;

      // 3 checkpoints : km 12, km 18, arrivée (est_arrivee).
      const secteur = await createSecteur(
        organisateurSession(),
        { nom: 'Secteur course', lieu: 'Tracé', contact: null },
        { store: missionsStore },
      );
      const km12 = await createMission(
        organisateurSession(),
        {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan km 12',
          debutLe: '2020-01-01T08:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: false,
        },
        { store: missionsStore },
      );
      const km18 = await createMission(
        organisateurSession(),
        {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan km 18',
          debutLe: '2020-01-01T09:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: false,
        },
        { store: missionsStore },
      );
      const arrivee = await createMission(
        organisateurSession(),
        {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan arrivée stade',
          debutLe: '2020-01-01T10:00:00.000Z',
          finLe: '2100-01-01T00:00:00.000Z',
          consignes: null,
          estArrivee: true,
        },
        { store: missionsStore },
      );
      checkpointKm12Id = km12.id;
      checkpointKm18Id = km18.id;
      checkpointArriveeId = arrivee.id;

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

      // Portée des partages 7.2 : agrégats multi-jours (org A) + un jour org B.
      await sql`
        INSERT INTO resultats_visite (organisation_id, edition_id, jour, visites)
        VALUES
          (${orgAId}, ${editionAId}, DATE '2027-03-26', 12),
          (${orgAId}, ${editionAId}, DATE '2027-03-27', 4),
          (${orgBId}, ${editionBId}, DATE '2027-03-26', 2)
      `;
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    it('après les retraits : synthèse complète — le retrait d’un coureur d’épreuve ÉTRANGÈRE est ignoré', async () => {
      await attendre(10);
      await sync('depart', 'rapports-appareil-depart', [
        retrait('rapports-appareil-depart', JETON_L1),
        retrait('rapports-appareil-depart', JETON_L2),
        retrait('rapports-appareil-depart', JETON_L3),
        retrait('rapports-appareil-depart', JETON_L4),
        retrait('rapports-appareil-depart', JETON_L5),
        retrait('rapports-appareil-depart', JETON_M1),
        retrait('rapports-appareil-depart', JETON_S1),
        // Épreuve étrangère à l'édition courante : INSCRIT (compté), mais son
        // retrait ne gonfle NI les présents NI aucun partant.
        retrait('rapports-appareil-depart', JETON_X),
      ]);

      const rapport = await genererRapportPostCourse(organisateurA, { store: rapportsStore });
      expect(rapport.nomFichier).toMatch(
        /^azzel-rapport-post-course-2027-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      const lignes = rapport.contenu.split('\r\n');
      // En-tête daté (Africa/Algiers) + fraîcheur des données.
      expect(lignes[0]).toMatch(/^\uFEFFGénéré le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
      expect(lignes[0]).toContain('fraîcheur des données :');
      expect(lignes).toContain('Édition;Édition 2027');
      // 11 inscrits (le 231 d'épreuve étrangère est bien inscrit de l'édition).
      expect(lignes).toContain('Inscrits (total);11');
      expect(lignes).toContain('Inscrits — En constitution;1');
      expect(lignes).toContain('Inscrits — Validé;9');
      expect(lignes).toContain('Inscrits — Refusé;1');
      // Cohérence retraits ≤ Σ partants : le retrait du 231 est IGNORÉ (7
      // retraits = 5 longue + 1 moyenne + 1 sprint, pas 8).
      expect(lignes).toContain('Retraits (présents au départ);7');
      // Partants par épreuve : 5 longue (le 208 sans dossard n'est PAS
      // partant), 1 moyenne, 1 sprint — en constitution et refusé absents,
      // 231 nulle part (épreuve étrangère, aucune ligne « L’Ancienne »).
      expect(lignes).toContain('Partants — La Longue — 35 km;5');
      expect(lignes).toContain('Partants — La Moyenne — 12 km;1');
      expect(lignes).toContain('Partants — Le Sprint — 5 km;1');
      expect(lignes).not.toContain('L’Ancienne');
      expect(lignes).toContain('Arrivées — La Longue — 35 km;0');
      // Section Arrivées présente avec son en-tête, AUCUNE ligne fantôme.
      expect(lignes).toContain('Épreuve;Dossard;Rang;Temps');
      expect(lignes).not.toContain('La Longue — 35 km;201;');
    });

    it('passages par checkpoint : coureurs DISTINCTS, arbitrés, annulations exclues — ré-arbitrage en lecture', async () => {
      await attendre(10);
      await sync('km12-a', 'rapports-appareil-km12-a', [
        passage('rapports-appareil-km12-a', JETON_L1, checkpointKm12Id),
        passage('rapports-appareil-km12-a', JETON_L2, checkpointKm12Id),
        passage('rapports-appareil-km12-a', JETON_L3, checkpointKm12Id),
      ]);
      await attendre(10);
      await sync('km18', 'rapports-appareil-km18', [
        passage('rapports-appareil-km18', JETON_L5, checkpointKm18Id),
      ]);

      // Annulation du PREMIER passage km12 de 203 : le SUIVANT (non annulé)
      // fera foi — 203 reste « passé », compté UNE fois.
      const premiers = await sql<{ id: string }[]>`
        SELECT id FROM terrain_evenement
        WHERE edition_id = ${editionAId}
          AND jeton_coureur = ${JETON_L3}
          AND checkpoint_id = ${checkpointKm12Id}
        ORDER BY horodatage_reception ASC, id ASC
        LIMIT 1
      `;
      expect(premiers[0]).toBeDefined();
      await annulerPassage(
        organisateurA,
        { evenementId: premiers[0]!.id, motif: 'Mauvais scan du dossard voisin' },
        { store: chronoStore },
      );
      await attendre(10);
      await sync('km12-b', 'rapports-appareil-km12-b', [
        passage('rapports-appareil-km12-b', JETON_L3, checkpointKm12Id),
      ]);

      const lignes = await lignesRapport(organisateurA);
      expect(lignes).toContain('Checkpoint;Secteur;Coureurs passés');
      expect(lignes).toContain('Scan km 12;Secteur course;3');
      expect(lignes).toContain('Scan km 18;Secteur course;1');
      expect(lignes).toContain('Scan arrivée stade;Secteur course;0');
    });

    it('arrivées : rangs/temps 7.1 repris TELS QUELS (ex æquo 1,1 puis 3), « — » sans heure de départ', async () => {
      await attendre(10);
      await sync('arrivee-a', 'rapports-appareil-arrivee-a', [
        passage('rapports-appareil-arrivee-a', JETON_L1, checkpointArriveeId),
        passage('rapports-appareil-arrivee-a', JETON_L2, checkpointArriveeId),
      ]);
      await attendre(10);
      await sync('arrivee-b', 'rapports-appareil-arrivee-b', [
        passage('rapports-appareil-arrivee-b', JETON_L3, checkpointArriveeId),
        passage('rapports-appareil-arrivee-b', JETON_M1, checkpointArriveeId),
        passage('rapports-appareil-arrivee-b', JETON_S1, checkpointArriveeId),
      ]);

      const lignes = await lignesRapport(organisateurA);
      const tempsLongueA = formaterTempsRapport(temps(departLongue, 'arrivee-a'));
      const tempsLongueB = formaterTempsRapport(temps(departLongue, 'arrivee-b'));
      expect(lignes).toContain(`La Longue — 35 km;201;1;${tempsLongueA}`);
      expect(lignes).toContain(`La Longue — 35 km;202;1;${tempsLongueA}`);
      expect(lignes).toContain(`La Longue — 35 km;203;3;${tempsLongueB}`);
      expect(lignes).toContain(
        `La Moyenne — 12 km;211;1;${formaterTempsRapport(temps(departMoyenne, 'arrivee-b'))}`,
      );
      // Sprint jamais configuré : arrivé SANS rang ni temps (jamais faux à zéro).
      expect(lignes).toContain('Le Sprint — 5 km;221;—;—');
      expect(lignes).toContain('Arrivées — La Longue — 35 km;3');
      expect(lignes).toContain('Arrivées — La Moyenne — 12 km;1');
      expect(lignes).toContain('Arrivées — Le Sprint — 5 km;1');
    });

    it('abandons détaillés 5.3 : épreuve, dossard, lieu ÉCHAPPÉ RFC 4180, motif, heure, auteur', async () => {
      const abandon = await saisirAbandon(
        organisateurA,
        {
          dossard: 204,
          lieu: 'Carrefour "Km 12"; ravitaillement',
          motif: 'epuisement',
          heure: new Date().toISOString(),
        },
        { store: chronoStore },
      );
      expect(abandon.dossard).toBe(204);

      const lignes = await lignesRapport(organisateurA);
      expect(lignes).toContain('Épreuve;Dossard;Lieu;Motif;Heure;Auteur');
      const ligneAbandon = lignes.find((ligne) => ligne.startsWith('La Longue — 35 km;204;'));
      expect(ligneAbandon).toBeDefined();
      // RFC 4180 : guillemets doublés, séparateur interne quoté —
      // l'injection `" ; =SOMME(...)` est neutralisée par le même mécanisme.
      expect(ligneAbandon).toContain('"Carrefour ""Km 12""; ravitaillement"');
      expect(ligneAbandon).toContain('Épuisement');
      expect(ligneAbandon).toContain(organisateurA.email);
      expect(ligneAbandon).toMatch(/\d{2}:\d{2}:\d{2}/);
      expect(lignes).toContain('Abandons — La Longue — 35 km;1');
      // L'abandonné reste dans le rapport (épopée 5) : partant inchangé.
      expect(lignes).toContain('Partants — La Longue — 35 km;5');
    });

    it('portée des partages 7.2 : une ligne par jour + total honnête', async () => {
      const lignes = await lignesRapport(organisateurA);
      expect(lignes).toContain('Jour;Visites');
      expect(lignes).toContain('2027-03-26;12');
      expect(lignes).toContain('2027-03-27;4');
      expect(lignes).toContain('Total;16');
    });

    it('commande : validés par épreuve × taille (dossard JAMAIS requis), totaux, médailles, zéro stock', async () => {
      const commande = await genererCommande(organisateurA, { store: rapportsStore });
      expect(commande.nomFichier).toMatch(/^azzel-commande-2027-\d{4}-\d{2}-\d{2}\.csv$/);
      const lignes = commande.contenu.split('\r\n');
      expect(lignes).toContain('Épreuve;XS;S;M;L;XL;XXL;Total');
      // Le 208 (validé SANS dossard) commande bien son XS ; les statuts non
      // validés (206 XXL en constitution, 207 L refusé) ne commandent RIEN.
      expect(lignes).toContain('La Longue — 35 km;1;1;2;1;1;0;6');
      expect(lignes).toContain('La Moyenne — 12 km;0;0;0;1;0;0;1');
      expect(lignes).toContain('Le Sprint — 5 km;0;0;1;0;0;0;1');
      expect(lignes).toContain('Toutes épreuves;1;1;3;2;1;0;8');
      expect(lignes).toContain('Médailles par épreuve');
      expect(lignes).toContain('La Longue — 35 km;6');
      expect(lignes).toContain('La Moyenne — 12 km;1');
      expect(lignes).toContain('Le Sprint — 5 km;1');
      expect(lignes).toContain('Total;8');
      expect(commande.contenu).toContain('Zéro stock : commandé = validé');
      expect(commande.contenu).not.toContain('En constitution');
      expect(commande.contenu).not.toContain('Refusé');
    });

    it('RLS multi-org : l’org B ne voit QUE son édition — aucun dossard ni épreuve de l’org A', async () => {
      const rapportB = await genererRapportPostCourse(organisateurB, { store: rapportsStore });
      const lignesB = rapportB.contenu.split('\r\n');
      expect(lignesB).toContain('Édition;Autre 2027');
      expect(lignesB).toContain('Inscrits (total);1');
      expect(lignesB).toContain('Inscrits — Validé;1');
      expect(lignesB).toContain('Total;2');
      // Aucune fuite de l'org A : épreuves, dossards, checkpoints, visites.
      expect(rapportB.contenu).not.toContain('La Longue');
      expect(rapportB.contenu).not.toContain('Édition 2027');
      expect(rapportB.contenu).not.toContain(';204;');
      expect(rapportB.contenu).not.toContain('2027-03-27');

      const rapportA = await genererRapportPostCourse(organisateurA, { store: rapportsStore });
      expect(rapportA.contenu).not.toContain('L’Unique');
      expect(rapportA.contenu).not.toContain(';901;');

      const commandeB = await genererCommande(organisateurB, { store: rapportsStore });
      const lignesCommandeB = commandeB.contenu.split('\r\n');
      expect(lignesCommandeB).toContain('L’Unique;0;0;1;0;0;0;1');
      expect(lignesCommandeB).toContain('Total;1');
      expect(commandeB.contenu).not.toContain('La Longue');
    });

    it('édition vide (org C sans édition) : sections présentes, zéros lisibles, aucune ligne fantôme', async () => {
      const rapport = await genererRapportPostCourse(organisateurC, { store: rapportsStore });
      expect(rapport.nomFichier).toMatch(
        /^azzel-rapport-post-course-aucune-edition-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      const lignes = rapport.contenu.split('\r\n');
      // En-tête honnête (aucune fraîcheur inventée), sections présentes.
      expect(lignes[0]).toMatch(/^\uFEFFGénéré le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/);
      expect(lignes[0]).toContain('fraîcheur des données : aucune donnée reçue');
      for (const titre of [
        'Synthèse',
        'Passages par checkpoint',
        'Arrivées',
        'Abandons',
        'Portée des partages',
      ]) {
        expect(lignes).toContain(titre);
      }
      expect(lignes).toContain('Édition;—');
      expect(lignes).toContain('Inscrits (total);0');
      expect(lignes).toContain('Retraits (présents au départ);0');
      expect(lignes).toContain('Total;0');

      const commande = await genererCommande(organisateurC, { store: rapportsStore });
      const lignesCommande = commande.contenu.split('\r\n');
      expect(lignesCommande).toContain('Toutes épreuves;0;0;0;0;0;0;0');
      expect(lignesCommande).toContain('Total;0');
    });
  },
);
