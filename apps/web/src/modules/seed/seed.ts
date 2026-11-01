import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { findOrganisationIdBySlug, withOrg } from '@/db/org-scope';
import { createChronoStore } from '@/modules/chrono/store';
import { COUREUR_STATUS_EN_CONSTITUTION } from '@/modules/inscriptions/domain';
import { LocalDiskProofStore, getProofStore, type ProofStore } from '@/modules/inscriptions/proof-store';
import { uploadPreuve } from '@/modules/inscriptions/proof-service';
import {
  acceptDocuments,
  attribuerDossards,
  decideDossier,
  obtenirEdossard,
  submitInscription,
} from '@/modules/inscriptions/service';
import { createInscriptionsStore, type InscriptionsStore } from '@/modules/inscriptions/store';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { readDatabaseUrl } from '@/modules/iam/env';
import type { SessionRecord } from '@/modules/iam/store';
import { createMissionsStore, type MissionsStore } from '@/modules/missions/store';

import {
  AFFECTATIONS_FICTIVES,
  APPAREIL_FICTIF,
  COUREURS_FICTIFS,
  HEURES_DEPART_FICTIVES,
  ORGANISATEUR_FICTIF,
  PLAN_TERRAIN,
  SECTEURS_FICTIFS,
  SEED_EMAIL_SUFFIXE,
  TAILLE_PREUVE_OCTETS,
  VOLONTAIRES_FICTIFS,
  contactUrgenceCoureur,
  emailCoureur,
  emailVolontaire,
  telephoneCoureur,
  type Checkpoint,
} from './donnees';

/**
 * Story 8.3 — seed « édition complète ».
 *
 * Le seed est un CONSOMMATEUR de l'existant : il passe par les services métier
 * (`submitInscription` → `uploadPreuve` → `acceptDocuments` → `decideDossier`
 * → `obtenirEdossard` → `attribuerDossards`) et par les stores, jamais par des
 * `INSERT` directs sur `coureur`. Le schéma porte des contraintes couplées —
 * les quatre colonnes d'acceptation posées ensemble ou pas du tout, motif de
 * refus obligatoire si et seulement si `status = 'refusé'`, preuve active
 * unique par coureur — qu'un seed en SQL brut violerait ou contournerait en
 * silence.
 *
 * Écritures scopées par `withOrg` : sous `azzel_app`, avec le GUC
 * `app.organisation_id` posé dans la transaction (AD-4 intact).
 *
 * Idempotence par identité stable : chaque compte fictif est reconnaissable à
 * son email. Une seconde exécution relit l'état réel de chaque dossier et ne
 * rejoue que les étapes manquantes.
 */

/** Migrations non appliquées : échec explicite, jamais une 42P01 brute. */
export class MigrationsManquantesError extends Error {
  constructor(tablesManquantes: string[]) {
    super(
      `Schéma incomplet (table(s) absente(s) : ${tablesManquantes.join(', ')}) : ` +
        'exécute d’abord pnpm -F @azzel/web db:migrate.',
    );
    this.name = 'MigrationsManquantesError';
  }
}

export class OrganisationManquanteError extends Error {
  constructor(slug: string) {
    super(
      `Organisation « ${slug} » absente : exécute d’abord pnpm -F @azzel/web db:migrate.`,
    );
    this.name = 'OrganisationManquanteError';
  }
}

export interface SeedRapport {
  coureursCrees: number;
  coureursDejaPresents: number;
  dossiersValides: number;
  dossiersRefuses: number;
  volontairesCrees: number;
  secteursCrees: number;
  missionsCreees: number;
  affectationsCreees: number;
  dossardsAttribues: number;
  evenementsTerrainCrees: number;
  emailsNeutralises: number;
  avertissements: string[];
}

function rapportVide(): SeedRapport {
  return {
    coureursCrees: 0,
    coureursDejaPresents: 0,
    dossiersValides: 0,
    dossiersRefuses: 0,
    volontairesCrees: 0,
    secteursCrees: 0,
    missionsCreees: 0,
    affectationsCreees: 0,
    dossardsAttribues: 0,
    evenementsTerrainCrees: 0,
    emailsNeutralises: 0,
    avertissements: [],
  };
}

