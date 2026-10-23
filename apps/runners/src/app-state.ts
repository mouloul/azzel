import type { ChecklistState } from '@azzel/shared';

// Story 6.1 — machine à états de l'app (3 écrans utiles + connexion) :
// décisions PURES testées ici, câblées par App.tsx. Dossier déjà validé à
// l'ouverture → e-dossard direct, étapes court-circuitées.

export type Ecran = 'chargement' | 'connexion' | 'dossier' | 'edossard' | 'hors-ligne';

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
