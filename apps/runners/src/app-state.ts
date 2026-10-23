import type { ChecklistState } from '@azzel/shared';

import type { EtatSuivi } from './tracking/moteur';

// Story 6.1 — machine à états de l'app (écrans utiles + connexion) :
// décisions PURES testées ici, câblées par App.tsx. Dossier déjà validé à
// l'ouverture → e-dossard direct, étapes court-circuitées.
// Story 6.2 — écrans 'suivi' (activation GPS opt-in) et 'journal-sync'
// (journal des synchronisations), accessibles depuis dossier et e-dossard.
// Story 6.3 — écran 'guide-permission' : auto-affiché UNE fois par
// interruption au retour au premier plan, accessible EN PERMANENCE depuis
// l'écran Suivi (bouton « Comment garder mon suivi actif ? »).

export type Ecran =
  | 'chargement'
  | 'connexion'
  | 'dossier'
  | 'edossard'
  | 'suivi'
  | 'guide-permission'
  | 'journal-sync'
  | 'hors-ligne';

/** La pièce « validation » de la checklist est verte (dossier validé). */
export function dossierValide(dossier: ChecklistState): boolean {
  return dossier.pieces.some((piece) => piece.id === 'validation' && piece.fait);
}

/** Dossier refusé : le motif accompagne la pièce validation. */
export function motifRefusDossier(dossier: ChecklistState): string | null {
  const piece = dossier.pieces.find((candidate) => candidate.id === 'validation');
  return piece?.motifRefus ?? null;
}

/**
 * Écran cible une fois le dossier connu : validé → e-dossard (court-circuit
 * des étapes), sinon la checklist.
 */
export function ecranApresDossier(dossier: ChecklistState | null): 'dossier' | 'edossard' | 'hors-ligne' {
  if (dossier === null) {
    return 'hors-ligne';
  }
  return dossierValide(dossier) ? 'edossard' : 'dossier';
}

/**
 * Démarrage réseau coupé : cache dossier présent → servi depuis le cache
 * (bandeau hors-ligne) ; aucun cache → écran expliquant la 1ʳᵉ connexion
 * requise. Jamais d'écran vide.
 */
export function ecranHorsLigneAuDemarrage(cacheDossier: ChecklistState | null): Ecran {
  return ecranApresDossier(cacheDossier);
}

/** Entrée de la décision de navigation après une reprise au premier plan (6.3). */
export interface EntreeEcranApresReprise {
  /** L'orchestration demande l'affichage AUTOMATIQUE du guide. */
  afficherGuide: boolean;
  /** État moteur AVANT la reprise (l'interruption détectée au départ). */
  etatMoteurPrecedent: EtatSuivi;
  /** La reprise a remis le suivi en marche ('actif' ou 'actif-avant-plan'). */
  repris: boolean;
  ecranCourant: Ecran;
  /** Le guide affiché avait été AUTO-affiché (vs ouvert par le bouton Suivi). */
  guideAutoAffiche: boolean;
}

/**
 * 6.3 — écran conséquent d'une reprise au premier plan (décision PURE,
 * câblée par App.tsx) : guide demandé → 'guide-permission' ; fermeture
 * automatique UNIQUEMENT si le guide avait été auto-affiché et que
 * l'interruption qui l'avait ouvert se résout — un guide ouvert par le
 * bouton « Comment garder mon suivi actif ? » n'est JAMAIS refermé tout
 * seul (le coureur le referme lui-même).
 */
export function ecranApresReprise(entree: EntreeEcranApresReprise): Ecran {
  if (entree?.afficherGuide === true) {
    return 'guide-permission';
  }
  if (
    entree?.guideAutoAffiche === true &&
    entree?.etatMoteurPrecedent === 'interrompu' &&
    entree?.repris === true &&
    entree?.ecranCourant === 'guide-permission'
  ) {
    return 'suivi';
  }
  return entree?.ecranCourant ?? 'chargement';
}
