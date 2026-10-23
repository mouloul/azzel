import { formatLocalHeure } from '@azzel/shared';

import type { AlerteCourseSerde } from '@/modules/chrono/service';

// Story 5.2 — dérivations d'affichage des alertes hors-délais (calque
// fraicheur-course : fonctions pures, testées hors effets). L'identité et le
// calcul vivent côté SERVEUR (etatCourse) ; ici ne reste que la mise en
// forme : libellé « depuis HH:MM » en heure LOCALE, tri dossard croissant,
// action « Appeler le secteur » (tel: normalisé ou libellé inactif).

/** Heure d'attente avant le montage client (jamais l'heure du serveur). */
export const HEURE_ALERTE_ATTENTE = '--:--';

/** Libellé « depuis » AVANT montage client : heure locale pas encore calculable. */
export function libelleDepuisAttente(): string {
  return `depuis ${HEURE_ALERTE_ATTENTE}`;
}

/** Libellé inactif quand le secteur du checkpoint n'a pas de contact PC. */
export const LIBELLE_CONTACT_NON_RENSEIGNE = 'Appeler le secteur — contact du secteur non renseigné';

/** Libellé de l'action abandon : présente mais désactivée jusqu'à la saisie des abandons. */
export const LIBELLE_ABANDON_A_VENIR = 'Saisir l’abandon — bientôt disponible';

/** Note « aucune alerte » : la place de l'alerte batterie (suivi GPS) est dite, sans numéro de story. */
export const NOTE_SANS_ALERTE =
  'Aucune alerte hors-délais — l’alerte batterie des coureurs suivis arrive avec le suivi GPS.';

/**
 * « depuis HH:MM » — heure LOCALE de la barrière. L'heure n'est calculée
 * qu'après montage client (pattern board 5.1 : aucun écart de fuseau masqué
 * par l'hydratation) ; un ISO illisible retombe sur l'emplacement d'attente.
 */
export function libelleDepuisBarriere(barriereLeIso: string): string {
  const date = new Date(barriereLeIso);
  if (Number.isNaN(date.getTime())) {
    return `depuis ${HEURE_ALERTE_ATTENTE}`;
  }
  return `depuis ${formatLocalHeure(barriereLeIso)}`;
}

/** Copie triée dossard CROISSANT (tie-break checkpointId, ordre stable). */
export function trierAlertesCourse<T extends { dossard: number; checkpointId: string }>(
  alertes: T[],
): T[] {
  return [...alertes].sort(
    (a, b) => a.dossard - b.dossard || a.checkpointId.localeCompare(b.checkpointId),
  );
}

/**
 * Lien `tel:` du contact secteur ou null : espaces/points/tirets retirés (un
 * `tel:` ne transporte que des chiffres et le + initial) et AU MOINS UN
 * CHIFFRE exigé (un `tel:+` nu n'appelle personne) ; contact absent, muet ou
 * sans chiffre → null (l'UI affiche alors le libellé inactif, jamais un lien
 * mort).
 */
export function lienAppelerSecteur(contact: string | null): string | null {
  if (contact === null) {
    return null;
  }
  const chiffres = contact.replace(/[^+0-9]/g, '');
  return /[0-9]/.test(chiffres) ? `tel:${chiffres}` : null;
}

/** Ligne d'alerte intégrale (UX-DR-12 : le texte porte l'alerte, jamais la couleur seule). */
export function libelleAlerte(
  alerte: Pick<AlerteCourseSerde, 'dossard' | 'checkpointTitre'>,
  depuis: string,
): string {
  return `⚠ Dossard ${alerte.dossard} — pas vu à ${alerte.checkpointTitre} ${depuis}`;
}
