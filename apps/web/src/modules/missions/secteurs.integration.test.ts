import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withOrg } from '@/db/org-scope';
import { type SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  databaseUrl,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
  TEST_DATABASE,
} from '@/test/integration-db';

import { importVolontaires } from './service';
import {
  AucuneEditionError,
  InvalidMissionFieldsError,
  MissionArriveeUniqueError,
  SecteurNomDupliqueError,
  SecteurOccupeError,
  SecteurNotFoundError,
  VolontaireNotFoundError,
  MissionNotFoundError,
} from './errors';
import {
  affecterVolontaire,
  createMission,
  createSecteur,
  deleteMission,
  deleteSecteur,
  desaffecterVolontaire,
  getMissionsAdminState,
  getMissionsVolontaireState,
  updateMission,
  updateSecteur,
} from './service';
import { createMissionsStore, type MissionsStore } from './store';

// Story 3.2 — intégration secteurs/missions/affectations (base azzel_test,
// rôle azzel_app) : CRUD + couverture dérivée end-to-end, chevauchement réel
// inter-secteurs (avertissement NON bloquant), désaffectation → vacante,
// cascade suppression mission, refus secteur occupé, état volontaire.

const testUrls = resolveTestDatabaseUrls('missions-secteurs');

function sessionAdmin(organisationId: string): SessionRecord {
  return {
    accountId: '00000000-0000-0000-0000-0000000000aa',
    organisationId,
    email: 'organisateur@exemple.dz',
    role: 'organisateur',
    createdAt: new Date(),
  };
}

const DEBUT_A = new Date('2027-05-16T06:00:00.000Z');
const FIN_A = new Date('2027-05-16T12:00:00.000Z');
const DEBUT_B = new Date('2027-05-16T10:00:00.000Z');
const FIN_B = new Date('2027-05-16T14:00:00.000Z');
const DEBUT_C = new Date('2027-05-16T13:00:00.000Z');
const FIN_C = new Date('2027-05-16T15:00:00.000Z');

