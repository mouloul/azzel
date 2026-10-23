// Story 3.1 — domaine volontaires : validation ligne à ligne du fichier importé.
// Les rejets sont des DÉCISIONS de validation (rapport ligne par ligne), pas des
// erreurs : jamais d'import silencieux (EXPERIENCE.md).
//
// Story 3.2 — secteurs et missions typées : types fermés, couverture dérivée,
// chevauchement d'horaires (avertissement, jamais bloquant), validation des
// formulaires admin.
//
// Ce module est importé côté CLIENT (manager admin) : AUCUNE dépendance serveur
// (exceljs, postgres, node:crypto) — la règle email est réimplémentée localement
// à l'identique de iam/service (≤ 254 + forme local@domaine.tld).

export function normaliserEmail(valeur: string): string {
  return valeur.trim().toLowerCase();
}

export function estEmailValide(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const MAX_NOM_LENGTH = 120;

export const MAX_EMAIL_LENGTH = 254;

export const MAX_TELEPHONE_LENGTH = 32;

// Bornes d'import (constantes SANS exceljs : le domaine est importable côté
// client, import-format ne l'est pas — exceljs reste serveur uniquement).
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const MAX_IMPORT_LINES = 500;

export const IMPORT_ACCEPT_ATTRIBUTE = '.xlsx,.csv';

// Téléphone facultatif : vide accepté ; sinon chiffres, + en tête, espaces,
// points ou tirets autorisés (formats algériens et internationaux).
export const TELEPHONE_PATTERN = /^\+?[0-9][0-9 .()-]{4,30}$/;

export type ImportStatut = 'créé' | 'ignoré' | 'rejeté';

export interface LigneFichier {
  /** Numéro de la ligne DANS LE FICHIER source (1-based, en-tête compris). */
  ligne: number;
  nom: string;
  email: string;
  telephone: string;
}

export interface LigneValide {
  ligne: number;
  nom: string;
  email: string;
  telephone: string | null;
}

export interface RapportLigne {
  ligne: number;
  nom: string;
  email: string;
  statut: ImportStatut;
  raison?: string;
}

export interface RapportResume {
  crees: number;
  ignores: number;
  rejetes: number;
  invitationsEnFile: number;
}

export interface RapportImport {
  lignes: RapportLigne[];
  resume: RapportResume;
}

/** Statut d'invitation affiché côté admin — source : l'outbox (join invitation). */
export type StatutInvitation = 'en_file' | 'envoyee' | 'echec' | 'expiree' | 'active' | 'aucune';

export const LIBELLES_STATUT_INVITATION: Record<StatutInvitation, string> = {
  en_file: 'En file',
  envoyee: 'Envoyée',
  echec: 'Échec',
  expiree: 'Expirée',
  active: 'Activé',
  aucune: 'À renvoyer',
};

// ---------------------------------------------------------------------------
// Story 3.2 — types de mission FERMÉS (CHECK SQL 0020 + domaine) : aucun type
// personnalisé, jamais.
// ---------------------------------------------------------------------------

export const MISSION_TYPES = [
  'scan_checkpoint',
  'accueil',
  'securite_troncon',
  'securite_arrivee',
  'distribution_dossards',
  'communication',
] as const;

export type MissionType = (typeof MISSION_TYPES)[number];

export const LIBELLES_MISSION_TYPE: Record<MissionType, string> = {
  scan_checkpoint: 'Scan checkpoint',
  accueil: 'Accueil',
  securite_troncon: 'Sécurité tronçon',
  securite_arrivee: 'Sécurité arrivée',
  distribution_dossards: 'Distribution des dossards',
  communication: 'Communication',
};

export function estMissionType(valeur: unknown): valeur is MissionType {
  return typeof valeur === 'string' && (MISSION_TYPES as readonly string[]).includes(valeur);
}

// ---------------------------------------------------------------------------
// Couverture DÉRIVÉE des affectations (≥ 1 affectation = couverte), jamais
// stockée : la source de vérité est l'ensemble des affectations.
// ---------------------------------------------------------------------------

export type Couverture = 'couverte' | 'vacante';

export const LIBELLES_COUVERTURE: Record<Couverture, string> = {
  couverte: 'Couverte',
  vacante: 'Vacante',
};

export function couverture(nombreAffectations: number): Couverture {
  return nombreAffectations >= 1 ? 'couverte' : 'vacante';
}

// ---------------------------------------------------------------------------
// Chevauchement d'intervalles : a.debut < b.fin AND b.debut < a.fin (spec 3.2).
// ---------------------------------------------------------------------------

export interface Intervalle {
  debut: Date;
  fin: Date;
}

export function chevauche(a: Intervalle, b: Intervalle): boolean {
  return a.debut.getTime() < b.fin.getTime() && b.debut.getTime() < a.fin.getTime();
}

// ---------------------------------------------------------------------------
// Validation secteur (nom, lieu, contact téléphone facultatif — pattern 3.1).
// ---------------------------------------------------------------------------

export const MAX_LIEU_LENGTH = 200;

export const SECTEUR_FIELD_ORDER = ['nom', 'lieu', 'contact'] as const;

export type SecteurField = (typeof SECTEUR_FIELD_ORDER)[number];

export type SecteurFieldErrors = Partial<Record<SecteurField, string>>;

export interface SecteurInput {
  nom: string;
  lieu: string;
  contact: string | null;
}

function texteOuVide(raw: Record<string, unknown>, cle: string): string {
  const valeur = raw[cle];
  return typeof valeur === 'string' ? valeur.trim() : '';
}

export function normalizeSecteurInput(raw: unknown): SecteurInput {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const nom = texteOuVide(record, 'nom');
  const lieu = texteOuVide(record, 'lieu');
  const contact = texteOuVide(record, 'contact');
  return { nom, lieu, contact: contact.length > 0 ? contact : null };
}

export function validateSecteurInput(input: SecteurInput): SecteurFieldErrors {
  const errors: SecteurFieldErrors = {};
  if (input.nom.length === 0) {
    errors.nom = 'Le nom du secteur est obligatoire.';
  } else if (input.nom.length > MAX_NOM_LENGTH) {
    errors.nom = `${MAX_NOM_LENGTH} caractères maximum pour le nom.`;
  }
  if (input.lieu.length === 0) {
    errors.lieu = 'Le lieu est obligatoire (repère terrain : village, carrefour…).';
  } else if (input.lieu.length > MAX_LIEU_LENGTH) {
    errors.lieu = `${MAX_LIEU_LENGTH} caractères maximum pour le lieu.`;
  }
  if (input.contact !== null && !estTelephoneValide(input.contact)) {
    errors.contact = 'Le contact doit être un numéro de téléphone (ou rester vide).';
  }
  return errors;
}

export function hasSecteurFieldErrors(errors: SecteurFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

// ---------------------------------------------------------------------------
// Validation mission : type fermé, horaires fin > début, consignes ≤ 5000.
// Horaires ISO 8601 UTC dans l'API (saisie locale datetime-local côté client).
// ---------------------------------------------------------------------------

export const MAX_TITRE_LENGTH = 120;

export const MAX_CONSIGNES_LENGTH = 5000;

export const MISSION_FIELD_ORDER = [
  'secteurId',
  'type',
  'titre',
  'debutLe',
  'finLe',
  'barriereLe',
  'consignes',
  'estArrivee',
] as const;

export type MissionField = (typeof MISSION_FIELD_ORDER)[number];

export type MissionFieldErrors = Partial<Record<MissionField, string>>;

export interface MissionInput {
  secteurId: string;
  type: MissionType | null;
  titre: string;
  debutLe: string;
  finLe: string;
  consignes: string | null;
  /** Story 5.1 — au plus une mission cochée par édition (garde service). */
  estArrivee: boolean;
  /** Story 5.2 — barrière horaire du checkpoint (RFC3339 UTC) ou null. */
  barriereLe: string | null;
}

// RFC3339 STRICT se terminant par Z : un ISO sans Z serait interprété en heure
// LOCALE du serveur (décalage silencieux) — refusé net.
const HORODATAGE_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

export function estHorodatageValide(valeur: string): boolean {
  if (!HORODATAGE_RFC3339.test(valeur)) {
    return false;
  }
  const date = new Date(valeur);
  return !Number.isNaN(date.getTime());
}

/** Identifiants d'entité (chemin de route ou corps) : UUID canonique ou refus. */
export function estUuidValide(valeur: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur);
}

/** ISO 8601 UTC (…Z) → valeur d'input datetime-local (heure locale du navigateur). */
export function isoVersDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (valeur: number): string => String(valeur).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valeur datetime-local (heure locale) → ISO 8601 UTC pour l'API (…Z). */
export function datetimeLocalVersIso(valeur: string): string {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function normalizeMissionInput(raw: unknown): MissionInput {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const typeBrut = record.type;
  const consignes = texteOuVide(record, 'consignes');
  return {
    secteurId: typeof record.secteurId === 'string' ? record.secteurId.trim() : '',
    type: estMissionType(typeBrut) ? typeBrut : null,
    titre: texteOuVide(record, 'titre'),
    debutLe: typeof record.debutLe === 'string' ? record.debutLe.trim() : '',
    finLe: typeof record.finLe === 'string' ? record.finLe.trim() : '',
    consignes: consignes.length > 0 ? consignes : null,
    // Strict === true : toute autre valeur (absente, string, nombre) = décochée,
    // jamais de coercition truthy qui cocherait l'arrivée par accident.
    estArrivee: record.estArrivee === true,
    // Story 5.2 — barrière facultative : vide/absent = null ; une valeur
    // NON-CHAÎNE (nombre, objet via API) n'est JAMAIS avalée en null
    // silencieux (qui désarmerait l'alerte) : la brute stringifiée reste et
    // validate la rejette « date et une heure valides ».
    barriereLe: normaliserBarriereLe(record.barriereLe),
  };
}

/** Barrière brute : null si absente/vide, chaîne sinon (stringifiée si besoin). */
function normaliserBarriereLe(valeur: unknown): string | null {
  if (valeur === undefined || valeur === null) {
    return null;
  }
  if (typeof valeur === 'string') {
    const trim = valeur.trim();
    return trim.length > 0 ? trim : null;
  }
  return String(valeur);
}

export function validateMissionInput(input: MissionInput): MissionFieldErrors {
  const errors: MissionFieldErrors = {};
  if (input.secteurId.length === 0) {
    errors.secteurId = 'Choisis le secteur de la mission.';
  }
  if (input.type === null) {
    errors.type = 'Choisis un type de mission parmi la liste.';
  }
  if (input.titre.length === 0) {
    errors.titre = 'Le titre de la mission est obligatoire.';
  } else if (input.titre.length > MAX_TITRE_LENGTH) {
    errors.titre = `${MAX_TITRE_LENGTH} caractères maximum pour le titre.`;
  }
  const debutValide = estHorodatageValide(input.debutLe);
  const finValide = estHorodatageValide(input.finLe);
  if (!debutValide) {
    errors.debutLe = 'Indique la date et l’heure de début.';
  }
  if (!finValide) {
    errors.finLe = 'Indique la date et l’heure de fin.';
  }
  if (debutValide && finValide) {
    const debut = new Date(input.debutLe);
    const fin = new Date(input.finLe);
    if (fin.getTime() <= debut.getTime()) {
      errors.finLe = 'La fin doit être après le début.';
    }
  }
  if (input.consignes !== null && input.consignes.length > MAX_CONSIGNES_LENGTH) {
    errors.consignes = `${MAX_CONSIGNES_LENGTH} caractères maximum pour les consignes.`;
  }
  // Story 5.1 — la marque arrivée n'a de sens que sur un checkpoint : un
  // coureur ne « franchit » pas une mission accueil. Erreur champ, jamais 500.
  if (input.estArrivee && input.type !== 'scan_checkpoint') {
    errors.estArrivee = 'La marque arrivée est réservée aux missions Scan checkpoint.';
  }
  // Story 5.2 — barrière horaire : facultative (null = jamais d'alerte), mais
  // si présente : RFC3339 strict, réservée aux scan_checkpoint, DANS la
  // mission (debutLe ≤ barriereLe ≤ finLe — une barrière hors des horaires de
  // la mission n'a pas de sens opérationnel, bornes incluses).
  if (input.barriereLe !== null) {
    if (!estHorodatageValide(input.barriereLe)) {
      errors.barriereLe = 'La barrière horaire doit être une date et une heure valides (ou rester vide).';
    } else if (input.type !== 'scan_checkpoint') {
      errors.barriereLe = 'La barrière horaire est réservée aux missions Scan checkpoint.';
    } else if (debutValide && new Date(input.barriereLe).getTime() < new Date(input.debutLe).getTime()) {
      errors.barriereLe = 'La barrière horaire doit être après le début de la mission.';
    } else if (finValide && new Date(input.barriereLe).getTime() > new Date(input.finLe).getTime()) {
      errors.barriereLe = 'La barrière horaire doit être avant la fin de la mission.';
    }
  }
  return errors;
}

export function hasMissionFieldErrors(errors: MissionFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

export function estTelephoneValide(telephone: string): boolean {
  return telephone.length <= MAX_TELEPHONE_LENGTH && TELEPHONE_PATTERN.test(telephone);
}

export function validerLigne(ligne: LigneFichier): { ok: true; valeur: LigneValide } | { ok: false; raison: string } {
  const nom = ligne.nom.trim();
  if (nom.length === 0) {
    return { ok: false, raison: 'nom manquant' };
  }
  if (nom.length > MAX_NOM_LENGTH) {
    return { ok: false, raison: `nom trop long (${MAX_NOM_LENGTH} caractères maximum)` };
  }
  const email = normaliserEmail(ligne.email);
  if (email.length === 0) {
    return { ok: false, raison: 'email manquant' };
  }
  if (email.length > MAX_EMAIL_LENGTH || !estEmailValide(email)) {
    return { ok: false, raison: 'email invalide' };
  }
  const telephoneBrut = ligne.telephone.trim();
  if (telephoneBrut.length > 0 && !estTelephoneValide(telephoneBrut)) {
    return { ok: false, raison: 'téléphone invalide' };
  }
  return {
    ok: true,
    valeur: { ligne: ligne.ligne, nom, email, telephone: telephoneBrut.length > 0 ? telephoneBrut : null },
  };
}

/**
 * Statut d'invitation dérivé : mot de passe posé → activé ; puis expiration,
 * échec d'envoi, envoyée, en file. L'outbox reste l'unique source de vérité du
 * transport ; expire_le celle de la durée de vie du jeton.
 */
export function statutInvitation(input: {
  passwordSetAt: Date | null;
  invitation: { consommeLe: Date | null; expireLe: Date; outboxStatut: string } | null;
  maintenant?: Date;
}): StatutInvitation {
  if (input.passwordSetAt !== null || input.invitation?.consommeLe != null) {
    return 'active';
  }
  if (input.invitation === null) {
    return 'aucune';
  }
  const maintenant = input.maintenant ?? new Date();
  if (input.invitation.expireLe.getTime() <= maintenant.getTime()) {
    return 'expiree';
  }
  if (input.invitation.outboxStatut === 'failed') {
    return 'echec';
  }
  if (input.invitation.outboxStatut === 'sent') {
    return 'envoyee';
  }
  return 'en_file';
}
