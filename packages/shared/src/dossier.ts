// Story 6.1 — contrat JSON du dossier coureur (checklist) partagé entre le
// monolithe web (GET /api/coureur/dossier) et l'app native (@azzel/runners).
// Unique source de vérité : le web rend la checklist en HTML depuis ces mêmes
// types, l'app la consomme en JSON — jamais réinventé localement.

/** Synthèse d'édition servie aux coureurs (checklist, inscriptions). */
export interface EditionSummary {
  id: string;
  slug: string;
  nom: string;
  dateCourse: string;
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
  dateCourse: string;
}

export interface ChecklistState {
  edition: EditionSummary | null;
  pieces: ChecklistPiece[];
  recap: ChecklistRecap | null;
}
