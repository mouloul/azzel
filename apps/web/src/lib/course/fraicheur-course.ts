import type { EtatCourse } from '@/modules/chrono/service';

// Story 5.1 (NFR-5) — fraîcheur du PC course : « synchronisé il y a X » est
// calculé depuis la DERNIÈRE RÉCEPTION serveur des données (fraicheur),
// jamais depuis le dernier polling réussi — un réseau mort ne rajeunit pas
// des chiffres, l'âge affiché continue de croître. Calque du pattern
// libellerBandeauSync : fonctions pures, testées hors effets.

const SECONDES_PAR_MINUTE = 60;
const MINUTES_PAR_HEURE = 60;

/** « synchronisé il y a X s / X min / X h », ou « aucune donnée reçue ». */
export function libellerFraicheurCourse(
  fraicheurIso: string | null,
  maintenant: Date,
): string {
  if (fraicheurIso === null) {
    return 'aucune donnée reçue';
  }
  const fraicheur = new Date(fraicheurIso);
  if (Number.isNaN(fraicheur.getTime())) {
    return 'aucune donnée reçue';
  }
  // Horloge client en avance sur le serveur : âge borné à 0, jamais négatif.
  const ageMs = Math.max(0, maintenant.getTime() - fraicheur.getTime());
  const secondes = Math.floor(ageMs / 1000);
  if (secondes < SECONDES_PAR_MINUTE) {
    return `synchronisé il y a ${secondes} s`;
  }
  const minutes = Math.floor(secondes / SECONDES_PAR_MINUTE);
  if (minutes < MINUTES_PAR_HEURE) {
    return `synchronisé il y a ${minutes} min`;
  }
  return `synchronisé il y a ${Math.floor(minutes / MINUTES_PAR_HEURE)} h`;
}

/**
 * Libellé de fraîcheur du tableau de bord complet : sans édition configurée,
 * le libellé le DIT (« aucune édition configurée ») — distinct de « aucune
 * donnée reçue » (édition en place, zéro scan). Le discriminant vient de
 * l'état servi (edition: null), jamais d'une devinette client.
 */
export function libelleEtatCourse(
  etat: Pick<EtatCourse, 'edition' | 'fraicheur'>,
  maintenant: Date,
): string {
  if (etat.edition === null) {
    return 'aucune édition configurée';
  }
  return libellerFraicheurCourse(etat.fraicheur, maintenant);
}

/** État UI du tableau de bord : dernier état reçu + drapeau d'échec réseau. */
export interface EtatPolling {
  etat: EtatCourse;
  enEchec: boolean;
}

/**
 * Fusion polling/échec (NFR-5) : un résultat remplace l'état ; un ÉCHEC
 * conserve le dernier état tel quel — jamais d'écran vide, jamais de figé
 * présenté comme vivant (la fraîcheur portée par l'état continue de
 * vieillir au rendu).
 */
export function appliquerResultatPolling(
  precedent: EtatPolling,
  resultat: { ok: true; etat: EtatCourse } | { ok: false },
): EtatPolling {
  if (resultat.ok) {
    return { etat: resultat.etat, enEchec: false };
  }
  return { etat: precedent.etat, enEchec: true };
}

/**
 * Interprète le corps brut de GET /api/admin/course/etat (pure, testée) :
 * seul un payload { ok: true, etat: non-null objet } est accepté — ok:false,
 * etat absent ou null, payload non objet → échec (le dernier état gagne).
 * Story 5.2 (revue) : `alertes` absent ou non-tableau (dérive serveur, proxy)
 * est normalisé en [] — le rendu du bloc n'en meurt JAMAIS.
 * Le résultat se branche DIRECTEMENT sur appliquerResultatPolling.
 */
export function interpreterReponseEtat(
  payload: unknown,
): { ok: true; etat: EtatCourse } | { ok: false } {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false };
  }
  const candidat = payload as { ok?: unknown; etat?: unknown };
  if (candidat.ok !== true) {
    return { ok: false };
  }
  if (typeof candidat.etat !== 'object' || candidat.etat === null) {
    return { ok: false };
  }
  const etat = candidat.etat as EtatCourse & { alertes?: unknown };
  return {
    ok: true,
    etat: { ...etat, alertes: Array.isArray(etat.alertes) ? etat.alertes : [] },
  };
}