/** Vrai si le seed n'a rien eu à créer (seconde exécution sur base déjà peuplée). */
export function rienACreer(rapport: SeedRapport): boolean {
  return (
    rapport.coureursCrees === 0 &&
    rapport.volontairesCrees === 0 &&
    rapport.secteursCrees === 0 &&
    rapport.missionsCreees === 0 &&
    rapport.affectationsCreees === 0 &&
    rapport.dossardsAttribues === 0 &&
    rapport.evenementsTerrainCrees === 0
  );
}

/** Tables dont l'absence signe des migrations non appliquées. */
const TABLES_REQUISES = [
  'organisation',
  'account',
  'edition',
  'epreuve',
  'coureur',
  'preuve',
  'email_outbox',
  'volontaire',
  'secteur',
  'mission',
  'affectation',
  'terrain_evenement',
] as const;

async function verifierSchema(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ nom: string; presente: boolean }[]>`
    SELECT t.nom, to_regclass('public.' || t.nom) IS NOT NULL AS presente
    FROM unnest(${[...TABLES_REQUISES]}::text[]) AS t(nom)
  `;
  const manquantes = rows.filter((row) => !row.presente).map((row) => row.nom);
  if (manquantes.length > 0) {
    throw new MigrationsManquantesError(manquantes);
  }
}

