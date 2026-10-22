import type { AnnuaireEdition } from '@azzel/shared';

// Story 3.4 (revue) — résolution du repli annuaire, EXTRAITE en fonction pure
// du composant PWA pour être unit-testée. La fraîcheur se compare par
// Date.getTime(), jamais par les chaînes : deux ISO UTC valides peuvent se
// comparer mal lexicographiquement ('...T08:00:00Z' vs '...T08:00:00.500Z').

export type StatutAnnuaire =
  | 'chargement'
  | 'pret'
  | 'hors-ligne'
  | 'aucun'
  | 'non-enregistre'
  | 'indisponible';

function tempsGenere(genereA: string): number {
  const temps = new Date(genereA).getTime();
  return Number.isNaN(temps) ? Number.NEGATIVE_INFINITY : temps;
}

/**
 * Le plus frais des deux annuaires. L'initial ne détrône le cache QUE s'il
 * est strictement plus récent (égalité → cache : la poche reste cohérente,
 * pas de réécriture inutile). Horodatage invalide unilatéral → l'autre gagne.
 */
function plusFrais(
  a: AnnuaireEdition | null,
  b: AnnuaireEdition | null,
): AnnuaireEdition | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return tempsGenere(b.genereA) > tempsGenere(a.genereA) ? b : a;
}

/**
 * Repli après échec du fetch annuaire : le plus frais gagne (poche d'abord),
 * IDB vide → l'état serveur amorce, aucun des deux → indisponible. Le statut
 * « hors-ligne » n'est choisi que réseau réellement coupé : un 5xx en ligne
 * garde l'état le plus frais affiché comme prêt.
 */
export function resoudreAnnuaireHorsLigne(
  enCache: AnnuaireEdition | null,
  annuaireInitial: AnnuaireEdition | null,
  enLigne: boolean,
): { annuaire: AnnuaireEdition | null; statut: StatutAnnuaire } {
  const courant = plusFrais(enCache, annuaireInitial);
  if (courant === null) {
    return { annuaire: null, statut: 'indisponible' };
  }
  if (courant.coureurs.length === 0) {
    return { annuaire: courant, statut: 'aucun' };
  }
  return { annuaire: courant, statut: enLigne ? 'pret' : 'hors-ligne' };
}
