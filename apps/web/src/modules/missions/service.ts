import type { SessionRecord } from '@/modules/iam/store';

import {
  LIBELLES_COUVERTURE,
  LIBELLES_MISSION_TYPE,
  LIBELLES_STATUT_INVITATION,
  couverture,
  estUuidValide,
  hasMissionFieldErrors,
  hasSecteurFieldErrors,
  normalizeMissionInput,
  normalizeSecteurInput,
  validateMissionInput,
  validateSecteurInput,
  validerLigne,
  type Couverture,
  type LigneFichier,
  type LigneValide,
  type MissionType,
  type RapportImport,
  type RapportLigne,
  type StatutInvitation,
} from './domain';
import {
  AucuneEditionError,
  ImportFileInvalidError,
  ImportFileTooLargeError,
  InvalidAffectationError,
  InvalidMissionFieldsError,
  InvalidSecteurFieldsError,
  MissionNotFoundError,
  SecteurNotFoundError,
  VolontaireNotFoundError,
} from './errors';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LINES,
  buildModeleXlsx,
  parseImportFile,
} from './import-format';
import {
  getMissionsStore,
  type MissionRecord,
  type MissionsStore,
  type SecteurRecord,
} from './store';

// Story 3.1 — service volontaires : armer 150–200 villageois sans saisie
// manuelle. Le rapport est OBLIGATOIRE ligne par ligne (créé / ignoré / rejeté
// + raison) : jamais d'import silencieux.

export interface VolontaireSummary {
  id: string;
  nom: string;
  email: string;
  telephone: string | null;
  statutInvitation: StatutInvitation;
  statutInvitationLabel: string;
  expireLe: string | null;
  createdAt: string;
}

export interface VolontairesAdminState {
  volontaires: VolontaireSummary[];
}

export interface MissionsServiceDeps {
  store?: MissionsStore;
}

export interface ImportFileInput {
  bytes: Uint8Array;
  filename: string;
}

export async function getVolontairesAdminState(
  session: SessionRecord,
  deps: MissionsServiceDeps = {},
): Promise<VolontairesAdminState> {
  const store = deps.store ?? getMissionsStore();
  const records = await store.listVolontaires(session.organisationId);
  return {
    volontaires: records.map((record) => ({
      id: record.id,
      nom: record.nom,
      email: record.email,
      telephone: record.telephone,
      statutInvitation: record.statutInvitation,
      statutInvitationLabel: LIBELLES_STATUT_INVITATION[record.statutInvitation],
      expireLe: record.expireLe !== null ? record.expireLe.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    })),
  };
}

/** Rapport d'une ligne rejetée par validation (fichier, format, doublon, quota). */
function rejette(ligne: LigneFichier, raison: string): RapportLigne {
  return { ligne: ligne.ligne, nom: ligne.nom.trim(), email: ligne.email.trim(), statut: 'rejeté', raison };
}

/**
 * Import complet : lecture du fichier → validation ligne par ligne → dédoublonnage
 * → limite 500 lignes → transaction unique (comptes + fiches + invitations +
 * emails en file) pour les lignes valides. Les lignes au-delà de 500 sont
 * rejetées ligne par ligne (« valides importées quand même »).
 */
