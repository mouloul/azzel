import {
  DOSSARD_INCONNU_LABEL,
  decoderPayloadEdossard,
  type CoureurAnnuaire,
} from '@azzel/shared';

// Story 4.2 — logique PURE des trois états du voyant scan (FR-13 socle,
// UX-DR-7) : résolution d'un payload décodé contre l'index IndexedDB de
// l'annuaire + dédoublonnage de SESSION. Aucune dépendance au DOM ni au
// réseau : la page orchestre, ce module tranche.
//
// Le dédoublonnage (Map jeton → première lecture) est volontairement passé en
// paramètre et NON persisté : 4.3 (retrait) et 4.4 (passage) le remplaceront
// par leurs clés naturelles (retrait par coureur, passage par checkpoint) —
// le premier scan reste TOUJOURS la référence (AD-3).

/** Les trois états du voyant — littéraux exacts de la spécification. */
export type EtatScan = 'succès' | 'doublon' | 'inconnu';

/** Dédoublonnage de session : jeton → date de la PREMIÈRE lecture (en mémoire). */
export type DejaVus = ReadonlyMap<string, Date>;

export interface ResultatScan {
  etat: EtatScan;
  /** Coureur résolu (jamais pour l'état inconnu). */
  coureur?: CoureurAnnuaire;
  /** Dossard du coureur résolu. */
  dossard?: number;
  /** Doublon uniquement : horodatage de la première lecture (le premier reste). */
  premierVuA?: Date;
}

/** Heure mono HH:MM:SS du voyant — heure de l'APPAREIL, jamais un temps de classement (AD-3). */
export function formatHeureVoyant(date: Date): string {
  const deuxChiffres = (valeur: number): string => String(valeur).padStart(2, '0');
  return `${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}:${deuxChiffres(date.getSeconds())}`;
}

/**
 * Résout un payload décodé. Totale, jamais d'exception :
 *   - payload non-e1 ou jeton mal formé → inconnu ;
 *   - jeton absent de l'annuaire → inconnu (DOSSARD INCONNU — revérifier) ;
 *   - jeton déjà vu EN SESSION → doublon, premierVuA = la première lecture ;
 *   - sinon → succès.
 * La Map dejaVus n'est JAMAIS modifiée ici : l'appelant enregistre le jeton
 * après un succès (c'est lui qui possède le cycle de vie de la session).
 */
export function resoudreScan(
  payload: string,
  indexAnnuaire: ReadonlyMap<string, CoureurAnnuaire>,
  dejaVus: DejaVus,
): ResultatScan {
  const jeton = decoderPayloadEdossard(payload);
  if (jeton === null) {
    return { etat: 'inconnu' };
  }
  const coureur = indexAnnuaire.get(jeton);
  if (coureur === undefined) {
    return { etat: 'inconnu' };
  }
  const premierVuA = dejaVus.get(jeton);
  if (premierVuA !== undefined) {
    return { etat: 'doublon', coureur, dossard: coureur.dossard, premierVuA };
  }
  return { etat: 'succès', coureur, dossard: coureur.dossard };
}

/**
 * Résout PUIS enregistre (revue) : le câblage exact du scanner — au premier
 * succès, le jeton entre dans la Map de session avec `maintenant` ; les
 * lectures suivantes du même jeton ressortiront en doublon avec CETTE heure.
 * Pur : la Map fournie est mutée, rien d'autre ; inconnu → rien d'enregistré.
 */
export function resoudreEtEnregistrer(
  payload: string,
  indexAnnuaire: ReadonlyMap<string, CoureurAnnuaire>,
  dejaVus: Map<string, Date>,
  maintenant: Date = new Date(),
): ResultatScan {
  const resultat = resoudreScan(payload, indexAnnuaire, dejaVus);
  if (resultat.etat === 'succès') {
    const jeton = decoderPayloadEdossard(payload);
    if (jeton !== null) {
      dejaVus.set(jeton, maintenant);
    }
  }
  return resultat;
}

/**
 * Texte INTÉGRAL du voyant (jamais la couleur seule) — libellés exacts :
 *   succès  : « ✓ Dossard N — {prénom} »
 *   doublon : « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS »
 *   inconnu : « ⚠ DOSSARD INCONNU — revérifier »
 * Doublon sans premierVuA (donnée incohérente) : texte SANS heure — le bug de
 * données n'est pas masqué par un horodatage bidon.
 */
export function libelleVoyantScan(resultat: ResultatScan): string {
  switch (resultat.etat) {
    case 'succès':
      return `✓ Dossard ${resultat.dossard} — ${resultat.coureur?.prenom}`;
    case 'doublon':
      return resultat.premierVuA !== undefined
        ? `↻ DÉJÀ PASSÉ — vu à ${formatHeureVoyant(resultat.premierVuA)}`
        : '↻ DÉJÀ PASSÉ';
    case 'inconnu':
      return `⚠ ${DOSSARD_INCONNU_LABEL} — revérifier`;
  }
}
