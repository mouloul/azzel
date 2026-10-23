// Story 4.5 — domaine chrono : types et pures de l'ingestion terrain.
// Le module reste volontairement MINCE : ingestion + arbitrage uniquement ;
// classements et tableaux (épopées 5/7) interrogent premierRecu sans toucher
// à l'ingestion. Toute la validation de forme vit dans le contrat shared
// (estRetraitValide/estPassageValide) — ici, jamais réinventée.

import {
  estHorodatageValide,
  type EvenementSyncTerrain,
  type ResultatEvenementSync,
  type StatutSyncTerrain,
} from '@azzel/shared';

/** Appareil authentifié par Bearer — résolu par hash, avant tout GUC. */
export interface AppareilAuth {
  id: string;
  organisationId: string;
  appareilClient: string;
}

export interface AppareilRecord {
  id: string;
  appareilClient: string;
  revokedAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

/** Réponse d'enregistrement : le jeton BRUT ne vivra qu'ici (une fois). */
export interface EnregistrementAppareil {
  appareilId: string;
  jeton: string;
  rotation: boolean;
}

/** Ligne terrain_evenement telle que lue en base (audit/arbitrage). */
export interface TerrainEvenementRecord {
  id: string;
  cleIdempotence: string;
  type: 'retrait' | 'passage';
  editionId: string;
  jetonCoureur: string;
  checkpointId: string | null;
  horodatageAppareil: Date;
  horodatageReception: Date;
  offsetEstimeMs: number;
  appareilId: string;
}

// ---------------------------------------------------------------------------
// Story 5.1 — agrégats du tableau de bord PC course (lecture seule, AD-3).
// ---------------------------------------------------------------------------

/**
 * Ligne de board UX-DR-12 : un passage ARBITRÉ (premier reçu non annulé par
 * coureur×checkpoint). evenementId = cible de l'annulation auditable (5.4) :
 * l'événement qui FAIT FOI sur cette ligne, jamais un doublon archivé.
 */
export interface PassageArbitre {
  evenementId: string;
  dossard: number;
  horodatageReception: Date;
}

/** Board d'un checkpoint (mission scan_checkpoint de l'édition courante). */
export interface CheckpointCourse {
  id: string;
  titre: string;
  estArrivee: boolean;
  /** Tri heure de réception serveur DÉCROISSANT (UX-DR-12). */
  passages: PassageArbitre[];
}

/** Partants par épreuve : coureurs VALIDÉS de l'édition courante. */
export interface PartantsEpreuve {
  epreuveId: string;
  epreuveNom: string;
  total: number;
}

/**
 * Story 5.2 — alerte hors-délais : coureur RETIRÉ (résolu) SANS passage
 * arbitré à un checkpoint dont la barrière horaire est PASSÉE (heure serveur).
 * Le contact du secteur de la mission remonte avec l'alerte (action
 * « Appeler le secteur ») — résolution serveur uniquement (AD-3).
 */
export interface AlerteHorsDelais {
  dossard: number;
  checkpointId: string;
  checkpointTitre: string;
  barriereLe: Date;
  contactSecteur: string | null;
}

/** Agrégats PC course, org-scopés — tout horodatage est SERVEUR (AD-3). */
export interface EtatCourseRecord {
  edition: { id: string; nom: string } | null;
  partants: PartantsEpreuve[];
  /** Premiers retraits reçus, par coureur distinct. */
  retraits: number;
  /** Retirés ∧ passage arbitré au checkpoint est_arrivee ∧ NON abandonnés. */
  arrives: number;
  /** Abandons de l'édition (UNIQUE par coureur — AD-3, append-only). */
  abandones: number;
  /** retraits − abandonnés − arrivés, JAMAIS négatif (défense d'affichage). */
  enCourse: number;
  /** Au plus un checkpoint d'arrivée par édition (garde service missions). */
  arriveeDefinie: boolean;
  checkpoints: CheckpointCourse[];
  /** Attendus non passés après barrière — recalculées à chaque état (5.2). */
  alertes: AlerteHorsDelais[];
  /** max(horodatage_reception) — null = aucune donnée reçue. */
  fraicheur: Date | null;
}

// ---------------------------------------------------------------------------
// Story 5.3 — saisie des abandons (FR-17). Liste fermée de motifs métier
// (calque MISSION_TYPES : CHECK SQL 0028 + domaine, aucun motif libre), record
// append-only, validation de forme de la saisie (la résolution dossard→coureur
// et les contraintes de course vivent dans la transaction du store — l'état au
// moment de la saisie est la vérité, jamais un état potentiellement périmé).
// ---------------------------------------------------------------------------

export const MOTIFS_ABANDON = [
  'blessure',
  'epuisement',
  'hors_delais',
  'abandon_volontaire',
  'autre',
] as const;

export type MotifAbandon = (typeof MOTIFS_ABANDON)[number];

export const LIBELLES_MOTIF_ABANDON: Record<MotifAbandon, string> = {
  blessure: 'Blessure',
  epuisement: 'Épuisement',
  hors_delais: 'Hors-délais',
  abandon_volontaire: 'Abandon volontaire',
  autre: 'Autre',
};

export function estMotifAbandon(valeur: unknown): valeur is MotifAbandon {
  return typeof valeur === 'string' && (MOTIFS_ABANDON as readonly string[]).includes(valeur);
}

/** Lieu libre court (CHECK SQL 0028 symétrique). */
export const MAX_LIEU_ABANDON_LENGTH = 200;

export const ABANDON_FIELD_ORDER = ['dossard', 'lieu', 'motif', 'heure'] as const;

export type AbandonField = (typeof ABANDON_FIELD_ORDER)[number];

export type AbandonFieldErrors = Partial<Record<AbandonField, string>>;

/** Saisie normalisée : dossard entier, lieu trimé, motif fermé, heure ISO. */
export interface SaisieAbandonInput {
  dossard: number | null;
  lieu: string;
  motif: MotifAbandon | null;
  /** ISO 8601 UTC strict (…Z) — converti depuis l'heure locale par le client. */
  heure: string | null;
}

/** Ligne abandon telle que lue en base (append-only, AD-3). */
export interface AbandonRecord {
  id: string;
  editionId: string;
  jetonCoureur: string;
  lieu: string;
  motif: MotifAbandon;
  /** Heure LOCALE saisie, stockée ISO UTC — donnée déclarative, pas classement. */
  horodatage: Date;
  auteurEmail: string;
  horodatageReception: Date;
}

/**
 * Story 5.4 — annulation rendue par le store : l'événement visé (INTACT en
 * base) + le dossard/checkpoint résolus pour le message du PC, et le
 * drapeau idempotent (UNIQUE evenement_id : un rejeu est « déjà annulé »).
 */
export interface AnnulationResultat {
  /** true = l'annulation existait DÉJÀ (rejeu) : succès, pas d'erreur. */
  dejaAnnule: boolean;
  evenementId: string;
  dossard: number;
  checkpointTitre: string;
}

/**
 * Normalise un corps de saisie brut (API) : dossard entier (nombre ou chaîne
 * de chiffres — toute autre forme reste null et valide en erreur champ),
 * motif hors liste fermée → null (jamais avali en « autre » silencieux),
 * heure conservée brute (la validation juge la forme).
 */
export function normaliserSaisieAbandon(raw: unknown): SaisieAbandonInput {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const dossardBrut = record.dossard;
  let dossard: number | null = null;
  if (typeof dossardBrut === 'number' && Number.isInteger(dossardBrut)) {
    dossard = dossardBrut;
  } else if (typeof dossardBrut === 'string' && /^\d+$/.test(dossardBrut.trim())) {
    dossard = Number(dossardBrut.trim());
  }
  const lieu = typeof record.lieu === 'string' ? record.lieu.trim() : '';
  const heure = typeof record.heure === 'string' ? record.heure.trim() : '';
  return {
    dossard,
    lieu,
    motif: estMotifAbandon(record.motif) ? record.motif : null,
    heure: heure.length > 0 ? heure : null,
  };
}

/**
 * Tolérance d'horloge PC/serveur : une heure saisie ≤ maintenant + 2 minutes
 * reste valide (dérive d'horloge du poste PC, soumission rapide du défaut
 * « maintenant »). Même constante pour la validation locale ET serveur.
 */
export const TOLERANCE_HORLOGE_MS = 120_000;

/**
 * Validation de forme de la saisie (mêmes règles côté client pour le retour
 * immédiat et côté serveur pour la vérité, vouvoiement PC) : dossard entier
 * ≥ 1, lieu 1–200, motif de la liste fermée, heure ISO UTC passée ou dans la
 * tolérance d'horloge.
 */
export function validerSaisieAbandon(
  input: SaisieAbandonInput,
  maintenant: Date,
): AbandonFieldErrors {
  const errors: AbandonFieldErrors = {};
  if (input.dossard === null || input.dossard < 1) {
    errors.dossard = 'Indiquez un numéro de dossard.';
  }
  if (input.lieu.length === 0) {
    errors.lieu = 'Le lieu est obligatoire (repère terrain : village, carrefour…).';
  } else if (input.lieu.length > MAX_LIEU_ABANDON_LENGTH) {
    errors.lieu = `${MAX_LIEU_ABANDON_LENGTH} caractères maximum pour le lieu.`;
  }
  if (input.motif === null) {
    errors.motif = 'Choisissez un motif d’abandon parmi la liste.';
  }
  if (input.heure === null || !estHorodatageValide(input.heure)) {
    errors.heure = 'Indiquez la date et l’heure de l’abandon.';
  } else if (new Date(input.heure).getTime() > maintenant.getTime() + TOLERANCE_HORLOGE_MS) {
    errors.heure = 'L’heure d’abandon ne peut pas être dans le futur (vérifie l’horloge du poste).';
  }
  return errors;
}

export function hasAbandonFieldErrors(errors: AbandonFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

// ---------------------------------------------------------------------------
// Story 5.4 — annulation auditable des passages (AD-8). L'événement terrain
// reste INTACT : l'annulation est un ÉVÉNEMENT SÉPARÉ (table annulation,
// append-only, UNIQUE evenement_id) portée par les lectures arbitrées via
// NOT EXISTS — le ré-arbitrage « second fait foi » est en lecture, jamais en
// réécriture. V1 : seuls les PASSAGES sont annulables (garde store).
// ---------------------------------------------------------------------------

/** Motif libre borné (CHECK SQL 0029 symétrique) : 1–500 caractères. */
export const MAX_MOTIF_ANNULATION_LENGTH = 500;

export const ANNULATION_FIELD_ORDER = ['evenementId', 'motif'] as const;

export type AnnulationField = (typeof ANNULATION_FIELD_ORDER)[number];

export type AnnulationFieldErrors = Partial<Record<AnnulationField, string>>;

/** Saisie normalisée : identifiant d'événement brut, motif trimé. */
export interface SaisieAnnulationInput {
  evenementId: string | null;
  motif: string;
}

/**
 * Normalise un corps d'annulation brut (API) : evenementId conservé trimé
 * (la forme UUID est jugée par la validation), motif trimé — la borne
 * 1–500 vit dans validerSaisieAnnulation.
 */
export function normaliserSaisieAnnulation(raw: unknown): SaisieAnnulationInput {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const evenementId = typeof record.evenementId === 'string' ? record.evenementId.trim() : '';
  const motif = typeof record.motif === 'string' ? record.motif.trim() : '';
  return {
    evenementId: evenementId.length > 0 ? evenementId : null,
    motif,
  };
}

/**
 * Validation de forme de l'annulation (mêmes règles client et serveur,
 * vouvoiement PC) : evenementId requis (un candidat non-UUID reste au
 * service — introuvable par construction, jamais envoyé au SQL), motif
 * 1–500 (bornes du CHECK SQL 0029).
 */
export function validerSaisieAnnulation(input: SaisieAnnulationInput): AnnulationFieldErrors {
  const errors: AnnulationFieldErrors = {};
  if (input.evenementId === null) {
    errors.evenementId = 'Le passage à annuler est indéterminé.';
  }
  if (input.motif.length === 0) {
    errors.motif = 'Le motif est obligatoire.';
  } else if (input.motif.length > MAX_MOTIF_ANNULATION_LENGTH) {
    errors.motif = `${MAX_MOTIF_ANNULATION_LENGTH} caractères maximum pour le motif.`;
  }
  return errors;
}

export function hasAnnulationFieldErrors(errors: AnnulationFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

// ---------------------------------------------------------------------------
// Story 7.1 — heures de départ officielles (départs échelonnés) + classements
// par épreuve (lecture seule au-dessus de l'arbitrage 4.5 et des saisies 5.x).
// ---------------------------------------------------------------------------

/**
 * Borne basse symétrique du CHECK SQL 0033 : une heure de départ vit
 * strictement APRÈS 2000-01-01 (un epoch 0 ne se fait pas passer pour un
 * départ). Même constante pour la validation service ET le CHECK SQL.
 */
export const HEURE_DEPART_MINIMALE_MS = Date.parse('2000-01-01T00:00:00.000Z');

/** Clé d'erreur structurelle (liste illisible / épreuve en double). */
export const HEURES_DEPART_FIELD_HEURES = 'heures' as const;

/**
 * Erreurs champ des heures de départ : clé 'heures' (structure) OU epreuveId
 * (heure invalide pour CETTE épreuve) — la carte affiche l'erreur sous la
 * ligne concernée.
 */
export type HeuresDepartFieldErrors = Record<string, string>;

/** Saisie normalisée : une ligne par épreuve, heure ISO (…Z) ou null (effacer). */
export interface SaisieHeuresDepart {
  heures: { epreuveId: string; heureDepart: string | null }[] | null;
}

/**
 * Normalise un corps PUT brut (API) : `heures` doit être un tableau d'objets
 * {epreuveId non vide, heureDepart null|string} — toute autre forme reste
 * `heures: null` (corps illisible, 400 route) : jamais d'avarage silencieuse.
 */
export function normaliserSaisieHeuresDepart(raw: unknown): SaisieHeuresDepart {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (!Array.isArray(record.heures)) {
    return { heures: null };
  }
  const heures: { epreuveId: string; heureDepart: string | null }[] = [];
  for (const entree of record.heures) {
    if (typeof entree !== 'object' || entree === null) {
      return { heures: null };
    }
    const { epreuveId, heureDepart } = entree as Record<string, unknown>;
    if (typeof epreuveId !== 'string' || epreuveId.trim().length === 0) {
      return { heures: null };
    }
    if (heureDepart !== null && typeof heureDepart !== 'string') {
      return { heures: null };
    }
    heures.push({
      epreuveId: epreuveId.trim(),
      heureDepart: heureDepart === null ? null : heureDepart.trim(),
    });
  }
  return { heures };
}

/**
 * Validation de forme (mêmes règles client et serveur, vouvoiement PC) :
 * heure ISO UTC stricte au-delà de la borne 2000 (CHECK 0033), épreuve unique
 * par requête. Les erreurs sont portées PAR ÉPREUVE (clé epreuveId) pour
 * remonter sous la ligne de la carte.
 */
export function validerSaisieHeuresDepart(input: SaisieHeuresDepart): HeuresDepartFieldErrors {
  const errors: HeuresDepartFieldErrors = {};
  if (input.heures === null) {
    return { heures: 'La liste des heures de départ est illisible.' };
  }
  const vues = new Set<string>();
  for (const ligne of input.heures) {
    if (vues.has(ligne.epreuveId)) {
      errors[HEURES_DEPART_FIELD_HEURES] = 'Une épreuve apparaît plusieurs fois dans la requête.';
      continue;
    }
    vues.add(ligne.epreuveId);
    if (ligne.heureDepart === null) {
      continue;
    }
    if (!estHorodatageValide(ligne.heureDepart)) {
      errors[ligne.epreuveId] = 'Indiquez une date et une heure de départ valides.';
    } else if (new Date(ligne.heureDepart).getTime() <= HEURE_DEPART_MINIMALE_MS) {
      errors[ligne.epreuveId] = 'L’heure de départ est trop ancienne pour être une heure de course.';
    }
  }
  return errors;
}

export function hasHeuresDepartFieldErrors(errors: HeuresDepartFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

/** Épreuve de l'édition courante avec son heure de départ (lue/écrite). */
export interface EpreuveHeureDepartRecord {
  epreuveId: string;
  slug: string;
  nom: string;
  distanceKm: number;
  heureDepart: Date | null;
}

/** Ligne de classement brute (store) : le service calcule rangs/temps. */
export interface LigneClassementRecord {
  dossard: number;
  epreuveId: string;
  categorieAge: string;
  statut: 'arrivé' | 'en-course' | 'abandonné';
  /** Réception SERVEUR du premier passage ARRIVÉE arbitré (null sinon). */
  arriveeRecue: Date | null;
}

/** Classement d'une épreuve brut (store) : heureDepart null = non configurée. */
export interface ClassementEpreuveRecord {
  epreuveId: string;
  slug: string;
  nom: string;
  distanceKm: number;
  heureDepart: Date | null;
  lignes: LigneClassementRecord[];
}

/** Classements de l'édition courante, lus en UNE transaction (NFR-4). */
export interface ClassementsRecord {
  edition: { id: string; nom: string } | null;
  epreuves: ClassementEpreuveRecord[];
  fraicheur: Date | null;
}


/** Bornes symétriques du CHECK SQL appareil_client (0025). */
export const APPAREIL_CLIENT_MAX_LENGTH = 120;

/**
 * Plafond doux d'appareils ENREGISTRÉS par organisation (défense volumétrie) :
 * au-delà, l'enregistrement d'un NOUVEAU appareil est refusé (409) — la
 * rotation d'un appareil connu reste toujours possible.
 */
export const PLAFOND_APPAREILS_PAR_ORG = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Garde de forme UUID — les identifiants de checkpoint (mission scan_checkpoint,
 * V1) et d'édition transitent par des tableaux ::uuid[] SQL : un candidat non
 * UUID ne part jamais en requête (sinon erreur cast), il est simplement
 * introuvable.
 */
export function estUuidValide(valeur: string): boolean {
  return UUID_PATTERN.test(valeur);
}

/**
 * Offset estimé (AD-3) : référence SERVEUR à la réception moins heure
 * APPAREIL au scan — une DONNÉE d'audit journalisée par événement, jamais un
 * temps de classement.
 */
export function calculerOffsetEstimeMs(reception: Date, horodatageAppareil: Date): number {
  return Math.round(reception.getTime() - horodatageAppareil.getTime());
}

/** Compte les statuts d'un lot pour la réponse (compteurs du lot). */
export function compterStatuts(resultats: ResultatEvenementSync[]): {
  acceptes: number;
  dejaConnus: number;
  rejetes: number;
} {
  const compteurs = { acceptes: 0, dejaConnus: 0, rejetes: 0 };
  for (const resultat of resultats) {
    if (resultat.statut === 'accepté') {
      compteurs.acceptes += 1;
    } else if (resultat.statut === 'déjà-connu') {
      compteurs.dejaConnus += 1;
    } else {
      compteurs.rejetes += 1;
    }
  }
  return compteurs;
}

/** Construit un résultat par événement (statut fermé + motif optionnel). */
export function resultatEvenement(
  evenement: EvenementSyncTerrain,
  statut: StatutSyncTerrain,
  motif?: string,
): ResultatEvenementSync {
  return motif === undefined ? { cle: evenement.cle, statut } : { cle: evenement.cle, statut, motif };
}

/** Découpe un lot en tranches ≤ SYNC_TERRAIN_MAX_LOT (reprise séquentielle). */
export function decouperEnTranches<T>(evenements: T[], tailleMax: number): T[][] {
  if (tailleMax < 1) {
    throw new Error('decouperEnTranches : tailleMax doit être ≥ 1');
  }
  const tranches: T[][] = [];
  for (let index = 0; index < evenements.length; index += tailleMax) {
    tranches.push(evenements.slice(index, index + tailleMax));
  }
  return tranches;
}