export async function importVolontaires(
  session: SessionRecord,
  file: ImportFileInput,
  deps: MissionsServiceDeps = {},
): Promise<RapportImport> {
  const store = deps.store ?? getMissionsStore();
  if (file.bytes.length === 0) {
    // Vide ≠ trop lourd : fichier absent/vidé par le navigateur → « vérifie le
    // fichier », pas le message 2 Mo.
    throw new ImportFileInvalidError();
  }
  if (file.bytes.length > MAX_IMPORT_BYTES) {
    throw new ImportFileTooLargeError(MAX_IMPORT_BYTES);
  }
  const lignesFichier = await parseImportFile(file.bytes, file.filename);
  if (lignesFichier.length === 0) {
    // Fichier vide / en-tête seul : aucune donnée → 400 « vérifie le fichier ».
    throw new ImportFileInvalidError();
  }

  const rejets: RapportLigne[] = [];
  const valides: LigneValide[] = [];
  const emailsDejaVus = new Set<string>();

  for (const ligne of lignesFichier) {
    // Limite de volumétrie : au-delà de 500 lignes de données, rejet ligne par
    // ligne — les 500 premières sont bien traitées.
    if (valides.length + rejets.length >= MAX_IMPORT_LINES) {
      rejets.push(rejette(ligne, `fichier limité à ${MAX_IMPORT_LINES} lignes`));
      continue;
    }
    const verdict = validerLigne(ligne);
    if (!verdict.ok) {
      rejets.push(rejette(ligne, verdict.raison));
      continue;
    }
    if (emailsDejaVus.has(verdict.valeur.email)) {
      rejets.push(rejette(ligne, 'doublon dans le fichier'));
      continue;
    }
    emailsDejaVus.add(verdict.valeur.email);
    valides.push(verdict.valeur);
  }

  const rapports: RapportLigne[] = [];
  if (valides.length > 0) {
    // Décisions dépendant de la base (déjà volontaire, autre rôle) : dans LA
    // transaction, avec les créations — tout ou rien.
    const outcomes = await store.importVolontaires({
      organisationId: session.organisationId,
      lignes: valides,
      maintenant: new Date(),
    });
    const parLigne = new Map(outcomes.map((outcome) => [outcome.ligne, outcome]));
    for (const valide of valides) {
      const outcome = parLigne.get(valide.ligne);
      if (!outcome) {
        throw new Error(`issue d’import manquante pour la ligne ${valide.ligne}`);
      }
      rapports.push({
        ligne: outcome.ligne,
        nom: valide.nom,
        email: valide.email,
        statut: outcome.statut,
        raison: outcome.raison,
      });
    }
  }

  const lignes = [...rapports, ...rejets].sort((a, b) => a.ligne - b.ligne);
  return {
    lignes,
    resume: {
      crees: lignes.filter((ligne) => ligne.statut === 'créé').length,
      ignores: lignes.filter((ligne) => ligne.statut === 'ignoré').length,
      rejetes: lignes.filter((ligne) => ligne.statut === 'rejeté').length,
      invitationsEnFile: lignes.filter((ligne) => ligne.statut === 'créé').length,
    },
  };
}

/** Renvoi manuel d'une invitation (jamais automatique au re-import). */
export async function renvoyerInvitation(
  session: SessionRecord,
  volontaireId: string,
  deps: MissionsServiceDeps = {},
): Promise<{ email: string; expireLe: string }> {
  const store = deps.store ?? getMissionsStore();
  const resultat = await store.renvoyerInvitation({
    organisationId: session.organisationId,
    volontaireId,
    maintenant: new Date(),
  });
  return { email: resultat.email, expireLe: resultat.expireLe.toISOString() };
}

/** Gabarit .xlsx téléchargeable (en-tête Nom / Email / Téléphone). */
export async function buildModeleImport(): Promise<Uint8Array> {
  return buildModeleXlsx();
}

export { VolontaireNotFoundError };

// ---------------------------------------------------------------------------
// Story 3.2 — secteurs, missions typées, affectations. La couverture est
// DÉRIVÉE des affectations (jamais stockée) et visible admin + volontaire.
// ---------------------------------------------------------------------------

export interface SecteurSummary {
  id: string;
  nom: string;
  lieu: string;
  contact: string | null;
  missions: MissionSummary[];
}

export interface MissionSummary {
  id: string;
  secteurId: string;
  type: MissionType;
  typeLabel: string;
  titre: string;
  debutLe: string;
  finLe: string;
  consignes: string | null;
  affectations: { volontaireId: string; volontaireNom: string }[];
  couverture: Couverture;
  couvertureLabel: string;
}

export interface VolontaireOption {
  id: string;
  nom: string;
}

export interface MissionsAdminState {
  edition: { id: string; nom: string } | null;
  secteurs: SecteurSummary[];
  volontaires: VolontaireOption[];
}

export interface MissionVolontaireView {
  id: string;
  secteurNom: string;
  /** Repère terrain du secteur (fiche hors-ligne 3.3) — null si secteur inconnu. */
  secteurLieu: string | null;
  /** Contact PC du secteur — null si non renseigné (bouton tel: absent). */
  secteurContact: string | null;
  type: MissionType;
  typeLabel: string;
  titre: string;
  debutLe: string;
  finLe: string;
  consignes: string | null;
  couverture: Couverture;
  couvertureLabel: string;
}

