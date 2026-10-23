// Story 6.3 — classification PURE de la permission localisation au retour
// au premier plan (piège iOS « Autoriser une fois »). Décision sans port,
// sans exception, injectée à reprendreAuPremierPlan (orchestration-suivi) :
// - opt-in désactivé → 'rien' : AUCUN check, AUCUN guide (« rien n'est
//   enregistré » reste littéral — la permission n'est même pas lue) ;
// - permission perdue alors que le suivi tournait → 'interrompu' : piège
//   « Autoriser une fois » (le suivi s'arrête au premier verrouillage) —
//   seul ce verdict déclenche l'affichage AUTOMATIQUE du guide ;
// - permission jamais accordée → 'refuse' : suivi silencieusement inactif,
//   JAMAIS d'auto-affichage (le guide reste accessible via le bouton) ;
// - rétrogradation « Toujours » → « Pendant l'utilisation » (suivi qui
//   tournait AVEC arrière-plan, arrière-plan révoqué) → 'retrograde' :
//   le watcher vit encore, l'état affiché doit redevenir honnête
//   ('actif-avant-plan') — sans guide ni arrêt ;
// - permission accordée + suivi qui tournait → 'ok' : rien à faire ;
// - permission accordée + suivi arrêté (interrompu, refusé rétabli,
//   inactif) → 'redemarrer' : le watcher REPART seul (SANS nouvelle
//   demande — voir le port demarrerSansDemande), sans manipulation.
// La décision est UNIFORME iOS/Android : seul le CONTENU du guide diffère
// (« Toujours » vs « Autoriser tout le temps »).

/** Verdict de la classification — les issues de la matrice 6.3. */
export type VerdictPermission =
  | 'ok'
  /** « Toujours » rétrogradé en « Pendant l'utilisation » : état à corriger, pas une interruption. */
  | 'retrograde'
  | 'redemarrer'
  | 'interrompu'
  | 'refuse'
  | 'rien';

export interface EntreeClasserPermission {
  /** Opt-in du coureur : false → 'rien' (aucune lecture, aucun guide). */
  optIn: boolean;
  /**
   * Le suivi tournait réellement au moment du passage arrière-plan (état
   * moteur 'actif' ou 'actif-avant-plan') — pas 'interrompu' ni 'refusee'.
   */
  suiviTournait: boolean;
  /**
   * Le suivi tournait AVEC l'arrière-plan (état moteur 'actif') : seul ce
   * cas peut être RÉTROGRADÉ — un 'actif-avant-plan' qui reste avant-plan
   * est la situation normale, pas une rétrogradation.
   */
  arrierePlanAvait: boolean;
  /** Permission avant-plan accordée MAINTENANT (lecture get*, sans demande). */
  avantPlanAccordee: boolean;
  /** Permission arrière-plan accordée MAINTENANT (lecture get*, sans demande). */
  arrierePlanAccordee: boolean;
}

/**
 * Classifie la situation au retour au premier plan. Fonction PURE et
 * TOTALE : aucune exception, même sur entrée dégradée (champs absents
 * traités comme faux — le verdict le plus inoffensif possible).
 */
export function classierPermission(entree: EntreeClasserPermission): VerdictPermission {
  // Normalisation défensive : « jamais d'exception » est contractuel.
  const optIn = entree?.optIn === true;
  const suiviTournait = entree?.suiviTournait === true;
  const arrierePlanAvait = entree?.arrierePlanAvait === true;
  const avantPlanAccordee = entree?.avantPlanAccordee === true;
  const arrierePlanAccordee = entree?.arrierePlanAccordee === true;
  if (!optIn) {
    return 'rien';
  }
  if (!avantPlanAccordee) {
    // Permission avant-plan perdue (l'expiry « Autoriser une fois » retire
    // TOUT) : le piège n'existe que si le suivi tournait — sinon c'est un
    // refus « net », traité sans culpabilisation ni auto-guide.
    return suiviTournait ? 'interrompu' : 'refuse';
  }
  if (!suiviTournait) {
    // Avant-plan accordé mais watcher arrêté (interrompu, refus rétabli,
    // inactif) : le suivi est au moins possible ouvert — il REPART seul.
    return 'redemarrer';
  }
  if (!arrierePlanAccordee && arrierePlanAvait) {
    // « Toujours » rétrogradé en « Pendant l'utilisation » pendant que le
    // watcher tournait : l'état 'actif' affiché devient menteur — à
    // corriger en 'actif-avant-plan', sans guide ni arrêt.
    return 'retrograde';
  }
  // Avant-plan seul qui l'était déjà, ou permissions intactes : rien à faire.
  return 'ok';
}
