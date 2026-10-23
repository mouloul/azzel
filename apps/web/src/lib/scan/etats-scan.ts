import {
  DOSSARD_INCONNU_LABEL,
  RETRAIT_SCHEMA_VERSION,
  decoderPayloadEdossard,
  estRetraitValide,
  type CoureurAnnuaire,
  type RetraitTerrain,
} from '@azzel/shared';

import { ajouterRetrait } from '@/lib/idb-volontaires';

// Story 4.2 — logique PURE des trois états du voyant scan (FR-13 socle,
// UX-DR-7) : résolution d'un payload décodé contre l'index IndexedDB de
// l'annuaire + dédoublonnage de SESSION. Aucune dépendance au DOM ni au
// réseau : la page orchestre, ce module tranche.
//
// Le dédoublonnage (Map jeton → première lecture) est volontairement passé en
// paramètre et NON persisté : 4.3 (retrait) et 4.4 (passage) le remplaceront
// par leurs clés naturelles (retrait par coureur, passage par checkpoint) —
// le premier scan reste TOUJOURS la référence (AD-3).
//
// Story 4.3 — résolution du mode retrait : même mécanique, mais le
// dédoublonnage est PERSISTANT (outbox IndexedDB, toutes sessions confondues)
// et l'orchestrateur `traiterScanRetrait` sépare l'émission immédiate du
// voyant (jamais d'attente IDB, < 1 s) de l'append arrière-plan (rollback de
// l'index optimiste + note honnête si l'outbox refuse).

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

// ---------------------------------------------------------------------------
// Story 4.3 — résolution du mode RETRAIT (guichet, ~700 scans le jour J).
// Même mécanique que resoudreScan, mais le dédoublonnage est PERSISTANT :
// l'index vient de l'outbox IndexedDB (toutes sessions confondues) — un
// retrait déjà enregistré ressort en doublon avec l'heure du PREMIER retrait.
// ---------------------------------------------------------------------------

/** Résultat du mode retrait — mêmes trois états, horodatage dédié. */
export interface ResultatRetrait {
  etat: EtatScan;
  /** Coureur résolu (jamais pour l'état inconnu). */
  coureur?: CoureurAnnuaire;
  /** Dossard du coureur résolu. */
  dossard?: number;
  /** Doublon uniquement : horodatage du PREMIER retrait (le premier reste). */
  premierRetireA?: Date;
}

/**
 * Dédoublonnage persistant du retrait : jeton → horodatage du PREMIER retrait
 * en outbox (source : retraitsParJeton(), cross-session).
 */
export type RetraitsExistants = ReadonlyMap<string, Date>;

/**
 * Résout un payload décodé au guichet. Totale, jamais d'exception :
 *   - payload non-e1 ou jeton mal formé → inconnu ;
 *   - jeton absent de l'annuaire → inconnu (DOSSARD INCONNU — revérifier) ;
 *   - retrait déjà en outbox (toutes sessions confondues) → doublon,
 *     premierRetireA = le PREMIER retrait (AD-3) ;
 *   - sinon → succès.
 * Pur : RIEN n'est modifié ici — ni l'index, ni l'outbox.
 */
export function resoudreRetrait(
  payload: string,
  indexAnnuaire: ReadonlyMap<string, CoureurAnnuaire>,
  retraitsExistants: RetraitsExistants,
): ResultatRetrait {
  const jeton = decoderPayloadEdossard(payload);
  if (jeton === null) {
    return { etat: 'inconnu' };
  }
  const coureur = indexAnnuaire.get(jeton);
  if (coureur === undefined) {
    return { etat: 'inconnu' };
  }
  const premierRetireA = retraitsExistants.get(jeton);
  if (premierRetireA !== undefined) {
    return { etat: 'doublon', coureur, dossard: coureur.dossard, premierRetireA };
  }
  return { etat: 'succès', coureur, dossard: coureur.dossard };
}

/**
 * Au succès de résolution : l'événement `RetraitTerrain` à appendre dans
 * l'outbox (payload minimal, NFR-7 — jamais de nom en clair). Retourne
 * l'événement SANS rien écrire ni muter : la page append (ajouterRetrait)
 * puis met à jour son index — jamais de mutation cachée. Null pour un
 * doublon, un inconnu ou un contexte incomplet (appareilId/editionId
 * manquants) : rien à enregistrer.
 */
export function creerEvenementRetrait(
  resultat: ResultatRetrait,
  appareilId: string,
  editionId: string,
  horodatage: Date = new Date(),
): RetraitTerrain | null {
  if (resultat.etat !== 'succès' || resultat.coureur === undefined) {
    return null;
  }
  const retrait: RetraitTerrain = {
    version: RETRAIT_SCHEMA_VERSION,
    type: 'retrait',
    editionId,
    jeton: resultat.coureur.jeton,
    horodatage: horodatage.toISOString(),
    appareilId,
  };
  return estRetraitValide(retrait) ? retrait : null;
}

