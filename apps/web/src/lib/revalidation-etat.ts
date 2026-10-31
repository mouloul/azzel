import { estEtatVolontaires, type EtatVolontaires } from './idb-volontaires';

// Revue 3.3 — décision pure « réponse de GET /api/volontaires/etat → statut
// de la fiche », extraite du composant pour être testée en node. Le service
// worker marque ses réponses fabriquées (repli cache, enveloppe hors-ligne)
// par l'en-tête X-Azzel-Source : elles ne sont JAMAIS une synchronisation —
// le badge passe « HORS-LIGNE PRÊT » et la poche n'est pas réécrite comme
// fraîche. Toute autre revalidation en échec (5xx, payload hors contrat,
// autre compte) affiche la fraîcheur réelle, jamais « Ta fiche est à jour. ».

/** En-tête posé par public/sw-volontaires.js sur ses réponses de repli. */
export const ENTETE_SOURCE_SW = 'X-Azzel-Source';

export type StatutSync = 'synchrone' | 'hors-ligne' | 'non-rafraichi';

/** Ce que le client a lu de la réponse (null = fetch rejeté, réseau absent). */
export interface ReponseEtatLue {
  status: number;
  /** Valeur de X-Azzel-Source (« cache », « hors-ligne »), null si réseau. */
  source: string | null;
  payload: unknown;
}

export type DecisionRevalidation =
  | { issue: 'frais'; etat: EtatVolontaires }
  | { issue: 'session-expiree' }
  | {
      issue: 'repli';
      statut: Exclude<StatutSync, 'synchrone'>;
      /** État rejoué par le SW (même compte, contrat validé), sinon null. */
      replique: EtatVolontaires | null;
    };

export function deciderRevalidationEtat(
  reponse: ReponseEtatLue | null,
  accountId: string,
  enLigne: boolean,
): DecisionRevalidation {
  const statutEchec = enLigne ? 'non-rafraichi' : 'hors-ligne';
  if (reponse === null) {
    return { issue: 'repli', statut: statutEchec, replique: null };
  }
  if (reponse.status === 401 || reponse.status === 403) {
    return { issue: 'session-expiree' };
  }
  // Payload validé (missions comprises) ET du même compte (D1) : un état
  // d'un autre volontaire n'est jamais affiché, même rejoué du cache.
  const valide =
    reponse.status >= 200 &&
    reponse.status < 300 &&
    estEtatVolontaires(reponse.payload) &&
    reponse.payload.accountId === accountId
      ? reponse.payload
      : null;
  if (reponse.source !== null) {
    // Le SW a répondu à la place du réseau : la requête n'a pas abouti.
    return { issue: 'repli', statut: 'hors-ligne', replique: valide };
  }
  if (valide === null) {
    return { issue: 'repli', statut: statutEchec, replique: null };
  }
  return { issue: 'frais', etat: valide };
}

/**
 * Le plus frais des candidats DU COMPTE (Date.getTime(), jamais les chaînes) ;
 * à égalité, le premier gagne. Null si aucun candidat retenu.
 */
export function etatLePlusFrais(
  candidats: readonly (EtatVolontaires | null)[],
  accountId: string,
): EtatVolontaires | null {
  let retenu: EtatVolontaires | null = null;
  for (const candidat of candidats) {
    if (candidat === null || candidat.accountId !== accountId) {
      continue;
    }
    if (
      retenu === null ||
      new Date(candidat.generéA).getTime() > new Date(retenu.generéA).getTime()
    ) {
      retenu = candidat;
    }
  }
  return retenu;
}
