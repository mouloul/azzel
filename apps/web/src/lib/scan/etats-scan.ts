import {
  DOSSARD_INCONNU_LABEL,
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  decoderPayloadEdossard,
  estPassageValide,
  estRetraitValide,
  type CoureurAnnuaire,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import { ajouterPassage, ajouterRetrait, cleIndexPassage } from '@/lib/idb-volontaires';

// Story 4.2 — logique PURE des états du voyant scan (FR-13 socle, UX-DR-7).
// Aucune dépendance au DOM ni au réseau : la page orchestre, ce module
// tranche. Les modes persistants 4.3 (retrait) et 4.4 (passage) ont remplacé
// le dédoublonnage de session 4.2 par leurs clés naturelles persistées — le
// premier scan reste TOUJOURS la référence (AD-3).
//
// Story 4.3 — résolution du mode retrait : dédoublonnage PERSISTANT (outbox
// IndexedDB, toutes sessions confondues) et orchestrateur `traiterScanRetrait`
// qui sépare l'émission immédiate du voyant (jamais d'attente IDB, < 1 s) de
// l'append arrière-plan (rollback de l'index optimiste + note honnête si
// l'outbox refuse).
//
// Story 4.4 — résolution du mode passage : même gabarit que le retrait, mais
// le dédoublonnage est la PAIRE coureur × checkpoint (index outbox
// `${jeton}:${checkpointId}`) — même coureur à un AUTRE checkpoint est un
// NOUVEAU succès (passage distinct, clé naturelle AD-6/AD-8).

/** Les trois états du voyant — littéraux exacts de la spécification. */
export type EtatScan = 'succès' | 'doublon' | 'inconnu';

/** Heure mono HH:MM:SS du voyant — heure de l'APPAREIL, jamais un temps de classement (AD-3). */
export function formatHeureVoyant(date: Date): string {
  const deuxChiffres = (valeur: number): string => String(valeur).padStart(2, '0');
  return `${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}:${deuxChiffres(date.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Story 4.3 — résolution du mode RETRAIT (guichet, ~700 scans le jour J).
// Le dédoublonnage est PERSISTANT : l'index vient de l'outbox IndexedDB
// (toutes sessions confondues) — un retrait déjà enregistré ressort en
// doublon avec l'heure du PREMIER retrait.
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

// ---------------------------------------------------------------------------
// Story 4.4 — résolution + orchestration du mode PASSAGE (checkpoints).
// ---------------------------------------------------------------------------

/** Résultat du mode passage — mêmes trois états, horodatage dédié. */
export interface ResultatPassage {
  etat: EtatScan;
  /** Coureur résolu (jamais pour l'état inconnu). */
  coureur?: CoureurAnnuaire;
  /** Dossard du coureur résolu. */
  dossard?: number;
  /** Doublon uniquement : horodatage du PREMIER passage à CE checkpoint. */
  premierPasseA?: Date;
  /**
   * Clé composite `${jeton}:${checkpointId}` du doublon (ou du refus d'append
   * d'un succès devenue doublon optimiste) : le client s'en sert pour
   * rattacher la note « NON enregistré » d'un append antérieur au voyant
   * doublon du MÊME coureur×checkpoint, même après un rescan (garde de
   * séquence contournée légitimement).
   */
  cleComposite?: string;
}

/**
 * Dédoublonnage persistant du passage : `${jeton}:${checkpointId}` →
 * horodatage du PREMIER passage (source : passagesParJetonCheckpoint(),
 * cross-session). Seule la PAIRE dédoublonne — jamais le coureur seul.
 */
export type PassagesExistants = ReadonlyMap<string, Date>;

/**
 * Résout un payload décodé au checkpoint. Totale, jamais d'exception :
 *   - payload non-e1 ou jeton mal formé → inconnu ;
 *   - jeton absent de l'annuaire → inconnu (DOSSARD INCONNU — revérifier) ;
 *   - paire (coureur, checkpoint) déjà en outbox → doublon, premierPasseA =
 *     le PREMIER passage (AD-3) ;
 *   - sinon → succès — y compris si le coureur est déjà passé à un AUTRE
 *     checkpoint (passage distinct, clé naturelle AD-6/AD-8).
 * Pur : RIEN n'est modifié ici — ni l'index, ni l'outbox.
 */
export function resoudrePassage(
  payload: string,
  indexAnnuaire: ReadonlyMap<string, CoureurAnnuaire>,
  passagesExistants: PassagesExistants,
  checkpointId: string,
): ResultatPassage {
  const jeton = decoderPayloadEdossard(payload);
  if (jeton === null) {
    return { etat: 'inconnu' };
  }
  const coureur = indexAnnuaire.get(jeton);
  if (coureur === undefined) {
    return { etat: 'inconnu' };
  }
  const premierPasseA = passagesExistants.get(cleIndexPassage(jeton, checkpointId));
  if (premierPasseA !== undefined) {
    return {
      etat: 'doublon',
      coureur,
      dossard: coureur.dossard,
      premierPasseA,
      cleComposite: cleIndexPassage(jeton, checkpointId),
    };
  }
  return { etat: 'succès', coureur, dossard: coureur.dossard };
}

/**
 * Au succès de résolution : l'événement `PassageTerrain` à appendre dans
 * l'outbox (payload minimal, NFR-7 — jamais de nom en clair). Retourne
 * l'événement SANS rien écrire ni muter : la page append (ajouterPassage)
 * puis met à jour son index — jamais de mutation cachée. Null pour un
 * doublon, un inconnu ou un contexte incomplet : rien à enregistrer.
 */
export function creerEvenementPassage(
  resultat: ResultatPassage,
  appareilId: string,
  editionId: string,
  checkpointId: string,
  horodatage: Date = new Date(),
): PassageTerrain | null {
  if (resultat.etat !== 'succès' || resultat.coureur === undefined) {
    return null;
  }
  const passage: PassageTerrain = {
    version: PASSAGE_SCHEMA_VERSION,
    type: 'passage',
    editionId,
    jeton: resultat.coureur.jeton,
    checkpointId,
    horodatage: horodatage.toISOString(),
    appareilId,
  };
  return estPassageValide(passage) ? passage : null;
}

/**
 * Texte INTÉGRAL du voyant passage (libellés exacts FR-13) :
 *   succès  : « ✓ Passage enregistré — dossard N · HH:MM:SS » (heure appareil
 *             DANS le libellé — donnée brute, AD-3, jamais un temps de
 *             classement)
 *   doublon : « ↻ DÉJÀ PASSÉ — vu à HH:MM:SS » (heure du PREMIER passage)
 *   inconnu : « ⚠ DOSSARD INCONNU — revérifier » (identique 4.2/4.3)
 * Succès sans coureur/dossard (donnée incohérente) : texte dégradé SANS
 * dossard — jamais « undefined » à l'écran. Doublon sans premierPasseA :
 * texte SANS heure, pas d'horaire bidon.
 */
export function libelleVoyantPassage(resultat: ResultatPassage, heureScan: Date): string {
  switch (resultat.etat) {
    case 'succès':
      return resultat.dossard !== undefined
        ? `✓ Passage enregistré — dossard ${resultat.dossard} · ${formatHeureVoyant(heureScan)}`
        : `✓ Passage enregistré · ${formatHeureVoyant(heureScan)}`;
    case 'doublon':
      return resultat.premierPasseA !== undefined
        ? `↻ DÉJÀ PASSÉ — vu à ${formatHeureVoyant(resultat.premierPasseA)}`
        : '↻ DÉJÀ PASSÉ';
    case 'inconnu':
      return `⚠ ${DOSSARD_INCONNU_LABEL} — revérifier`;
  }
}

/** Retour du traitement d'un scan passage : résultat + note éventuelle. */
export interface RetourScanPassage {
  resultat: ResultatPassage;
  /** Présente si l'événement n'est PAS enregistré sur cet appareil. */
  note?: string;
}

export interface TraitementScanPassage {
  /**
   * Émission immédiate (synchrone) : voyant + bip SANS attendre l'outbox —
   * la confirmation < 1 s ne dépend jamais d'IndexedDB.
   */
  retour: RetourScanPassage;
  /** Achèvement de l'append arrière-plan : note de refus le cas échéant. */
  termine: Promise<RetourScanPassage>;
}

/**
 * Orchestration d'un scan passage (gabarit traiterScanRetrait) :
 *   1. résout SYNCHRONEMENT contre le checkpoint en cours (succès / doublon
 *      du premier à CE checkpoint / inconnu) ;
 *   2. au succès enregistrable, met à jour l'index `${jeton}:${checkpointId}`
 *      de façon OPTIMISTE — un double-scan immédiat ressort en doublon sans
 *      attendre l'outbox (le PREMIER reste la référence, AD-3) ;
 *   3. émet immédiatement le retour (voyant + bip) ;
 *   4. append en arrière-plan (`ajouter`, injectable) ; refus → ROLLBACK de
 *      l'optimisme (uniquement si l'entrée est encore la nôtre) + note
 *      « NON enregistré sur cet appareil ».
 * Doublon et inconnu : retour définitif immédiat, AUCUN append. Contexte
 * incomplet (checkpointId/appareilId/editionId absents) : note immédiate,
 * aucun append — jamais de mensonge.
 */
export function traiterScanPassage(
  payload: string,
  indexAnnuaire: ReadonlyMap<string, CoureurAnnuaire>,
  passagesExistants: Map<string, Date>,
  checkpointId: string | null,
  appareilId: string | null,
  editionId: string | null,
  maintenant: Date,
  ajouter: (passage: PassageTerrain) => Promise<boolean> = ajouterPassage,
): TraitementScanPassage {
  // Sans mission scan (défense en profondeur — la page gâte déjà le mode),
  // la clé composite n'existe pas : résolution quand même pour le voyant.
  const resultat = resoudrePassage(
    payload,
    indexAnnuaire,
    passagesExistants,
    checkpointId ?? '',
  );

  if (resultat.etat !== 'succès') {
    // Doublon (l'index a déjà tranché) ou inconnu : rien à enregistrer.
    const retour: RetourScanPassage = { resultat };
    return { retour, termine: Promise.resolve(retour) };
  }

  const evenement =
    checkpointId !== null && appareilId !== null && editionId !== null
      ? creerEvenementPassage(resultat, appareilId, editionId, checkpointId, maintenant)
      : null;
  if (evenement === null) {
    // Mission/appareil/édition indisponibles ou événement hors contrat :
    // succès affiché SANS mensonge, aucun append possible.
    const retour: RetourScanPassage = { resultat, note: NOTE_NON_ENREGISTRE };
    return { retour, termine: Promise.resolve(retour) };
  }

  // Optimisme : le premier passage reste la référence (jamais écrasé par un
  // horodatage plus tardif).
  const cle = cleIndexPassage(evenement.jeton, evenement.checkpointId);
  const precedent = passagesExistants.get(cle);
  if (precedent === undefined || maintenant.getTime() < precedent.getTime()) {
    passagesExistants.set(cle, maintenant);
  }

  // Émission immédiate : le voyant part AVANT l'append.
  const retour: RetourScanPassage = { resultat };

  // Append arrière-plan : refus → rollback (si l'entrée est encore la nôtre)
  // + note d'honnêteté. La clé composite voyage avec le refus : un rescan
  // affiché « DÉJÀ PASSÉ » pendant que l'append échouait pourra recevoir la
  // note (le voyant doublon porte la même clé).
  const refuser = (): RetourScanPassage => {
    if (passagesExistants.get(cle)?.getTime() === maintenant.getTime()) {
      passagesExistants.delete(cle);
    }
    return { resultat: { ...resultat, cleComposite: cle }, note: NOTE_NON_ENREGISTRE };
  };
  const termine = ajouter(evenement).then(
    (enregistre): RetourScanPassage => (enregistre ? { resultat } : refuser()),
    refuser,
  );

  return { retour, termine };
}