export interface MissionsVolontaireState {
  editionNom: string | null;
  /** Missions du volontaire connecté (via account → volontaire). */
  mesMissions: MissionVolontaireView[];
  /** Toutes les missions de l'édition avec leur couverture dérivée. */
  missions: MissionVolontaireView[];
}

function toMissionSummary(
  mission: MissionRecord,
  affectations: { volontaireId: string; volontaireNom: string }[],
): MissionSummary {
  const etat = couverture(affectations.length);
  return {
    id: mission.id,
    secteurId: mission.secteurId,
    type: mission.type,
    typeLabel: LIBELLES_MISSION_TYPE[mission.type],
    titre: mission.titre,
    debutLe: mission.debutLe.toISOString(),
    finLe: mission.finLe.toISOString(),
    consignes: mission.consignes,
    affectations,
    couverture: etat,
    couvertureLabel: LIBELLES_COUVERTURE[etat],
  };
}

export async function getMissionsAdminState(
  session: SessionRecord,
  deps: MissionsServiceDeps = {},
): Promise<MissionsAdminState> {
  const store = deps.store ?? getMissionsStore();
  const [edition, volontaires] = await Promise.all([
    store.findCurrentEdition(session.organisationId),
    store.listVolontaires(session.organisationId),
  ]);
  if (edition === null) {
    return { edition: null, secteurs: [], volontaires: volontaires.map((v) => ({ id: v.id, nom: v.nom })) };
  }
  const etat = await store.listMissionsEtat(session.organisationId, edition.id);
  const affectationsParMission = new Map<string, { volontaireId: string; volontaireNom: string }[]>();
  for (const affectation of etat.affectations) {
    const liste = affectationsParMission.get(affectation.missionId) ?? [];
    liste.push({ volontaireId: affectation.volontaireId, volontaireNom: affectation.volontaireNom });
    affectationsParMission.set(affectation.missionId, liste);
  }
  const secteurs: SecteurSummary[] = etat.secteurs.map((secteur) => ({
    id: secteur.id,
    nom: secteur.nom,
    lieu: secteur.lieu,
    contact: secteur.contact,
    missions: [],
  }));
  const summaries = new Map(secteurs.map((secteur) => [secteur.id, secteur]));
  for (const mission of etat.missions) {
    const secteur = summaries.get(mission.secteurId);
    if (secteur) {
      secteur.missions.push(
        toMissionSummary(mission, affectationsParMission.get(mission.id) ?? []),
      );
    }
  }
  return {
    edition: { id: edition.id, nom: edition.nom },
    secteurs,
    volontaires: volontaires.map((v) => ({ id: v.id, nom: v.nom })),
  };
}

export async function getMissionsVolontaireState(
  session: SessionRecord,
  deps: MissionsServiceDeps = {},
): Promise<MissionsVolontaireState> {
  const store = deps.store ?? getMissionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (edition === null) {
    return { editionNom: null, mesMissions: [], missions: [] };
  }
  const [etat, volontaireId] = await Promise.all([
    store.listMissionsEtat(session.organisationId, edition.id),
    store.findVolontaireIdByAccount(session.organisationId, session.accountId),
  ]);
  const secteurParId = new Map(etat.secteurs.map((secteur) => [secteur.id, secteur]));
  const affectationsParMission = new Map<string, { volontaireId: string; volontaireNom: string }[]>();
  for (const affectation of etat.affectations) {
    const liste = affectationsParMission.get(affectation.missionId) ?? [];
    liste.push({ volontaireId: affectation.volontaireId, volontaireNom: affectation.volontaireNom });
    affectationsParMission.set(affectation.missionId, liste);
  }
  const mesIds = new Set<string>();
  if (volontaireId !== null) {
    for (const affectation of etat.affectations) {
      if (affectation.volontaireId === volontaireId) {
        mesIds.add(affectation.missionId);
      }
    }
  }
  const toView = (mission: MissionRecord): MissionVolontaireView => {
    const secteur = secteurParId.get(mission.secteurId);
    const etatCouverture = couverture((affectationsParMission.get(mission.id) ?? []).length);
    return {
      id: mission.id,
      secteurNom: secteur?.nom ?? '—',
      secteurLieu: secteur?.lieu ?? null,
      secteurContact: secteur?.contact ?? null,
      type: mission.type,
      typeLabel: LIBELLES_MISSION_TYPE[mission.type],
      titre: mission.titre,
      debutLe: mission.debutLe.toISOString(),
      finLe: mission.finLe.toISOString(),
      consignes: mission.consignes,
      couverture: etatCouverture,
      couvertureLabel: LIBELLES_COUVERTURE[etatCouverture],
    };
  };
  return {
    editionNom: edition.nom,
    mesMissions: etat.missions.filter((mission) => mesIds.has(mission.id)).map(toView),
    missions: etat.missions.map(toView),
  };
}