/** JPEG minimal valide (en-tête JFIF + remplissage) — cohérent avec detectProofFormat. */
export function octetsPreuveFictive(taille = TAILLE_PREUVE_OCTETS): Uint8Array {
  const bytes = new Uint8Array(taille);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

/**
 * Compte fictif retrouvé par email (identité stable) ou créé. Le rôle n'est
 * jamais réécrit : un compte existant garde le sien.
 */
async function assurerCompte(
  sql: postgres.Sql,
  organisationId: string,
  email: string,
  role: 'coureur' | 'organisateur',
): Promise<{ id: string; cree: boolean }> {
  return withOrg(sql, organisationId, async (tx) => {
    const existants = await tx<{ id: string }[]>`
      SELECT id FROM account
      WHERE organisation_id = ${organisationId} AND email = ${email}
      LIMIT 1
    `;
    const existant = existants[0];
    if (existant) {
      return { id: existant.id, cree: false };
    }
    const crees = await tx<{ id: string }[]>`
      INSERT INTO account (organisation_id, email, role)
      VALUES (${organisationId}, ${email}, ${role})
      RETURNING id
    `;
    const cree = crees[0];
    if (!cree) {
      throw new Error(`création du compte fictif « ${email} » sans résultat`);
    }
    return { id: cree.id, cree: true };
  });
}

function session(
  organisationId: string,
  accountId: string,
  email: string,
  role: 'coureur' | 'organisateur',
): SessionRecord {
  return { accountId, organisationId, email, role, createdAt: new Date() };
}

/** Horodatage UTC « HH:MM » posé sur le jour de la course de l'édition. */
export function horodatageJourCourse(dateCourse: string, heure: string): Date {
  return new Date(`${dateCourse}T${heure}:00.000Z`);
}

function minutesApres(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export interface SeedDeps {
  sql: postgres.Sql;
  proofStore?: ProofStore;
  store?: InscriptionsStore;
  missionsStore?: MissionsStore;
}

export async function executerSeed(deps: SeedDeps): Promise<SeedRapport> {
  const { sql } = deps;
  const rapport = rapportVide();

  await verifierSchema(sql);

  const organisationId = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
  if (organisationId === null) {
    throw new OrganisationManquanteError(DEFAULT_ORGANISATION_SLUG);
  }

  const store = deps.store ?? createInscriptionsStore(sql);
  const missionsStore = deps.missionsStore ?? createMissionsStore(sql);
  const chronoStore = createChronoStore(sql);
  const proofStore = deps.proofStore ?? getProofStore();

  // Dépendance ASSUMÉE à la story 8.2 : tant que `SupabaseProofStore` n'existe
  // pas, `getProofStore()` sert le disque local. En hébergé, les preuves
  // déposées par le seed disparaissent au redémarrage — le script le dit au
  // lieu de laisser le comité découvrir des écrans de validation vides.
  if (proofStore instanceof LocalDiskProofStore) {
    rapport.avertissements.push(
      'Stockage des preuves sur DISQUE LOCAL (story 8.2 non livrée) : en environnement ' +
        'hébergé, les preuves déposées par le seed seront perdues au prochain redémarrage.',
    );
  }

  // Les services déclenchent l'envoi best effort de la file d'emails après
  // chaque événement. Cinquante coureurs fictifs, ce sont autant de rebonds
  // potentiels : le worker n'est JAMAIS réveillé par le seed.
  const sansOutbox = { store, triggerOutbox: async () => undefined };

  const edition = await store.findCurrentEdition(organisationId);
  if (!edition) {
    throw new OrganisationManquanteError(DEFAULT_ORGANISATION_SLUG);
  }
  const epreuves = await store.listEpreuves(edition.id, organisationId);
  const epreuveParSlug = new Map(epreuves.map((epreuve) => [epreuve.slug, epreuve]));

  // ———————————————————————————————— coureurs ————————————————————————————————

  const organisateurCompte = await assurerCompte(
    sql,
    organisationId,
    ORGANISATEUR_FICTIF.email,
    'organisateur',
  );
  const organisateur = session(
    organisationId,
    organisateurCompte.id,
    ORGANISATEUR_FICTIF.email,
    'organisateur',
  );

  /** Jetons e-dossard des validés, dans l'ordre de la table fictive. */
  const jetonsValides: string[] = [];

  for (const [index, coureur] of COUREURS_FICTIFS.entries()) {
    const epreuve = epreuveParSlug.get(coureur.epreuve);
    if (!epreuve) {
      rapport.avertissements.push(
        `Épreuve « ${coureur.epreuve} » absente de l'édition : coureur ${coureur.cle} ignoré.`,
      );
      continue;
    }
    const email = emailCoureur(coureur.cle);
    const compte = await assurerCompte(sql, organisationId, email, 'coureur');
    const coureurSession = session(organisationId, compte.id, email, 'coureur');

    let dossier = await store.findCoureurByAccount(compte.id, edition.id, organisationId);
    if (dossier === null) {
      const urgence = contactUrgenceCoureur(coureur, index);
      await submitInscription(
        coureurSession,
        {
          epreuve: coureur.epreuve,
          prenom: coureur.prenom,
          nom: coureur.nom,
          telephone: telephoneCoureur(index),
          contactUrgenceNom: urgence.nom,
          contactUrgenceTelephone: urgence.telephone,
          dateNaissance: coureur.dateNaissance,
          tailleTshirt: coureur.tailleTshirt,
        },
        sansOutbox,
      );
      dossier = await store.findCoureurByAccount(compte.id, edition.id, organisationId);
      rapport.coureursCrees += 1;
    } else {
      rapport.coureursDejaPresents += 1;
    }
    if (dossier === null) {
      throw new Error(`coureur fictif ${coureur.cle} introuvable après inscription`);
    }

    if (coureur.stade === 'inscription seule') {
      continue;
    }

    // Preuve de paiement : une seule active par coureur (index unique partiel).
    const preuve = await store.findActivePreuveByAccount(compte.id, edition.id, organisationId);
    if (preuve === null) {
      await uploadPreuve(coureurSession, octetsPreuveFictive(), { store, proofStore });
    }

    if (dossier.dechargeAcceptedAt === null || dossier.reglementAcceptedAt === null) {
      await acceptDocuments(coureurSession, { decharge: true, reglement: true }, sansOutbox);
    }

    if (coureur.stade === 'dossier complet') {
      continue;
    }

    if (dossier.status === COUREUR_STATUS_EN_CONSTITUTION) {
      await decideDossier(
        organisateur,
        dossier.id,
        coureur.stade === 'validé'
          ? { decision: 'valider' }
          : { decision: 'refuser', motif: coureur.motifRefus },
        sansOutbox,
      );
      if (coureur.stade === 'validé') {
        rapport.dossiersValides += 1;
      } else {
        rapport.dossiersRefuses += 1;
      }
    }

    if (coureur.stade === 'validé') {
      // Création paresseuse du jeton, exactement comme la première consultation
      // de l'e-dossard par le coureur — jamais régénéré ensuite.
      const edossard = await obtenirEdossard(coureurSession, sansOutbox);
      if (edossard !== null) {
        jetonsValides.push(edossard.jeton);
      }
    }
  }

  const attribution = await attribuerDossards(organisateur, sansOutbox);
  rapport.dossardsAttribues = attribution.attribues;

  // ———————————————————— heures de départ échelonnées ————————————————————

  const heures = (Object.entries(HEURES_DEPART_FICTIVES) as ['longue' | 'moyenne', string][])
    .map(([slug, heure]) => {
      const epreuve = epreuveParSlug.get(slug);
      return epreuve
        ? { epreuveId: epreuve.id, heureDepart: horodatageJourCourse(edition.dateCourse, heure) }
        : null;
    })
    .filter((ligne): ligne is { epreuveId: string; heureDepart: Date } => ligne !== null);
  if (heures.length > 0) {
    await chronoStore.enregistrerHeuresDepart({ organisationId, heures });
  }

  // ———————————————————————————— volontaires ————————————————————————————

  const volontairesAvant = await missionsStore.listVolontaires(organisationId);
  const dejaVolontaires = new Set(volontairesAvant.map((volontaire) => volontaire.email));
  const aImporter = VOLONTAIRES_FICTIFS.filter(
    (volontaire) => !dejaVolontaires.has(emailVolontaire(volontaire.cle)),
  ).map((volontaire, rang) => ({
    ligne: rang + 1,
    nom: volontaire.nom,
    email: emailVolontaire(volontaire.cle),
    telephone: volontaire.telephone,
  }));
  if (aImporter.length > 0) {
    const issues = await missionsStore.importVolontaires({ organisationId, lignes: aImporter });
    rapport.volontairesCrees = issues.filter((issue) => issue.statut === 'créé').length;
    for (const rejet of issues.filter((issue) => issue.statut === 'rejeté')) {
      rapport.avertissements.push(
        `Volontaire ${rejet.email} non importé : ${rejet.raison ?? 'raison inconnue'}.`,
      );
    }
  }
  const volontaires = await missionsStore.listVolontaires(organisationId);
  const volontaireIdParEmail = new Map(
    volontaires.map((volontaire) => [volontaire.email, volontaire.id]),
  );

  // ———————————————————— secteurs, missions, affectations ————————————————————

  let etat = await missionsStore.listMissionsEtat(organisationId, edition.id);
  const secteurIdParNom = new Map(etat.secteurs.map((secteur) => [secteur.nom, secteur.id]));

  for (const secteur of SECTEURS_FICTIFS) {
    if (!secteurIdParNom.has(secteur.nom)) {
      const cree = await missionsStore.createSecteur({
        organisationId,
        editionId: edition.id,
        nom: secteur.nom,
        lieu: secteur.lieu,
        contact: secteur.contact,
      });
      secteurIdParNom.set(secteur.nom, cree.id);
      rapport.secteursCrees += 1;
    }
  }

  const missionsExistantes = new Set(etat.missions.map((mission) => `${mission.secteurId}|${mission.titre}`));
  for (const secteur of SECTEURS_FICTIFS) {
    const secteurId = secteurIdParNom.get(secteur.nom);
    if (secteurId === undefined) {
      continue;
    }
    for (const mission of secteur.missions) {
      if (missionsExistantes.has(`${secteurId}|${mission.titre}`)) {
        continue;
      }
      await missionsStore.createMission({
        organisationId,
        secteurId,
        type: mission.type,
        titre: mission.titre,
        debutLe: horodatageJourCourse(edition.dateCourse, mission.debut),
        finLe: horodatageJourCourse(edition.dateCourse, mission.fin),
        consignes: mission.consignes,
        estArrivee: mission.estArrivee,
        barriereLe:
          mission.barriere !== null
            ? horodatageJourCourse(edition.dateCourse, mission.barriere)
            : null,
      });
      rapport.missionsCreees += 1;
    }
  }

  etat = await missionsStore.listMissionsEtat(organisationId, edition.id);
  const missionIdParTitre = new Map(etat.missions.map((mission) => [mission.titre, mission.id]));

  for (const affectation of AFFECTATIONS_FICTIVES) {
    const missionId = missionIdParTitre.get(affectation.mission);
    if (missionId === undefined) {
      continue;
    }
    for (const cle of affectation.volontaires) {
      const volontaireId = volontaireIdParEmail.get(emailVolontaire(cle));
      if (volontaireId === undefined) {
        continue;
      }
      // UNIQUE (mission_id, volontaire_id) : le doublon est un no-op signalé.
      const resultat = await missionsStore.affecter({ organisationId, missionId, volontaireId });
      if (resultat.cree) {
        rapport.affectationsCreees += 1;
      }
    }
  }

  // ———————————————————————— événements terrain ————————————————————————

  const missionIdParCheckpoint = new Map<Checkpoint, string>();
  for (const secteur of SECTEURS_FICTIFS) {
    for (const mission of secteur.missions) {
      if (mission.checkpoint !== null) {
        const missionId = missionIdParTitre.get(mission.titre);
        if (missionId !== undefined) {
          missionIdParCheckpoint.set(mission.checkpoint, missionId);
        }
      }
    }
  }

  rapport.evenementsTerrainCrees = await semerEvenementsTerrain({
    sql,
    organisationId,
    editionId: edition.id,
    dateCourse: edition.dateCourse,
    jetons: jetonsValides,
    missionIdParCheckpoint,
  });

  // ———————————————————— neutralisation des emails ————————————————————

  rapport.emailsNeutralises = await neutraliserEmailsDuSeed(sql, organisationId);

  return rapport;
}

/**
 * Événements terrain append-only : retraits de dossard puis passages aux deux
 * checkpoints et à l'arrivée. `cle_idempotence` est dérivée de la clé stable du
 * coureur fictif : le rejeu est un no-op (`ON CONFLICT DO NOTHING`).
 *
 * `horodatage_reception` est posé EXPLICITEMENT sur l'heure simulée : la valeur
 * par défaut (`now()`) donnerait des temps de classement absurdes, la course
 * fictive étant datée dans le futur.
 */
async function semerEvenementsTerrain(input: {
  sql: postgres.Sql;
  organisationId: string;
  editionId: string;
  dateCourse: string;
  jetons: string[];
  missionIdParCheckpoint: Map<Checkpoint, string>;
}): Promise<number> {
  const { sql, organisationId, editionId, dateCourse, jetons, missionIdParCheckpoint } = input;
  if (jetons.length === 0) {
    return 0;
  }

  interface Lot {
    type: 'retrait' | 'passage';
    reference: string;
    checkpoint: Checkpoint | null;
    coureurs: number;
    premiereHeure: string;
    intervalleMinutes: number;
  }
  const lots: Lot[] = [
    { type: 'retrait', reference: 'retrait', checkpoint: null, ...PLAN_TERRAIN.retrait },
    { type: 'passage', reference: 'cp1', checkpoint: 'cp1', ...PLAN_TERRAIN.cp1 },
    { type: 'passage', reference: 'cp2', checkpoint: 'cp2', ...PLAN_TERRAIN.cp2 },
    { type: 'passage', reference: 'arrivee', checkpoint: 'arrivee', ...PLAN_TERRAIN.arrivee },
  ];

  let crees = 0;
  for (const lot of lots) {
    const checkpointId = lot.checkpoint !== null ? missionIdParCheckpoint.get(lot.checkpoint) : null;
    // CHECK SQL : checkpoint_id non nul si et seulement si type = 'passage'.
    if (lot.type === 'passage' && (checkpointId === undefined || checkpointId === null)) {
      continue;
    }
    const base = horodatageJourCourse(dateCourse, lot.premiereHeure);
    const cibles = jetons.slice(0, lot.coureurs);
    for (const [rang, jeton] of cibles.entries()) {
      const horodatage = minutesApres(base, rang * lot.intervalleMinutes);
      const cle = `seed:${lot.reference}:${jeton}`;
      const inseres = await withOrg(sql, organisationId, async (tx) =>
        tx<{ id: string }[]>`
          INSERT INTO terrain_evenement (
            organisation_id, cle_idempotence, type, edition_id, jeton_coureur,
            checkpoint_id, horodatage_appareil, horodatage_reception,
            offset_estime_ms, appareil_id
          )
          VALUES (
            ${organisationId}, ${cle}, ${lot.type}, ${editionId}, ${jeton},
            ${checkpointId ?? null}, ${horodatage}, ${horodatage},
            0, ${APPAREIL_FICTIF}
          )
          ON CONFLICT (cle_idempotence) DO NOTHING
          RETURNING id
        `,
      );
      if (inseres.length > 0) {
        crees += 1;
      }
    }
  }
  return crees;
}

/**
 * Aucune ligne produite par le seed ne doit être expédiable. Les services
 * empilent `inscription_recue`, `dossier_valide`, `dossier_refuse` et
 * `invitation_volontaire` dans `email_outbox` ; toutes partent vers des
 * adresses inventées. Le statut `cancelled` (migration 0019) est le seul que
 * le worker ne revendique jamais.
 *
 * Le filtre porte sur le domaine réservé des adresses fictives : les emails
 * destinés au comité (adresses réelles) ne sont JAMAIS touchés.
 */
export async function neutraliserEmailsDuSeed(
  sql: postgres.Sql,
  organisationId: string,
): Promise<number> {
  return withOrg(sql, organisationId, async (tx) => {
    const lignes = await tx<{ id: string }[]>`
      UPDATE email_outbox
      SET statut = 'cancelled'
      WHERE organisation_id = ${organisationId}
        AND statut IN ('pending', 'sending', 'failed')
        AND destinataire LIKE ${`%${SEED_EMAIL_SUFFIXE}`}
      RETURNING id
    `;
    return lignes.length;
  });
}

/** Lignes du seed encore expédiables — 0 attendu après chaque exécution. */
export async function compterEmailsExpediables(
  sql: postgres.Sql,
  organisationId: string,
): Promise<number> {
  return withOrg(sql, organisationId, async (tx) => {
    const rows = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM email_outbox
      WHERE organisation_id = ${organisationId}
        AND statut IN ('pending', 'sending', 'failed')
        AND destinataire LIKE ${`%${SEED_EMAIL_SUFFIXE}`}
    `;
    return rows[0]?.total ?? 0;
  });
}

function decrireRapport(rapport: SeedRapport): string[] {
  if (rienACreer(rapport)) {
    return [
      `Jeu de données déjà en place : rien à créer (${rapport.coureursDejaPresents} coureur(s) fictif(s) retrouvé(s)).`,
    ];
  }
  return [
    `Coureurs fictifs : ${rapport.coureursCrees} créé(s), ${rapport.coureursDejaPresents} déjà présent(s).`,
    `Dossiers décidés : ${rapport.dossiersValides} validé(s), ${rapport.dossiersRefuses} refusé(s).`,
    `Dossards attribués : ${rapport.dossardsAttribues}.`,
    `Volontaires : ${rapport.volontairesCrees} créé(s).`,
    `Terrain : ${rapport.secteursCrees} secteur(s), ${rapport.missionsCreees} mission(s), ${rapport.affectationsCreees} affectation(s).`,
    `Événements de course : ${rapport.evenementsTerrainCrees} enregistré(s).`,
  ];
}

export async function executerSeedCli(): Promise<void> {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    console.error('DATABASE_URL absente : définis-la dans .env (voir .env.example).');
    process.exitCode = 1;
    return;
  }
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  try {
    const rapport = await executerSeed({ sql });
    for (const ligne of decrireRapport(rapport)) {
      console.info(ligne);
    }
    console.info(
      `File d’envoi : ${rapport.emailsNeutralises} email(s) du seed neutralisé(s) (statut « cancelled »).`,
    );
    for (const avertissement of rapport.avertissements) {
      console.warn(`Avertissement : ${avertissement}`);
    }
  } catch (error) {
    if (error instanceof MigrationsManquantesError || error instanceof OrganisationManquanteError) {
      console.error(error.message);
    } else {
      console.error('Seed échoué :', error);
    }
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly = (() => {
  if (typeof process.argv[1] !== 'string') {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  void executerSeedCli().catch((error) => {
    console.error('seed a échoué :', error);
    process.exitCode = 1;
  });
}