describe.skipIf(testUrls === null)(
  'missions 3.2 — intégration secteurs, missions typées, affectations (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let missionsStore: MissionsStore;
    let orgId = '';
    let editionId = '';

    // Identités de travail, créées au premier test qui en a besoin.
    let secteurVillageId = '';
    let secteurTronconId = '';
    let missionAId = '';
    let missionBId = '';
    let missionCId = '';
    let karimId = '';

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      sql = connections.owner;
      missionsStore = createMissionsStore(connections.app);
      const organisations =
        await sql<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgId = organisations[0]?.id ?? '';
      if (!orgId) {
        throw new Error('Seed « ait-aissi » absente : lance pnpm -F @azzel/web db:migrate');
      }
      const editions = await sql<{ id: string }[]>`
        SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${orgId}
      `;
      editionId = editions[0]?.id ?? '';
      if (!editionId) {
        throw new Error('Seed édition « 2027 » absente');
      }
    }, 60_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    async function importerVolontaire(nom: string, email: string): Promise<string> {
      const csv = new TextEncoder().encode(`Nom;Email;Téléphone\n${nom};${email};`);
      await importVolontaires(sessionAdmin(orgId), { bytes: csv, filename: 'v.csv' }, {
        store: missionsStore,
      });
      const rows = await sql<{ id: string }[]>`
        SELECT v.id FROM volontaire v
        JOIN account a ON a.id = v.account_id
        WHERE a.email = ${email} AND v.organisation_id = ${orgId}
      `;
      const id = rows[0]?.id;
      if (!id) {
        throw new Error(`volontaire ${nom} absent après import`);
      }
      return id;
    }

    it('édition courante résolue localement : la seed 2027 (pattern findCurrentEdition)', async () => {
      const edition = await missionsStore.findCurrentEdition(orgId);
      expect(edition).toMatchObject({ id: editionId, nom: 'Édition 2027' });
      // État admin vide : aucun secteur, volontaires importables listés.
      const state = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      expect(state.edition).toEqual({ id: editionId, nom: 'Édition 2027' });
      expect(state.secteurs).toEqual([]);
    });

    it('CRUD secteur : création sur l’édition courante, doublon de nom refusé proprement, édition, suppression', async () => {
      const village = await createSecteur(sessionAdmin(orgId), {
        nom: 'Village départ',
        lieu: 'Place du village, Aït Aïssi',
        contact: '+213 555 010 203',
      }, { store: missionsStore });
      secteurVillageId = village.id;
      expect(village).toMatchObject({ nom: 'Village départ', contact: '+213 555 010 203' });

      await expect(
        createSecteur(sessionAdmin(orgId), { nom: 'Village départ', lieu: 'Autre lieu' }, {
          store: missionsStore,
        }),
      ).rejects.toBeInstanceOf(SecteurNomDupliqueError);

      const modifie = await updateSecteur(sessionAdmin(orgId), secteurVillageId, {
        nom: 'Village départ',
        lieu: 'Place centrale, Aït Aïssi',
        contact: '',
      }, { store: missionsStore });
      expect(modifie).toMatchObject({ lieu: 'Place centrale, Aït Aïssi', contact: null });

      const troncon = await createSecteur(sessionAdmin(orgId), {
        nom: 'Tronçon forêt',
        lieu: 'Carrefour PK 10',
      }, { store: missionsStore });
      secteurTronconId = troncon.id;

      const state = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      expect(state.secteurs.map((s) => s.nom)).toEqual(['Village départ', 'Tronçon forêt']);
      // Tous les secteurs portent l'édition courante (frontière ÉDITION → SECTEUR).
      const editions = await sql<{ edition_id: string }[]>`
        SELECT edition_id FROM secteur WHERE organisation_id = ${orgId}
      `;
      expect(editions.every((row) => row.edition_id === editionId)).toBe(true);
    });

    it('renommage de secteur vers un nom déjà pris : 23505 mappé en SecteurNomDupliqueError, rien modifié', async () => {
      await expect(
        updateSecteur(sessionAdmin(orgId), secteurTronconId, {
          nom: 'Village départ',
          lieu: 'Carrefour PK 10',
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(SecteurNomDupliqueError);
      const rows = await sql<{ nom: string; lieu: string }[]>`
        SELECT nom, lieu FROM secteur WHERE id = ${secteurTronconId}
      `;
      expect(rows[0]).toEqual({ nom: 'Tronçon forêt', lieu: 'Carrefour PK 10' });

      // Secteur inconnu de l'organisation : 404, jamais un 500.
      await expect(
        updateSecteur(sessionAdmin(orgId), '00000000-0000-0000-0000-0000000000fe', {
          nom: 'Fantôme',
          lieu: 'Nulle part',
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(SecteurNotFoundError);
    });

    it('mission typée : types fermés refusés côté domaine, CHECK SQL en défense (fin > début)', async () => {
      const missionA = await createMission(sessionAdmin(orgId), {
        secteurId: secteurVillageId,
        type: 'accueil',
        titre: 'Accueil village',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
        consignes: 'Arrive 15 min avant. Tiens le stand d’information.',
      }, { store: missionsStore });
      missionAId = missionA.id;
      expect(missionA).toMatchObject({ type: 'accueil', couverture: 'vacante' });

      // Type personnalisé : refusé par le domaine (400, erreur de champ type)
      // AVANT la base — jamais de type hors liste fermée.
      await expect(
        createMission(sessionAdmin(orgId), {
          secteurId: secteurVillageId,
          type: 'cuisine',
          titre: 'Cantine',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(InvalidMissionFieldsError);

      // CHECK SQL fin > debut en défense en profondeur (insertion directe).
      await expect(
        sql`
          INSERT INTO mission (organisation_id, secteur_id, type, titre, debut_le, fin_le)
          VALUES (${orgId}, ${secteurVillageId}, 'accueil', 'Illégale',
                  ${DEBUT_A}, ${new Date(DEBUT_A.getTime() - 60_000)})
        `,
      ).rejects.toThrow();

      // Secteur d’une autre organisation : 404, rien créé.
      await expect(
        createMission(sessionAdmin(orgId), {
          secteurId: '00000000-0000-0000-0000-0000000000ff',
          type: 'accueil',
          titre: 'Secteur fantôme',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(SecteurNotFoundError);

      // Mission B (autre secteur, chevauchante avec A) + C (non chevauchante).
      const missionB = await createMission(sessionAdmin(orgId), {
        secteurId: secteurTronconId,
        type: 'securite_troncon',
        titre: 'Barrière PK 10',
        debutLe: DEBUT_B.toISOString(),
        finLe: FIN_B.toISOString(),
      }, { store: missionsStore });
      missionBId = missionB.id;
      const missionC = await createMission(sessionAdmin(orgId), {
        secteurId: secteurTronconId,
        type: 'scan_checkpoint',
        titre: 'Scan PK 12',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
      }, { store: missionsStore });
      missionCId = missionC.id;
    });

    it('couverture dérivée end-to-end : vacante → affectation → couverte → désaffectation → vacante', async () => {
      karimId = await importerVolontaire('Karim', 'karim@exemple.dz');

      const avant = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      const missionAvant = avant.secteurs
        .flatMap((s) => s.missions)
        .find((m) => m.id === missionAId);
      expect(missionAvant?.couverture).toBe('vacante');

      const premiere = await affecterVolontaire(sessionAdmin(orgId), {
        missionId: missionAId,
        volontaireId: karimId,
      }, { store: missionsStore });
      expect(premiere).toEqual({ ok: true, cree: true, avertissement: null });

      const pendant = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      const missionPendant = pendant.secteurs
        .flatMap((s) => s.missions)
        .find((m) => m.id === missionAId);
      expect(missionPendant?.couverture).toBe('couverte');
      expect(missionPendant?.affectations).toEqual([
        { volontaireId: karimId, volontaireNom: 'Karim' },
      ]);

      // Ré-affectation du même volontaire : doublon ignoré proprement (UNIQUE).
      const doublon = await affecterVolontaire(sessionAdmin(orgId), {
        missionId: missionAId,
        volontaireId: karimId,
      }, { store: missionsStore });
      expect(doublon.cree).toBe(false);

      // Désaffectation : la mission repasse vacante — idempotente au deuxième
      // appel (supprime false, jamais d'erreur).
      const premiereDesaffectation = await desaffecterVolontaire(sessionAdmin(orgId), {
        missionId: missionAId,
        volontaireId: karimId,
      }, { store: missionsStore });
      expect(premiereDesaffectation).toEqual({ ok: true, supprime: true });
      const secondeDesaffectation = await desaffecterVolontaire(sessionAdmin(orgId), {
        missionId: missionAId,
        volontaireId: karimId,
      }, { store: missionsStore });
      expect(secondeDesaffectation).toEqual({ ok: true, supprime: false });

      const apres = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      const missionApres = apres.secteurs
        .flatMap((s) => s.missions)
        .find((m) => m.id === missionAId);
      expect(missionApres?.couverture).toBe('vacante');
      expect(missionApres?.affectations).toEqual([]);
    });

    it('chevauchement réel inter-secteurs : affectation MAINTENUE + avertissement listant la mission en conflit', async () => {
      // Karim sur A (06 h–12 h, village) puis B (10 h–14 h, tronçon) : conflit.
      await affecterVolontaire(sessionAdmin(orgId), {
        missionId: missionAId,
        volontaireId: karimId,
      }, { store: missionsStore });

      const conflit = await affecterVolontaire(sessionAdmin(orgId), {
        missionId: missionBId,
        volontaireId: karimId,
      }, { store: missionsStore });
      expect(conflit.cree).toBe(true);
      expect(conflit.avertissement?.missions).toEqual([
        {
          missionId: missionAId,
          secteurNom: 'Village départ',
          typeLabel: 'Accueil',
          titre: 'Accueil village',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
        },
      ]);

      // L'affectation existe bel et bien (jamais bloquée) : B est couverte.
      const state = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      const parId = new Map(state.secteurs.flatMap((s) => s.missions).map((m) => [m.id, m]));
      expect(parId.get(missionBId)?.couverture).toBe('couverte');
      expect(parId.get(missionBId)?.affectations.map((a) => a.volontaireNom)).toEqual(['Karim']);

      // Mission C (13 h–15 h) : AUCUN chevauchement avec A (finie à 12 h) ni
      // B (finie à 14 h)… C chevauche B (13 h < 14 h) : attends-toi à B en conflit.
      const conflitC = await affecterVolontaire(sessionAdmin(orgId), {
        missionId: missionCId,
        volontaireId: karimId,
      }, { store: missionsStore });
      expect(conflitC.avertissement?.missions.map((m) => m.missionId)).toEqual([missionBId]);
    });

    it('état volontaire : ses missions + couverture générale de l’édition', async () => {
      const compteKarim = await sql<{ id: string }[]>`
        SELECT account_id AS id FROM volontaire WHERE id = ${karimId}
      `;
      const sessionKarim: SessionRecord = {
        accountId: compteKarim[0]?.id ?? '',
        organisationId: orgId,
        email: 'karim@exemple.dz',
        role: 'volontaire',
        createdAt: new Date(),
      };
      const state = await getMissionsVolontaireState(sessionKarim, { store: missionsStore });
      expect(state.editionNom).toBe('Édition 2027');
      // Karim est affecté à A, B et C (le chevauchement n'a jamais bloqué).
      expect(state.mesMissions.map((m) => m.titre).sort()).toEqual([
        'Accueil village',
        'Barrière PK 10',
        'Scan PK 12',
      ]);
      expect(state.mesMissions[0]?.secteurNom).toBeTruthy();
      // Fiche 3.3 : lieu terrain + contact PC portés (null quand non renseigné
      // — le contact du village a été effacé plus tôt dans la suite).
      const scan = state.mesMissions.find((m) => m.titre === 'Scan PK 12');
      expect(scan).toMatchObject({ secteurLieu: 'Carrefour PK 10', secteurContact: null });
      const accueil = state.mesMissions.find((m) => m.titre === 'Accueil village');
      expect(accueil).toMatchObject({ secteurLieu: 'Place centrale, Aït Aïssi' });
      // Toutes les missions visibles avec leur couverture — tout est couvert.
      expect(state.missions.every((m) => m.couverture === 'couverte')).toBe(true);

      // Un volontaire sans missions : message d'attente (mesMissions vide).
      const linaId = await importerVolontaire('Lina', 'lina@exemple.dz');
      const compteLina = await sql<{ id: string }[]>`
        SELECT account_id AS id FROM volontaire WHERE id = ${linaId}
      `;
      const sessionLina: SessionRecord = {
        accountId: compteLina[0]?.id ?? '',
        organisationId: orgId,
        email: 'lina@exemple.dz',
        role: 'volontaire',
        createdAt: new Date(),
      };
      const stateLina = await getMissionsVolontaireState(sessionLina, { store: missionsStore });
      expect(stateLina.mesMissions).toEqual([]);
      expect(stateLina.missions.length).toBe(3);
    });

    it('cascade : supprimer une mission supprime ses affectations et la couverture suit', async () => {
      const affectationsAvant = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM affectation WHERE mission_id = ${missionBId}
      `;
      expect(affectationsAvant[0]?.count).toBe(1);

      await deleteMission(sessionAdmin(orgId), missionBId, { store: missionsStore });

      const affectationsApres = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM affectation WHERE mission_id = ${missionBId}
      `;
      expect(affectationsApres[0]?.count).toBe(0);

      // L'état recalculé ne mentionne plus B ; C reste couverte par Karim.
      const state = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      const ids = state.secteurs.flatMap((s) => s.missions).map((m) => m.id);
      expect(ids).not.toContain(missionBId);
      expect(ids).toContain(missionCId);

      // Mission inconnue / autre org : 404.
      await expect(
        deleteMission(sessionAdmin(orgId), '00000000-0000-0000-0000-0000000000f1', {
          store: missionsStore,
        }),
      ).rejects.toBeInstanceOf(MissionNotFoundError);
    });

    it('suppression secteur occupé refusée (409), vide après retrait des missions', async () => {
      await expect(
        deleteSecteur(sessionAdmin(orgId), secteurTronconId, { store: missionsStore }),
      ).rejects.toBeInstanceOf(SecteurOccupeError);

      // Retire la mission restante du tronçon : le secteur devient supprimable.
      await deleteMission(sessionAdmin(orgId), missionCId, { store: missionsStore });
      await expect(
        deleteSecteur(sessionAdmin(orgId), secteurTronconId, { store: missionsStore }),
      ).resolves.toEqual({ ok: true });
      const state = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      expect(state.secteurs.map((s) => s.id)).toEqual([secteurVillageId]);
    });

    it('affectation croisée : volontaire inconnu de l’organisation → 404, rien créé', async () => {
      await expect(
        affecterVolontaire(sessionAdmin(orgId), {
          missionId: missionAId,
          volontaireId: '00000000-0000-0000-0000-0000000000f2',
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(VolontaireNotFoundError);
      await expect(
        affecterVolontaire(sessionAdmin(orgId), {
          missionId: '00000000-0000-0000-0000-0000000000f3',
          volontaireId: karimId,
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(MissionNotFoundError);
      const affectations = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM affectation
        WHERE organisation_id = ${orgId} AND mission_id = ${missionAId}
      `;
      expect(affectations[0]?.count).toBe(1);
    });

    it('concurrence : deux affectations chevauchantes simultanées du même volontaire se sérialisent (verrou volontaire)', async () => {
      // READ COMMITTED sans verrou : chaque transaction ne verrait pas l'autre
      // → avertissement perdu. Le FOR UPDATE sur la ligne volontaire sérialise :
      // la seconde VOIT la première, exactement un avertissement au total.
      const nadiaId = await importerVolontaire('Nadia', 'nadia@exemple.dz');
      const missionD = await createMission(sessionAdmin(orgId), {
        secteurId: secteurVillageId,
        type: 'accueil',
        titre: 'Accueil ravitaillement',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
      }, { store: missionsStore });
      const missionE = await createMission(sessionAdmin(orgId), {
        secteurId: secteurVillageId,
        type: 'communication',
        titre: 'Radio course',
        debutLe: DEBUT_B.toISOString(),
        finLe: FIN_B.toISOString(),
      }, { store: missionsStore });

      const [versD, versE] = await Promise.all([
        affecterVolontaire(sessionAdmin(orgId), {
          missionId: missionD.id,
          volontaireId: nadiaId,
        }, { store: missionsStore }),
        affecterVolontaire(sessionAdmin(orgId), {
          missionId: missionE.id,
          volontaireId: nadiaId,
        }, { store: missionsStore }),
      ]);

      // Les DEUX affectations existent (jamais bloquées)…
      expect(versD.cree).toBe(true);
      expect(versE.cree).toBe(true);
      // …et la seconde (ordre indifférent) a vu la première : un seul
      // avertissement au total, listant l'autre mission chevauchante.
      const avertissements = [versD, versE].filter((r) => r.avertissement !== null);
      expect(avertissements).toHaveLength(1);
      const conflit = avertissements[0]?.avertissement?.missions[0];
      expect(conflit?.titre).toMatch(/Accueil ravitaillement|Radio course/);

      const affectationsNadia = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM affectation WHERE volontaire_id = ${nadiaId}
      `;
      expect(affectationsNadia[0]?.count).toBe(2);
    });

    it('contraintes structurelles : UNIQUE (edition_id, nom) en base, garde « aucune édition » réelle', async () => {
      // L'UNIQUE protège même une insertion SQL directe.
      await expect(
        sql`
          INSERT INTO secteur (organisation_id, edition_id, nom, lieu)
          VALUES (${orgId}, ${editionId}, 'Village départ', 'Doublon')
        `,
      ).rejects.toMatchObject({ code: '23505', constraint_name: 'secteur_edition_id_nom_key' });

      // Le CHECK 0021 borne le contact secteur même en insertion directe.
      await expect(
        sql`
          INSERT INTO secteur (organisation_id, edition_id, nom, lieu, contact)
          VALUES (${orgId}, ${editionId}, 'Contact trop long', 'Lieu', ${'x'.repeat(33)})
        `,
      ).rejects.toThrow(/secteur_contact_len_check/);

      // Garde « aucune édition » de bout en bout : une organisation sans
      // édition (fixture propriétaire, DML) ne peut pas créer de secteur —
      // 409 admin.missions.aucune_edition, pas de 500.
      const orgSansEditionId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgSansEditionId}, ${`org-sans-edition-${orgSansEditionId.slice(0, 8)}`}, 'Trail vide')
      `;
      await expect(
        createSecteur(sessionAdmin(orgSansEditionId), { nom: 'Village', lieu: 'Place' }, {
          store: missionsStore,
        }),
      ).rejects.toBeInstanceOf(AucuneEditionError);
    });

    it('story 5.1 — est_arrivee : au plus UN checkpoint d’arrivée par édition (création, édition, re-coche, bascule)', async () => {
      // Fixtures propres (les secteurs/missions des tests précédents ont pu
      // être supprimés par les tests de cascade).
      const secteur = await createSecteur(sessionAdmin(orgId), {
        nom: 'Secteur arrivée',
        lieu: 'Stade',
        contact: null,
      }, { store: missionsStore });
      const missionScan = await createMission(sessionAdmin(orgId), {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan PK 20',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
        estArrivee: true,
      }, { store: missionsStore });
      expect(missionScan.estArrivee).toBe(true);

      // Vues admin et volontaire exposent le drapeau.
      const adminState = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      expect(
        adminState.secteurs.flatMap((s) => s.missions).find((m) => m.id === missionScan.id)?.estArrivee,
      ).toBe(true);
      const volontaireState = await getMissionsVolontaireState(sessionAdmin(orgId), {
        store: missionsStore,
      });
      expect(
        volontaireState.missions.find((m) => m.id === missionScan.id)?.estArrivee,
      ).toBe(true);

      // UNE seconde mission cochée sur la même édition : refusée, à la CRÉATION…
      await expect(
        createMission(sessionAdmin(orgId), {
          secteurId: secteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan arrivée stade',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
          estArrivee: true,
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(MissionArriveeUniqueError);
      // …comme à l'ÉDITION d'une mission scan existante (autre secteur, même
      // édition). NB : cocher une mission NON-scan serait refusée plus tôt par
      // le domaine (erreur champ estArrivee) — l'unicité se joue entre scans.
      const autreSecteur = await createSecteur(sessionAdmin(orgId), {
        nom: 'Autre secteur 5.1',
        lieu: 'Carrefour',
        contact: null,
      }, { store: missionsStore });
      const missionScanAutre = await createMission(sessionAdmin(orgId), {
        secteurId: autreSecteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan autre secteur',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
        estArrivee: false,
      }, { store: missionsStore });
      await expect(
        updateMission(sessionAdmin(orgId), missionScanAutre.id, {
          secteurId: autreSecteur.id,
          type: 'scan_checkpoint',
          titre: 'Scan autre secteur',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
          estArrivee: true,
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(MissionArriveeUniqueError);

      // Miroir domaine (revue) : la marque sur une mission ACCUEIL est refusée
      // AVANT le store — erreur champ, pas MissionArriveeUniqueError.
      await createMission(sessionAdmin(orgId), {
        secteurId: autreSecteur.id,
        type: 'accueil',
        titre: 'Accueil 5.1',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
        estArrivee: false,
      }, { store: missionsStore });
      await expect(
        createMission(sessionAdmin(orgId), {
          secteurId: autreSecteur.id,
          type: 'accueil',
          titre: 'Accueil refusé',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
          estArrivee: true,
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(InvalidMissionFieldsError);

      // Re-cocher la MÊME mission : idempotent (elle s'exclut elle-même).
      const recochee = await updateMission(sessionAdmin(orgId), missionScan.id, {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan PK 20',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
        estArrivee: true,
      }, { store: missionsStore });
      expect(recochee.mission.estArrivee).toBe(true);

      // Décocher puis cocher une AUTRE mission : la bascule passe.
      await updateMission(sessionAdmin(orgId), missionScan.id, {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan PK 20',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
        estArrivee: false,
      }, { store: missionsStore });
      const basculee = await createMission(sessionAdmin(orgId), {
        secteurId: autreSecteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan arrivée stade',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
        estArrivee: true,
      }, { store: missionsStore });
      expect(basculee.estArrivee).toBe(true);

      // Supprimer la mission cochée LIBÈRE le slot : une nouvelle mission
      // scan peut être cochée sans 409 (la garde ne compte que l'existant).
      await deleteMission(sessionAdmin(orgId), basculee.id, { store: missionsStore });
      const recocheeApresSuppression = await createMission(sessionAdmin(orgId), {
        secteurId: secteur.id,
        type: 'scan_checkpoint',
        titre: 'Scan PK 22',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
        estArrivee: true,
      }, { store: missionsStore });
      expect(recocheeApresSuppression.estArrivee).toBe(true);

      // Exactement UNE mission cochée en base pour l'édition (index partiel 0026).
      const cochees = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM mission m
        JOIN secteur s ON s.id = m.secteur_id
        WHERE s.edition_id = ${editionId} AND m.est_arrivee
      `;
      expect(cochees[0]?.count).toBe(1);
    });

    it('suppression secteur pendant une insertion de mission NON commitée : le verrou FOR UPDATE force le 409, la mission survit', async () => {
      // Entrelacement DÉTERMINISTE : une transaction applicative (connexion
      // dédiée) insère une mission dans un secteur VIDE et reste ouverte ;
      // deleteSecteur démarre, on attend qu'il soit BLOQUÉ sur un verrou, puis
      // on commit. Sans le FOR UPDATE, le comptage (0, insertion invisible)
      // passerait et le DELETE emporterait la mission en cascade silencieuse.
      const vide = await createSecteur(sessionAdmin(orgId), {
        nom: 'Secteur course suppression',
        lieu: 'Col',
      }, { store: missionsStore });
      const concurrente = postgres(databaseUrl(appUrl, TEST_DATABASE), { max: 1 });
      try {
        let signalerInsertion: () => void = () => undefined;
        const inseree = new Promise<void>((resolve) => {
          signalerInsertion = resolve;
        });
        let relacher: () => void = () => undefined;
        const commit = new Promise<void>((resolve) => {
          relacher = resolve;
        });
        const transaction = withOrg(concurrente, orgId, async (tx) => {
          const rows = await tx<{ id: string }[]>`
            INSERT INTO mission (organisation_id, secteur_id, type, titre, debut_le, fin_le)
            VALUES (${orgId}, ${vide.id}, 'accueil', 'Insérée pendant la suppression',
                    ${DEBUT_A}, ${FIN_A})
            RETURNING id
          `;
          signalerInsertion();
          await commit;
          return rows[0]?.id ?? '';
        });
        await inseree;

        const suppression = deleteSecteur(sessionAdmin(orgId), vide.id, {
          store: missionsStore,
        }).then(
          () => 'supprimé' as const,
          (error: unknown) => error,
        );
        // Attente active bornée : la suppression doit être EN ATTENTE de verrou
        // (pg_stat_activity, vue propriétaire) avant le commit concurrent.
        let bloquee = false;
        for (let essai = 0; essai < 100 && !bloquee; essai += 1) {
          const attentes = await sql<{ count: number }[]>`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname = ${TEST_DATABASE}
              AND wait_event_type = 'Lock'
              AND query ILIKE '%secteur%'
          `;
          bloquee = (attentes[0]?.count ?? 0) > 0;
          if (!bloquee) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
        expect(bloquee).toBe(true);

        relacher();
        const missionId = await transaction;
        const issue = await suppression;
        expect(issue).toBeInstanceOf(SecteurOccupeError);

        const restantes = await sql<{ id: string; secteur_id: string }[]>`
          SELECT id, secteur_id FROM mission WHERE id = ${missionId}
        `;
        expect(restantes).toEqual([{ id: missionId, secteur_id: vide.id }]);
        const secteurs = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM secteur WHERE id = ${vide.id}
        `;
        expect(secteurs[0]?.count).toBe(1);
      } finally {
        await concurrente.end({ timeout: 5 });
      }
    });

    it('updateMission : champs, changement de secteur, secteur d’une autre organisation → 404, mission inconnue → 404', async () => {
      const nord = await createSecteur(sessionAdmin(orgId), { nom: 'Secteur MAJ nord', lieu: 'Crête' }, {
        store: missionsStore,
      });
      const sud = await createSecteur(sessionAdmin(orgId), { nom: 'Secteur MAJ sud', lieu: 'Gué' }, {
        store: missionsStore,
      });
      const mission = await createMission(sessionAdmin(orgId), {
        secteurId: nord.id,
        type: 'accueil',
        titre: 'Accueil crête',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
      }, { store: missionsStore });

      // Tous les champs remplacés + secteur changé : relus en base.
      const modifiee = await updateMission(sessionAdmin(orgId), mission.id, {
        secteurId: sud.id,
        type: 'communication',
        titre: 'Radio gué',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
        consignes: 'Canal 3.',
      }, { store: missionsStore });
      expect(modifiee.mission).toMatchObject({
        id: mission.id,
        secteurId: sud.id,
        type: 'communication',
        titre: 'Radio gué',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
        consignes: 'Canal 3.',
      });
      // Mission sans volontaire : aucun avertissement possible.
      expect(modifiee.avertissement).toBeNull();
      const relue = await sql<
        { secteur_id: string; type: string; titre: string; debut_le: Date; fin_le: Date; consignes: string | null }[]
      >`
        SELECT secteur_id, type, titre, debut_le, fin_le, consignes FROM mission WHERE id = ${mission.id}
      `;
      expect(relue[0]).toEqual({
        secteur_id: sud.id,
        type: 'communication',
        titre: 'Radio gué',
        debut_le: DEBUT_C,
        fin_le: FIN_C,
        consignes: 'Canal 3.',
      });
      const etat = await getMissionsAdminState(sessionAdmin(orgId), { store: missionsStore });
      const parSecteur = new Map(etat.secteurs.map((s) => [s.id, s.missions.map((m) => m.id)]));
      expect(parSecteur.get(nord.id)).toEqual([]);
      expect(parSecteur.get(sud.id)).toEqual([mission.id]);

      // Secteur d'une AUTRE organisation (existant, fixture propriétaire) :
      // invisible sous GUC → 404, la mission n'a pas bougé.
      const orgAutreId = randomUUID();
      const evenementAutreId = randomUUID();
      const editionAutreId = randomUUID();
      const secteurAutreId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgAutreId}, ${`org-maj-${orgAutreId.slice(0, 8)}`}, 'Autre trail')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementAutreId}, ${orgAutreId}, ${`autre-trail-${orgAutreId.slice(0, 8)}`}, 'Autre trail')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionAutreId}, ${orgAutreId}, ${evenementAutreId}, '2027', 'Autre édition',
                DATE '2027-05-01', TIMESTAMPTZ '2027-04-20T22:59:59Z')
      `;
      await sql`
        INSERT INTO secteur (id, organisation_id, edition_id, nom, lieu)
        VALUES (${secteurAutreId}, ${orgAutreId}, ${editionAutreId}, 'Secteur étranger', 'Ailleurs')
      `;
      await expect(
        updateMission(sessionAdmin(orgId), mission.id, {
          secteurId: secteurAutreId,
          type: 'communication',
          titre: 'Radio gué',
          debutLe: DEBUT_C.toISOString(),
          finLe: FIN_C.toISOString(),
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(SecteurNotFoundError);
      const inchangee = await sql<{ secteur_id: string }[]>`
        SELECT secteur_id FROM mission WHERE id = ${mission.id}
      `;
      expect(inchangee[0]?.secteur_id).toBe(sud.id);

      // Mission inconnue (UUID valide) : 404.
      await expect(
        updateMission(sessionAdmin(orgId), '00000000-0000-0000-0000-0000000000f5', {
          secteurId: sud.id,
          type: 'accueil',
          titre: 'Fantôme',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
        }, { store: missionsStore }),
      ).rejects.toBeInstanceOf(MissionNotFoundError);
    });

    it('D2 — modification d’une mission affectée créant un chevauchement : modification FAITE + avertissement par volontaire', async () => {
      const est = await createSecteur(sessionAdmin(orgId), { nom: 'Secteur D2 est', lieu: 'Source' }, {
        store: missionsStore,
      });
      const ouest = await createSecteur(sessionAdmin(orgId), { nom: 'Secteur D2 ouest', lieu: 'Moulin' }, {
        store: missionsStore,
      });
      const matin = await createMission(sessionAdmin(orgId), {
        secteurId: est.id,
        type: 'accueil',
        titre: 'Accueil source',
        debutLe: DEBUT_A.toISOString(),
        finLe: FIN_A.toISOString(),
      }, { store: missionsStore });
      const apresMidi = await createMission(sessionAdmin(orgId), {
        secteurId: ouest.id,
        type: 'securite_troncon',
        titre: 'Barrière moulin',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
      }, { store: missionsStore });
      const yanisId = await importerVolontaire('Yanis', 'yanis@exemple.dz');
      for (const missionId of [matin.id, apresMidi.id]) {
        const affectation = await affecterVolontaire(sessionAdmin(orgId), {
          missionId,
          volontaireId: yanisId,
        }, { store: missionsStore });
        expect(affectation.avertissement).toBeNull();
      }

      // L'après-midi avancée à 10 h–14 h : chevauche le matin (06 h–12 h) de
      // Yanis — même requête que l'affectation, autre secteur inclus.
      const deplacee = await updateMission(sessionAdmin(orgId), apresMidi.id, {
        secteurId: ouest.id,
        type: 'securite_troncon',
        titre: 'Barrière moulin',
        debutLe: DEBUT_B.toISOString(),
        finLe: FIN_B.toISOString(),
      }, { store: missionsStore });
      expect(deplacee.avertissement?.missions).toEqual([
        {
          missionId: matin.id,
          secteurNom: 'Secteur D2 est',
          typeLabel: 'Accueil',
          titre: 'Accueil source',
          debutLe: DEBUT_A.toISOString(),
          finLe: FIN_A.toISOString(),
          volontaireId: yanisId,
          volontaireNom: 'Yanis',
        },
      ]);
      // Jamais refusé : les nouveaux horaires sont en base, l'affectation reste.
      const relue = await sql<{ debut_le: Date; fin_le: Date }[]>`
        SELECT debut_le, fin_le FROM mission WHERE id = ${apresMidi.id}
      `;
      expect(relue[0]).toEqual({ debut_le: DEBUT_B, fin_le: FIN_B });
      const affectations = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM affectation WHERE mission_id = ${apresMidi.id}
      `;
      expect(affectations[0]?.count).toBe(1);

      // Simple renommage (horaires et secteur inchangés) : aucun avertissement
      // réveillé, même si le chevauchement existe toujours.
      const renommee = await updateMission(sessionAdmin(orgId), apresMidi.id, {
        secteurId: ouest.id,
        type: 'securite_troncon',
        titre: 'Barrière moulin (renommée)',
        debutLe: DEBUT_B.toISOString(),
        finLe: FIN_B.toISOString(),
      }, { store: missionsStore });
      expect(renommee.avertissement).toBeNull();

      // Changement de SECTEUR seul : recalcul → le conflit est de nouveau signalé.
      const changeeDeSecteur = await updateMission(sessionAdmin(orgId), apresMidi.id, {
        secteurId: est.id,
        type: 'securite_troncon',
        titre: 'Barrière moulin (renommée)',
        debutLe: DEBUT_B.toISOString(),
        finLe: FIN_B.toISOString(),
      }, { store: missionsStore });
      expect(changeeDeSecteur.avertissement?.missions.map((m) => m.missionId)).toEqual([matin.id]);

      // Retour à 13 h–15 h : plus aucun chevauchement → avertissement null.
      const recalee = await updateMission(sessionAdmin(orgId), apresMidi.id, {
        secteurId: est.id,
        type: 'securite_troncon',
        titre: 'Barrière moulin (renommée)',
        debutLe: DEBUT_C.toISOString(),
        finLe: FIN_C.toISOString(),
      }, { store: missionsStore });
      expect(recalee.avertissement).toBeNull();
    });
  },
);