async function editionCouranteOuErreur(
  store: MissionsStore,
  organisationId: string,
): Promise<{ id: string; nom: string }> {
  const edition = await store.findCurrentEdition(organisationId);
  if (edition === null) {
    throw new AucuneEditionError();
  }
  return edition;
}

function assertSecteurValide(input: ReturnType<typeof normalizeSecteurInput>): void {
  const errors = validateSecteurInput(input);
  if (hasSecteurFieldErrors(errors)) {
    throw new InvalidSecteurFieldsError(errors);
  }
}

export async function createSecteur(
  session: SessionRecord,
  rawInput: unknown,
  deps: MissionsServiceDeps = {},
): Promise<SecteurSummary> {
  const store = deps.store ?? getMissionsStore();
  const input = normalizeSecteurInput(rawInput);
  assertSecteurValide(input);
  const edition = await editionCouranteOuErreur(store, session.organisationId);
  const record = await store.createSecteur({
    organisationId: session.organisationId,
    editionId: edition.id,
    nom: input.nom,
    lieu: input.lieu,
    contact: input.contact,
  });
  return { id: record.id, nom: record.nom, lieu: record.lieu, contact: record.contact, missions: [] };
}

export async function updateSecteur(
  session: SessionRecord,
  secteurId: string,
  rawInput: unknown,
  deps: MissionsServiceDeps = {},
): Promise<SecteurSummary> {
  const store = deps.store ?? getMissionsStore();
  // Garde UUID : un id de chemin non-UUID provoquerait une 22P02 postgres (500).
  if (!estUuidValide(secteurId)) {
    throw new SecteurNotFoundError();
  }
  const input = normalizeSecteurInput(rawInput);
  assertSecteurValide(input);
  const record = await store.updateSecteur(secteurId, {
    organisationId: session.organisationId,
    nom: input.nom,
    lieu: input.lieu,
    contact: input.contact,
  });
  if (record === null) {
    throw new SecteurNotFoundError();
  }
  return { id: record.id, nom: record.nom, lieu: record.lieu, contact: record.contact, missions: [] };
}

export async function deleteSecteur(
  session: SessionRecord,
  secteurId: string,
  deps: MissionsServiceDeps = {},
): Promise<{ ok: true }> {
  const store = deps.store ?? getMissionsStore();
  if (!estUuidValide(secteurId)) {
    throw new SecteurNotFoundError();
  }
  const supprime = await store.deleteSecteur(secteurId, session.organisationId);
  if (!supprime) {
    throw new SecteurNotFoundError();
  }
  return { ok: true };
}

function missionVersStoreInput(input: ReturnType<typeof normalizeMissionInput>) {
  return {
    type: input.type as MissionType,
    titre: input.titre,
    secteurId: input.secteurId,
    debutLe: new Date(input.debutLe),
    finLe: new Date(input.finLe),
    consignes: input.consignes,
  };
}

function assertMissionValide(input: ReturnType<typeof normalizeMissionInput>): void {
  const errors = validateMissionInput(input);
  if (hasMissionFieldErrors(errors)) {
    throw new InvalidMissionFieldsError(errors);
  }
}

function assertSecteurMissionUuid(input: ReturnType<typeof normalizeMissionInput>): void {
  // Garde UUID : un secteurId non-UUID en corps provoquerait une 22P02 (500).
  if (!estUuidValide(input.secteurId)) {
    throw new SecteurNotFoundError();
  }
}

