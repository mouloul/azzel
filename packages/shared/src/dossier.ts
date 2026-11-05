// Story 6.1 — contrat JSON du dossier coureur (checklist) partagé entre le
// monolithe web (GET /api/coureur/dossier) et l'app native (@azzel/runners).
// Unique source de vérité : le web rend la checklist en HTML depuis ces mêmes
// types, l'app la consomme en JSON — jamais réinventé localement.

/** Synthèse d'édition servie aux coureurs (checklist, inscriptions). */
export interface EditionSummary {
  id: string;
  slug: string;
  nom: string;
  /**
   * Date exacte, AMORCE de calcul uniquement (âge à la course). Ne pas
   * l'afficher : ce que le public lit est `dateCourseLibelle`, que
   * l'organisation décide de préciser ou non.
   */
  dateCourse: string;
  /** « printemps 2027 » ou « 26 mars 2027 », selon le réglage d'administration. */
  dateCourseLibelle: string;
  /** Même chose, prête pour une phrase : « au printemps 2027 », « le 26 mars 2027 ». */
  dateCoursePhrase: string;
  registrationClosesAt: string;
  registrationOpen: boolean;
}

export type ChecklistPieceId =
  | 'email'
  | 'epreuve'
  | 'decharge'
  | 'reglement'
  | 'preuve'
  | 'validation';

export interface ChecklistPiece {
  id: ChecklistPieceId;
  libelle: string;
  fait: boolean;
  actionLabel?: string;
  actionHref?: string;
  texteSecondaire?: string;
  motifRefus?: string;
}

export interface ChecklistRecap {
  epreuve: string;
  distanceKm: number;
  categorieAge: string;
  tshirt: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  /** Voir EditionSummary.dateCourse : amorce de calcul, jamais affichée. */
  dateCourse: string;
  dateCourseLibelle: string;
}

export interface ChecklistState {
  edition: EditionSummary | null;
  pieces: ChecklistPiece[];
  recap: ChecklistRecap | null;
  /**
   * Statut STOCKÉ du dossier (null sans inscription). Brut à dessein : le
   * libellé affiché dépend aussi de la preuve (pièce « preuve »), et chaque
   * surface — web, application — l'habille à sa façon.
   */
  statut?: string | null;
}
