import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import { importVolontaires } from './service';
import {
  AucuneEditionError,
  InvalidMissionFieldsError,
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
      ).rejects.toThrow();

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
  },
);