export async function createMission(
  session: SessionRecord,
  rawInput: unknown,
  deps: MissionsServiceDeps = {},
): Promise<MissionSummary> {
  const store = deps.store ?? getMissionsStore();
  const input = normalizeMissionInput(rawInput);
  assertMissionValide(input);
  assertSecteurMissionUuid(input);
  const record = await store.createMission({
    organisationId: session.organisationId,
    ...missionVersStoreInput(input),
  });
  return toMissionSummary(record, []);
}

export async function updateMission(
  session: SessionRecord,
  missionId: string,
  rawInput: unknown,
  deps: MissionsServiceDeps = {},
): Promise<MissionSummary> {
  const store = deps.store ?? getMissionsStore();
  if (!estUuidValide(missionId)) {
    throw new MissionNotFoundError();
  }
  const input = normalizeMissionInput(rawInput);
  assertMissionValide(input);
  assertSecteurMissionUuid(input);
  const record = await store.updateMission(missionId, {
    organisationId: session.organisationId,
    ...missionVersStoreInput(input),
  });
  if (record === null) {
    throw new MissionNotFoundError();
  }
  return toMissionSummary(record, []);
}

export async function deleteMission(
  session: SessionRecord,
  missionId: string,
  deps: MissionsServiceDeps = {},
): Promise<{ ok: true }> {
  const store = deps.store ?? getMissionsStore();
  if (!estUuidValide(missionId)) {
    throw new MissionNotFoundError();
  }
  const supprime = await store.deleteMission(missionId, session.organisationId);
  if (!supprime) {
    throw new MissionNotFoundError();
  }
  return { ok: true };
}

/** Mission en conflit horaire, prête à afficher dans l'avertissement. */
export interface ConflitAffectation {
  missionId: string;
  secteurNom: string;
  typeLabel: string;
  titre: string;
  debutLe: string;
  finLe: string;
}

export interface AffectationResultat {
  ok: true;
  /** false = doublon ignoré proprement (UNIQUE), jamais une erreur. */
  cree: boolean;
  /** Chevauchement détecté : AVERTISSEMENT informatif, l'affectation existe. */
  avertissement: { missions: ConflitAffectation[] } | null;
}

/** Ids du corps d'affectation : UUID canonique exigé (sinon 22P02 postgres → 500). */
function identifiantOuErreur(valeur: unknown): string {
  if (typeof valeur !== 'string' || !estUuidValide(valeur.trim())) {
    throw new InvalidAffectationError();
  }
  return valeur.trim();
}

export async function affecterVolontaire(
  session: SessionRecord,
  rawInput: unknown,
  deps: MissionsServiceDeps = {},
): Promise<AffectationResultat> {
  const store = deps.store ?? getMissionsStore();
  const record =
    typeof rawInput === 'object' && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
  const missionId = identifiantOuErreur(record.missionId);
  const volontaireId = identifiantOuErreur(record.volontaireId);
  const resultat = await store.affecter({
    organisationId: session.organisationId,
    missionId,
    volontaireId,
  });
  return {
    ok: true,
    cree: resultat.cree,
    avertissement:
      resultat.conflits.length > 0
        ? {
            missions: resultat.conflits.map((conflit) => ({
              missionId: conflit.missionId,
              secteurNom: conflit.secteurNom,
              typeLabel: LIBELLES_MISSION_TYPE[conflit.type],
              titre: conflit.titre,
              debutLe: conflit.debutLe.toISOString(),
              finLe: conflit.finLe.toISOString(),
            })),
          }
        : null,
  };
}

/** Désaffectation idempotente : false si l'affectation n'existait déjà plus. */
export async function desaffecterVolontaire(
  session: SessionRecord,
  rawInput: unknown,
  deps: MissionsServiceDeps = {},
): Promise<{ ok: true; supprime: boolean }> {
  const store = deps.store ?? getMissionsStore();
  const record =
    typeof rawInput === 'object' && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
  const missionId = identifiantOuErreur(record.missionId);
  const volontaireId = identifiantOuErreur(record.volontaireId);
  const supprime = await store.desaffecter({
    organisationId: session.organisationId,
    missionId,
    volontaireId,
  });
  return { ok: true, supprime };
}

export {
  InvalidAffectationError,
  InvalidMissionFieldsError,
  InvalidSecteurFieldsError,
  MissionNotFoundError,
  SecteurNotFoundError,
};