/**
 * Texte INTÉGRAL du voyant retrait (libellés dédiés 4.3) :
 *   succès  : « ✓ Dossard N — {prénom} · présent au départ »
 *   doublon : « ↻ DÉJÀ PASSÉ — retiré à HH:MM:SS » (heure du premier)
 *   inconnu : « ⚠ DOSSARD INCONNU — revérifier » (identique 4.2)
 * Succès sans coureur/dossard (donnée incohérente) : texte dégradé « ✓ présent
 * au départ » — la mention reste vraie, jamais « undefined » à l'écran.
 */
export function libelleVoyantRetrait(resultat: ResultatRetrait): string {
  switch (resultat.etat) {
    case 'succès':
      if (resultat.coureur === undefined || resultat.dossard === undefined) {
        return '✓ présent au départ';
      }
      return `✓ Dossard ${resultat.dossard} — ${resultat.coureur.prenom} · présent au départ`;
    case 'doublon':
      return resultat.premierRetireA !== undefined
        ? `↻ DÉJÀ PASSÉ — retiré à ${formatHeureVoyant(resultat.premierRetireA)}`
        : '↻ DÉJÀ PASSÉ';
    case 'inconnu':
      return `⚠ ${DOSSARD_INCONNU_LABEL} — revérifier`;
  }
}

// ---------------------------------------------------------------------------
// Story 4.3 (revue) — orchestration du scan retrait : course du double-scan.
// ---------------------------------------------------------------------------

/** Note d'honnêteté quand le retrait n'a PAS pu être enregistré sur l'appareil. */
export const NOTE_NON_ENREGISTRE = 'NON enregistré sur cet appareil';

/** Retour du traitement d'un scan retrait : résultat + note éventuelle. */
export interface RetourScanRetrait {
  resultat: ResultatRetrait;
  /** Présente si l'événement n'est PAS enregistré sur cet appareil. */
  note?: string;
}

export interface TraitementScanRetrait {
  /**
   * Émission immédiate (synchrone) : voyant + bip SANS attendre l'outbox —
   * la confirmation < 1 s ne dépend jamais d'IndexedDB.
   */
  retour: RetourScanRetrait;
  /** Achèvement de l'append arrière-plan : note de refus le cas échéant. */
  termine: Promise<RetourScanRetrait>;
}

/**
 * Orchestration d'un scan retrait :
 *   1. résout SYNCHRONEMENT (succès / doublon du premier / inconnu) ;
 *   2. au succès enregistrable, met à jour l'index de dédoublonnage de façon
 *      OPTIMISTE — un double-scan immédiat ressort en doublon sans attendre
 *      l'outbox (le PREMIER reste la référence, AD-3) ;
 *   3. émet immédiatement le retour (voyant + bip) ;
 *   4. append en arrière-plan (`ajouter`, injectable) ; refus → ROLLBACK de
 *      l'optimisme (uniquement si l'entrée est encore la nôtre) + note
 *      « NON enregistré sur cet appareil ».
 * Doublon et inconnu : retour définitif immédiat, AUCUN append. Contexte
 * incomplet (appareilId/editionId absents) : note immédiate, aucun append.
 */
export function traiterScanRetrait(
  payload: string,
  indexAnnuaire: ReadonlyMap<string, CoureurAnnuaire>,
  retraitsExistants: Map<string, Date>,
  appareilId: string | null,
  editionId: string | null,
  maintenant: Date,
  ajouter: (retrait: RetraitTerrain) => Promise<boolean> = ajouterRetrait,
): TraitementScanRetrait {
  const resultat = resoudreRetrait(payload, indexAnnuaire, retraitsExistants);

  if (resultat.etat !== 'succès') {
    // Doublon (l'index a déjà tranché) ou inconnu : rien à enregistrer.
    const retour: RetourScanRetrait = { resultat };
    return { retour, termine: Promise.resolve(retour) };
  }

  const evenement =
    appareilId !== null && editionId !== null
      ? creerEvenementRetrait(resultat, appareilId, editionId, maintenant)
      : null;
  if (evenement === null) {
    // IDB indisponible au chargement (appareilId null) ou événement hors
    // contrat : succès affiché SANS mensonge, aucun append possible.
    const retour: RetourScanRetrait = { resultat, note: NOTE_NON_ENREGISTRE };
    return { retour, termine: Promise.resolve(retour) };
  }

  // Optimisme : le premier retrait reste la référence (jamais écrasé par un
  // horodatage plus tardif).
  const precedent = retraitsExistants.get(evenement.jeton);
  if (precedent === undefined || maintenant.getTime() < precedent.getTime()) {
    retraitsExistants.set(evenement.jeton, maintenant);
  }

  // Émission immédiate : le voyant part AVANT l'append.
  const retour: RetourScanRetrait = { resultat };

  // Append arrière-plan : refus → rollback (si l'entrée est encore la nôtre)
  // + note d'honnêteté.
  const refuser = (): RetourScanRetrait => {
    if (retraitsExistants.get(evenement.jeton)?.getTime() === maintenant.getTime()) {
      retraitsExistants.delete(evenement.jeton);
    }
    return { resultat, note: NOTE_NON_ENREGISTRE };
  };
  const termine = ajouter(evenement).then(
    (enregistre): RetourScanRetrait => (enregistre ? { resultat } : refuser()),
    refuser,
  );

  return { retour, termine };
}
