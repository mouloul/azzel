import {
  cleIdempotenceEvenement,
  cleIdempotencePassage,
  cleIdempotenceRetrait,
  estAnnuaireValide,
  estEvenementTerrainValide,
  estPassageValide,
  estRetraitValide,
  nowIsoUtc,
  type AnnuaireEdition,
  type EvenementSyncTerrain,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import type { MissionVolontaireView } from '@/modules/missions/service';

// Stories 3.3/3.4/4.3/4.4/4.5 — persistance IndexedDB de la poche
// volontaires. Une base nommée + versionnée : v1 = store « etat » (fiche
// missions), v2 = store « annuaire » (réplique des coureurs), v3 = stores
// « outbox » (événements terrain append-only : retraits 4.3 ET passages 4.4,
// préfixes de clé distincts) + « appareil » (identifiant d'appareil stable)
// — chaque upgrade crée SANS toucher les stores précédents.
//
// v4 (story 4.5) : stores « envoyes » (marquage d'envoi PAR CLÉ, dans SON
// store — l'outbox demeure append-only immuable, AD-2/AD-8) et « journal »
// (journal sync borné ~100 entrées : lots, acceptés/doublons/rejets, offsets
// horloge). L'appareil enregistre aussi son jeton de canal sync dans le store
// « appareil » (AD-5).
//
// L'outbox appartient à l'APPAREIL (AD-5) : il survit à la déconnexion (la
// purge logout vide etat/annuaire mais CONSERVE outbox/appareil/envoyes/
// journal). Append-only strict (AD-2, AD-8) : insertion (add, clé
// d'idempotence en keyPath → un doublon physique est impossible) et lecture
// uniquement — jamais de mutation ni de suppression locale ; le marquage
// d'envoi vit dans le store « envoyes », jamais dans l'outbox.
//
// SSR-safe : sans indexedDB (serveur, vieux navigateur, mode privé iOS qui
// jette), lire renvoie null/vide et écrire renvoie false — le rendu serveur
// reste le plan A, jamais d'écran vide pour un échec de stockage.

export const IDB_NOM_BASE = 'azzel-volontaires';
export const IDB_VERSION = 4;
export const IDB_STORE_ETAT = 'etat';
export const IDB_STORE_ANNUAIRE = 'annuaire';
export const IDB_STORE_OUTBOX = 'outbox';
export const IDB_STORE_APPAREIL = 'appareil';
export const IDB_STORE_ENVOYES = 'envoyes';
export const IDB_STORE_JOURNAL = 'journal';
export const IDB_CLE_COURANT = 'courant';

/** Préfixe des caches du service worker volontaires (voir public/sw-volontaires.js). */
export const PREFIXE_CACHES_VOLONTAIRES = 'az-volontaires-';

/** Réponse de GET /api/volontaires/etat — exactement ce qui est persisté. */
export interface EtatVolontaires {
  /**
   * Revue 3.3 (D1) — compte propriétaire de la fiche : la poche est liée au
   * COMPTE (appareil partagé), jamais servie à un autre volontaire.
   */
  accountId: string;
  editionNom: string | null;
  assistancePhone: string;
  mesMissions: MissionVolontaireView[];
  missions: MissionVolontaireView[];
  generéA: string;
}

interface EnregistrementEtat extends EtatVolontaires {
  id: typeof IDB_CLE_COURANT;
}

interface EnregistrementAnnuaire extends AnnuaireEdition {
  id: typeof IDB_CLE_COURANT;
}

function estDateIso(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && Number.isFinite(new Date(valeur).getTime());
}

function estChaineOuNull(valeur: unknown): valeur is string | null {
  return valeur === null || typeof valeur === 'string';
}

/**
 * Revue 3.3 — garde d'une mission : chaque champ lu par le rendu est vérifié
 * (un `debutLe` invalide ferait jeter le formatage Intl → page blanche
 * hors-ligne). Les champs non rendus (estArrivee, couvertureLabel) restent
 * libres : une fiche d'une époque antérieure reste lisible.
 */
function estMissionVolontaire(valeur: unknown): valeur is MissionVolontaireView {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const mission = valeur as Record<string, unknown>;
  return (
    typeof mission.id === 'string' &&
    typeof mission.titre === 'string' &&
    typeof mission.type === 'string' &&
    typeof mission.typeLabel === 'string' &&
    typeof mission.secteurNom === 'string' &&
    estChaineOuNull(mission.secteurLieu) &&
    estChaineOuNull(mission.secteurContact) &&
    estChaineOuNull(mission.consignes) &&
    typeof mission.couverture === 'string' &&
    estDateIso(mission.debutLe) &&
    estDateIso(mission.finLe)
  );
}

/**
 * Garde de schéma : la base (ou le réseau, ou le cache SW) peut porter un
 * état d'une autre époque ou hors contrat — seul un état de la bonne forme,
 * missions comprises, alimente le rendu, sinon rejet (jamais de fiche cassée
 * à l'écran).
 */
export function estEtatVolontaires(valeur: unknown): valeur is EtatVolontaires {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    typeof candidat.accountId === 'string' &&
    candidat.accountId.length > 0 &&
    estChaineOuNull(candidat.editionNom) &&
    typeof candidat.assistancePhone === 'string' &&
    Array.isArray(candidat.mesMissions) &&
    candidat.mesMissions.every(estMissionVolontaire) &&
    Array.isArray(candidat.missions) &&
    candidat.missions.every(estMissionVolontaire) &&
    estDateIso(candidat.generéA)
  );
}

function indexedDbDisponible(): boolean {
  return typeof indexedDB !== 'undefined';
}

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(IDB_NOM_BASE, IDB_VERSION);
    requete.onupgradeneeded = () => {
      // Upgrades successifs, chacun crée ses stores SANS toucher aux
      // précédents ; une base neuve repart avec tous les stores d'un coup.
      // v3 : « outbox » (keyPath = clé d'idempotence du contrat terrain —
      // l'append d'une clé existante est un no-op physique) + « appareil »
      // (identifiant stable, clé « courant »).
      // v4 (story 4.5) : « envoyes » (keyPath = même clé d'idempotence, le
      // marquage d'envoi vit ICI, hors outbox) + « journal » (append borné).
      const base = requete.result;
      if (!base.objectStoreNames.contains(IDB_STORE_ETAT)) {
        base.createObjectStore(IDB_STORE_ETAT, { keyPath: 'id' });
      }
      if (!base.objectStoreNames.contains(IDB_STORE_ANNUAIRE)) {
        base.createObjectStore(IDB_STORE_ANNUAIRE, { keyPath: 'id' });
      }
      if (!base.objectStoreNames.contains(IDB_STORE_OUTBOX)) {
        base.createObjectStore(IDB_STORE_OUTBOX, { keyPath: 'cle' });
      }
      if (!base.objectStoreNames.contains(IDB_STORE_APPAREIL)) {
        base.createObjectStore(IDB_STORE_APPAREIL, { keyPath: 'id' });
      }
      if (!base.objectStoreNames.contains(IDB_STORE_ENVOYES)) {
        base.createObjectStore(IDB_STORE_ENVOYES, { keyPath: 'cle' });
      }
      if (!base.objectStoreNames.contains(IDB_STORE_JOURNAL)) {
        base.createObjectStore(IDB_STORE_JOURNAL, { keyPath: 'id' });
      }
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error('IndexedDB indisponible'));
    requete.onblocked = () => reject(new Error('IndexedDB bloquée par un autre onglet'));
  });
}

function promettreRequete<T>(requete: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error('IndexedDB indisponible'));
  });
}

/**
 * Revue 3.3 — une écriture n'est acquise qu'au `complete` de la transaction :
 * le succès du `put` ne suffit pas (un abort ultérieur — quota — annule tout).
 */
function promettreTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB indisponible'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('transaction IndexedDB annulée'));
  });
}

async function avecStore<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await ouvrirBase();
  try {
    const transaction = base.transaction(store, mode);
    const terminee = mode === 'readwrite' ? promettreTransaction(transaction) : null;
    const resultat = promettreRequete(operation(transaction.objectStore(store)));
    if (terminee !== null) {
      await Promise.all([resultat, terminee]);
    }
    return await resultat;
  } finally {
    base.close();
  }
}

/** Dernier état persisté, null si jamais synchronisé (ou stockage absent). */
export async function lireEtatVolontaires(): Promise<EtatVolontaires | null> {
  if (!indexedDbDisponible()) {
    return null;
  }
  try {
    const enregistrement = await avecStore<EnregistrementEtat | undefined>(
      IDB_STORE_ETAT,
      'readonly',
      (store) => store.get(IDB_CLE_COURANT) as IDBRequest<EnregistrementEtat | undefined>,
    );
    if (!estEtatVolontaires(enregistrement)) {
      return null;
    }
    const { id: _id, ...etat } = enregistrement;
    return etat;
  } catch {
    return null;
  }
}

/**
 * Écrit l'état fraîchement synchronisé. Renvoie false (jamais d'exception) si
 * le stockage est absent ou refuse — l'appelant affiche le rendu réseau.
 */
export async function ecrireEtatVolontaires(etat: EtatVolontaires): Promise<boolean> {
  if (!indexedDbDisponible()) {
    return false;
  }
  try {
    await avecStore(IDB_STORE_ETAT, 'readwrite', (store) =>
      store.put({ ...etat, id: IDB_CLE_COURANT } satisfies EnregistrementEtat),
    );
    return true;
  } catch {
    return false;
  }
}

/** Dernier annuaire persisté (contrat shared validé à la lecture), sinon null. */
export async function lireAnnuaire(): Promise<AnnuaireEdition | null> {
  if (!indexedDbDisponible()) {
    return null;
  }
  try {
    const enregistrement = await avecStore<EnregistrementAnnuaire | undefined>(
      IDB_STORE_ANNUAIRE,
      'readonly',
      (store) => store.get(IDB_CLE_COURANT) as IDBRequest<EnregistrementAnnuaire | undefined>,
    );
    if (!estAnnuaireValide(enregistrement)) {
      return null;
    }
    const { id: _id, ...annuaire } = enregistrement;
    return annuaire;
  } catch {
    return null;
  }
}

/**
 * Écrit la réplique fraîchement synchronisée — uniquement si elle respecte le
 * contrat (estAnnuaireValide) : la poche ne doit jamais contenir un annuaire
 * ambigu. Renvoie false (jamais d'exception) sinon.
 */
export async function ecrireAnnuaire(annuaire: AnnuaireEdition): Promise<boolean> {
  if (!indexedDbDisponible() || !estAnnuaireValide(annuaire)) {
    return false;
  }
  try {
    await avecStore(IDB_STORE_ANNUAIRE, 'readwrite', (store) =>
      store.put({ ...annuaire, id: IDB_CLE_COURANT } satisfies EnregistrementAnnuaire),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Purge de la poche à la déconnexion (appareil partagé) : vide les stores
 * « etat » ET « annuaire » ainsi que les caches du service worker
 * volontaires. Story 4.3 (AD-5) : l'outbox et l'appareilId appartiennent à
 * l'APPAREIL, pas au compte — ils sont explicitement CONSERVÉS (les
 * événements ne portent que des jetons opaques, NFR-7 ; 4.5 les videra au
 * retour du réseau). Silencieuse par construction (sans indexedDB/caches, ou
 * erreur) : la déconnexion ne doit jamais échouer pour ça.
 */
export async function effacerEtatVolontaires(): Promise<void> {
  if (indexedDbDisponible()) {
    for (const store of [IDB_STORE_ETAT, IDB_STORE_ANNUAIRE]) {
      try {
        await avecStore(store, 'readwrite', (objectStore) => objectStore.clear());
      } catch {
        // stockage refusé : la déconnexion continue.
      }
    }
  }
  if (typeof caches !== 'undefined') {
    try {
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter((nom) => nom.startsWith(PREFIXE_CACHES_VOLONTAIRES))
          .map((nom) => caches.delete(nom)),
      );
    } catch {
      // caches indisponibles (contexte non sécurisé) : rien à purger.
    }
  }
}

/**
 * Revue 3.3 (D1) — liaison de la poche au compte de la session : si la fiche
 * stockée appartient à un AUTRE compte (ou à aucun : enregistrement antérieur
 * à la liaison), fiche + annuaire + caches az-volontaires-* sont purgés AVANT
 * tout affichage (même purge que la déconnexion : outbox, appareilId, envoyés
 * et journal appartiennent à l'APPAREIL et restent). Renvoie true si une purge
 * a eu lieu. Sans stockage lisible : rien à lier, false.
 */
export async function lierPocheAuCompte(accountId: string): Promise<boolean> {
  if (!indexedDbDisponible()) {
    return false;
  }
  let enregistrement: unknown;
  try {
    enregistrement = await avecStore<unknown>(IDB_STORE_ETAT, 'readonly', (store) =>
      store.get(IDB_CLE_COURANT),
    );
  } catch {
    return false;
  }
  if (enregistrement === undefined) {
    return false;
  }
  const proprietaire =
    typeof enregistrement === 'object' && enregistrement !== null
      ? (enregistrement as { accountId?: unknown }).accountId
      : undefined;
  if (proprietaire === accountId) {
    return false;
  }
  await effacerEtatVolontaires();
  return true;
}

// ---------------------------------------------------------------------------
// Story 4.3 — outbox append-only (AD-2, AD-8) + identifiant d'appareil (AD-5).
// ---------------------------------------------------------------------------

interface EnregistrementOutbox extends RetraitTerrain {
  cle: string;
}

interface EnregistrementAppareil {
  id: typeof IDB_CLE_COURANT;
  appareilId: string;
  /** Story 4.5 — jeton du canal sync (Bearer), stocké BRUT côté appareil. */
  jetonSync?: string;
}

function genererAppareilId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Repli (contexte sans crypto.randomUUID) : entropie moindre mais stable et
  // suffisante pour distinguer un appareil scanneur.
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Identifiant d'appareil stable (AD-5) : généré UNE fois au premier appel,
 * persisté dans le store dédié, relu tel quel ensuite — il fonde la clé
 * d'idempotence du contrat retrait. La lecture ET l'écriture éventuelle
 * vivent dans UNE SEULE transaction readwrite : les transactions d'écriture
 * sur un même store sont sérialisées par IndexedDB (même entre connexions /
 * onglets), deux appels simultanés ne peuvent donc pas générer deux
 * identifiants. Null si le stockage est absent/refusé (SSR, mode privé) : le
 * scanneur affichera « NON enregistré ».
 */
export async function obtenirAppareilId(): Promise<string | null> {
  if (!indexedDbDisponible()) {
    return null;
  }
  let base: IDBDatabase;
  try {
    base = await ouvrirBase();
  } catch {
    return null;
  }
  try {
    return await new Promise<string>((resolve, reject) => {
      const transaction = base.transaction(IDB_STORE_APPAREIL, 'readwrite');
      const store = transaction.objectStore(IDB_STORE_APPAREIL);
      const lecture = store.get(IDB_CLE_COURANT) as IDBRequest<EnregistrementAppareil | undefined>;
      lecture.onsuccess = () => {
        const enregistrement = lecture.result;
        if (
          enregistrement !== undefined &&
          typeof enregistrement.appareilId === 'string' &&
          enregistrement.appareilId.length > 0
        ) {
          resolve(enregistrement.appareilId);
          return;
        }
        const appareilId = genererAppareilId();
        const ecriture = store.put({
          id: IDB_CLE_COURANT,
          appareilId,
        } satisfies EnregistrementAppareil);
        ecriture.onsuccess = () => resolve(appareilId);
        ecriture.onerror = () => reject(ecriture.error ?? new Error('IndexedDB indisponible'));
      };
      lecture.onerror = () => reject(lecture.error ?? new Error('IndexedDB indisponible'));
    });
  } catch {
    return null;
  } finally {
    base.close();
  }
}

/**
 * Append-only strict : insère le retrait avec sa clé d'idempotence en clé
 * primaire (`add`, pas `put` — JAMAIS de surécriture). Un événement de même
 * clé déjà présent (double scan, course entre onglets) est un no-op physique :
 * true sans second enregistrement. Renvoie false (jamais d'exception) si le
 * stockage est absent/refusé ou l'événement hors contrat.
 */
export async function ajouterRetrait(retrait: RetraitTerrain): Promise<boolean> {
  if (!indexedDbDisponible() || !estRetraitValide(retrait)) {
    return false;
  }
  const cle = cleIdempotenceRetrait(retrait.appareilId, retrait.editionId, retrait.jeton);
  try {
    await avecStore(IDB_STORE_OUTBOX, 'readwrite', (store) =>
      store.add({ ...retrait, cle } satisfies EnregistrementOutbox),
    );
    return true;
  } catch (erreur) {
    // Clé déjà présente : l'événement EST dans l'outbox (le premier reste la
    // référence, AD-3) — c'est un succès d'idempotence, pas un échec.
    if (
      typeof erreur === 'object' &&
      erreur !== null &&
      'name' in erreur &&
      (erreur as { name?: unknown }).name === 'ConstraintError'
    ) {
      return true;
    }
    return false;
  }
}

/** Tous les retraits de l'outbox (lecture seule, ordre de lecture IDB). */
export async function listerRetraits(): Promise<RetraitTerrain[]> {
  if (!indexedDbDisponible()) {
    return [];
  }
  try {
    const enregistrements = await avecStore<EnregistrementOutbox[]>(
      IDB_STORE_OUTBOX,
      'readonly',
      (store) => store.getAll() as IDBRequest<EnregistrementOutbox[]>,
    );
    // Défensif : un enregistrement d'une autre époque (ou corrompu) est
    // ignoré, il n'entrave jamais le dédoublonnage.
    return enregistrements
      .filter(estRetraitValide)
      .map(({ cle: _cle, ...retrait }) => retrait);
  } catch {
    return [];
  }
}

/**
 * Index de dédoublonnage PERSISTANT (cross-session, AD-3) : jeton →
 * horodatage du PREMIER retrait — si le même jeton existe en plusieurs
 * exemplaires (éditions successives), le plus ancien gagne.
 */
export async function retraitsParJeton(): Promise<Map<string, Date>> {
  const retraits = await listerRetraits();
  const index = new Map<string, Date>();
  for (const retrait of retraits) {
    const horodatage = new Date(retrait.horodatage);
    const precedent = index.get(retrait.jeton);
    if (precedent === undefined || horodatage.getTime() < precedent.getTime()) {
      index.set(retrait.jeton, horodatage);
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Story 4.4 — passages aux checkpoints : MÊME store outbox (aucune migration),
// préfixe de clé distinct (`passage:v1:`). Retraits et passages cohabitent sans
// interférer : chaque liste filtre par son garde de contrat (type exact).
// ---------------------------------------------------------------------------

interface EnregistrementOutboxPassage extends PassageTerrain {
  cle: string;
}

/**
 * Clé de l'index de dédoublonnage passage : `${jeton}:${checkpointId}` — le
 * doublon est la PAIRE coureur × checkpoint (FR-13) ; même coureur à un AUTRE
 * checkpoint est un passage distinct (succès). Pas d'editionId dans la clé :
 * le jeton e-dossard est globalement UNIQUE par coureur ET par édition
 * (l'annuaire l'exige, unicité vérifiée par estAnnuaireValide) — deux éditions
 * = deux jetons, aucune collision inter-éditions possible.
 */
export function cleIndexPassage(jeton: string, checkpointId: string): string {
  return `${jeton}:${checkpointId}`;
}

/**
 * Append-only strict (gabarit ajouterRetrait) : insère le passage avec sa clé
 * d'idempotence en clé primaire (`add`, jamais `put`). Même clé déjà présente
 * (double scan, course entre onglets) → no-op physique : true sans second
 * enregistrement. False (jamais d'exception) si stockage absent/refusé ou
 * événement hors contrat.
 */
export async function ajouterPassage(passage: PassageTerrain): Promise<boolean> {
  if (!indexedDbDisponible() || !estPassageValide(passage)) {
    return false;
  }
  const cle = cleIdempotencePassage(
    passage.appareilId,
    passage.editionId,
    passage.jeton,
    passage.checkpointId,
  );
  try {
    await avecStore(IDB_STORE_OUTBOX, 'readwrite', (store) =>
      store.add({ ...passage, cle } satisfies EnregistrementOutboxPassage),
    );
    return true;
  } catch (erreur) {
    // Clé déjà présente : l'événement EST dans l'outbox (le premier reste la
    // référence, AD-3) — succès d'idempotence, pas un échec.
    if (
      typeof erreur === 'object' &&
      erreur !== null &&
      'name' in erreur &&
      (erreur as { name?: unknown }).name === 'ConstraintError'
    ) {
      return true;
    }
    return false;
  }
}

/** Tous les passages de l'outbox (lecture seule, retraits exclus par contrat). */
export async function listerPassages(): Promise<PassageTerrain[]> {
  if (!indexedDbDisponible()) {
    return [];
  }
  try {
    const enregistrements = await avecStore<EnregistrementOutboxPassage[]>(
      IDB_STORE_OUTBOX,
      'readonly',
      (store) => store.getAll() as IDBRequest<EnregistrementOutboxPassage[]>,
    );
    // Défensif : retraits et enregistrements d'une autre époque cohabitant
    // dans le store sont ignorés — seul le contrat passage alimente l'index.
    return enregistrements
      .filter(estPassageValide)
      .map(({ cle: _cle, ...passage }) => passage);
  } catch {
    return [];
  }
}

/**
 * Index de dédoublonnage PERSISTANT du passage (cross-session, FR-13) :
 * `${jeton}:${checkpointId}` → horodatage du PREMIER passage — si la même
 * paire existe en plusieurs exemplaires (éditions successives), le plus
 * ancien gagne. Même coureur, checkpoint différent → entrées DISTINCTES.
 */
export async function passagesParJetonCheckpoint(): Promise<Map<string, Date>> {
  const passages = await listerPassages();
  const index = new Map<string, Date>();
  for (const passage of passages) {
    const horodatage = new Date(passage.horodatage);
    const cle = cleIndexPassage(passage.jeton, passage.checkpointId);
    const precedent = index.get(cle);
    if (precedent === undefined || horodatage.getTime() < precedent.getTime()) {
      index.set(cle, horodatage);
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Story 4.5 — sync par lots idempotents : marquage d'envoi (store DÉDIÉ,
// l'outbox reste immuable), compteur d'attente, journal sync borné, jeton du
// canal sync (AD-5). « déjà-connu » marque AUSSI envoyé : le serveur connaît
// l'événement, c'est tout ce qui compte.
// ---------------------------------------------------------------------------

interface EnregistrementEnvoye {
  cle: string;
  envoyeA: string;
}

/** Journal de terrain : fraîcheur et rejets, PAS un audit (borné ~100). */
export interface EntreeJournalSync {
  id: string;
  /** ISO UTC de la clôture du lot côté client. */
  horodatage: string;
  envoyes: number;
  dejaConnus: number;
  rejetes: number;
  /** Motifs des rejets du lot (« coureur inconnu », « contrat invalide »…). */
  motifs: string[];
  /** Offset horloge moyen du lot (ms, référence serveur recuA) — AD-3. */
  offsetMoyenMs: number | null;
}

/** Borne du journal sync : fraîcheur de terrain, l'audit vit côté serveur. */
export const JOURNAL_SYNC_MAX_ENTREES = 100;

/**
 * Événements de l'outbox NON ENCORE envoyés — filtre PARTAGÉ par la liste ET
 * le compteur du bandeau : contrat terrain validé ET clé stockée EXACTEMENT
 * celle du contrat shared. Un enregistrement à clé corrompue est ignoré des
 * DEUX côtés (il ne part jamais en lot ET ne gonfle jamais « N en attente »).
 * Lève en cas de stockage défaillant (absorbé par les deux garde-robes ci-
 * dessus selon qu'elles veulent distinguer l'échec ou non).
 */
async function collecterNonEnvoyes(): Promise<EvenementSyncTerrain[]> {
  const base = await ouvrirBase();
  try {
    const enregistrements = await promettreRequete(
      base.transaction(IDB_STORE_OUTBOX, 'readonly').objectStore(IDB_STORE_OUTBOX).getAll() as IDBRequest<
        { cle: string }[]
      >,
    );
    const envoyes = await promettreRequete(
      base
        .transaction(IDB_STORE_ENVOYES, 'readonly')
        .objectStore(IDB_STORE_ENVOYES)
        .getAll() as IDBRequest<EnregistrementEnvoye[]>,
    );
    const clesEnvoyes = new Set(envoyes.map((enregistrement) => enregistrement.cle));
    return enregistrements
      .filter(
        (enregistrement): enregistrement is EvenementSyncTerrain =>
          estEvenementTerrainValide(enregistrement) &&
          enregistrement.cle === cleIdempotenceEvenement(enregistrement) &&
          !clesEnvoyes.has(enregistrement.cle),
      )
      .map((enregistrement) => ({
        ...enregistrement,
        cle: cleIdempotenceEvenement(enregistrement),
      }));
  } finally {
    base.close();
  }
}

/**
 * Événements prêts pour un lot (même filtre que le compteur) ; échec de
 * stockage absorbé en liste vide.
 */
export async function listerEvenementsASynchroniser(): Promise<EvenementSyncTerrain[]> {
  if (!indexedDbDisponible()) {
    return [];
  }
  try {
    return await collecterNonEnvoyes();
  } catch {
    return [];
  }
}

/** État de la file pour le bandeau : distingue l’échec de comptage du vide. */
export interface EtatFileAttente {
  enAttente: number;
  /** true = stockage illisible — « Comptage impossible », pas « file : 0 ». */
  erreurStockage: boolean;
}

/**
 * Compteur d'attente du bandeau sync (UX-DR-8) AVEC signal d'erreur : le
 * stockage absent (SSR, vieux navigateur) reste un vide honnête ; un échec de
 * lecture alors qu'IndexedDB existe remonte erreurStockage.
 */
export async function lireEtatFileAttente(): Promise<EtatFileAttente> {
  if (!indexedDbDisponible()) {
    return { enAttente: 0, erreurStockage: false };
  }
  try {
    const evenements = await collecterNonEnvoyes();
    return { enAttente: evenements.length, erreurStockage: false };
  } catch {
    return { enAttente: 0, erreurStockage: true };
  }
}

/**
 * Compteur simple (même filtre que listerEvenementsASynchroniser — retraits ET
 * passages, clés corrompues ignorées des deux côtés).
 */
export async function compterEnAttente(): Promise<number> {
  return (await lireEtatFileAttente()).enAttente;
}

/**
 * UNE SEULE transaction pour tout le groupe d'écritures (vs une connexion par
 * clé) : les marquages d'un lot partent ensemble. Les requêtes sont attendues
 * individuellement — la transaction committe quand la dernière réussit.
 */
async function avecStoreGroupe(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => Promise<void>,
): Promise<void> {
  const base = await ouvrirBase();
  try {
    const transaction = base.transaction(store, mode);
    const terminee = mode === 'readwrite' ? promettreTransaction(transaction) : null;
    await Promise.all([operation(transaction.objectStore(store)), terminee]);
  } finally {
    base.close();
  }
}

/**
 * Marque des clés comme envoyées (dans LEUR store, en UNE transaction —
 * l'outbox n'est jamais touché). Renvoie false (jamais d'exception) si le
 * stockage est absent/refusé : le lot sera rejoué, idempotence côté serveur.
 */
export async function marquerEnvoyes(cles: string[]): Promise<boolean> {
  if (!indexedDbDisponible() || cles.length === 0) {
    return cles.length === 0;
  }
  try {
    const envoyeA = nowIsoUtc();
    await avecStoreGroupe(IDB_STORE_ENVOYES, 'readwrite', async (store) => {
      await Promise.all(
        cles.map((cle) =>
          promettreRequete(store.put({ cle, envoyeA } satisfies EnregistrementEnvoye)),
        ),
      );
    });
    return true;
  } catch {
    return false;
  }
}

/** Journal sync en lecture seule, du plus récent au plus ancien. */
export async function lireJournal(): Promise<EntreeJournalSync[]> {
  if (!indexedDbDisponible()) {
    return [];
  }
  try {
    const entrees = await avecStore<EntreeJournalSync[]>(
      IDB_STORE_JOURNAL,
      'readonly',
      (store) => store.getAll() as IDBRequest<EntreeJournalSync[]>,
    );
    // Tri par valeur (jamais par ordre physique IDB) : horodatage ISO puis id.
    return entrees.sort((a, b) =>
      a.horodatage === b.horodatage ? b.id.localeCompare(a.id) : b.horodatage.localeCompare(a.horodatage),
    );
  } catch {
    return [];
  }
}

function identifiantEntreeJournal(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Append d'une entrée de journal en UNE SEULE transaction (écriture + relecture
 * pour bornage + suppressions), bornée à JOURNAL_SYNC_MAX_ENTREES : les plus
 * anciennes partent quand la borne est dépassée (journal de terrain, pas
 * d'audit). Renvoie false (jamais d'exception) si stockage absent/refusé.
 */
export async function ajouterEntreeJournal(
  entree: Omit<EntreeJournalSync, 'id'>,
): Promise<boolean> {
  if (!indexedDbDisponible()) {
    return false;
  }
  try {
    await avecStoreGroupe(IDB_STORE_JOURNAL, 'readwrite', async (store) => {
      await promettreRequete(
        store.put({ ...entree, id: identifiantEntreeJournal() } satisfies EntreeJournalSync),
      );
      const entrees = await promettreRequete(
        store.getAll() as IDBRequest<EntreeJournalSync[]>,
      );
      if (entrees.length > JOURNAL_SYNC_MAX_ENTREES) {
        const ordre = entrees.sort((a, b) =>
          a.horodatage === b.horodatage
            ? a.id.localeCompare(b.id)
            : a.horodatage.localeCompare(b.horodatage),
        );
        const aSupprimer = ordre.slice(0, entrees.length - JOURNAL_SYNC_MAX_ENTREES);
        await Promise.all(
          aSupprimer.map((cible) => promettreRequete(store.delete(cible.id))),
        );
      }
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mémorise le jeton du canal sync (retourné UNE fois par le serveur à
 * l'enregistrement) dans le store appareil — il survit à la déconnexion
 * (AD-5) et n'est JAMAIS renvoyé par le serveur ensuite.
 */
export async function enregistrerJetonSync(jeton: string): Promise<boolean> {
  if (!indexedDbDisponible() || jeton.length === 0) {
    return false;
  }
  let base: IDBDatabase;
  try {
    base = await ouvrirBase();
  } catch {
    return false;
  }
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = base.transaction(IDB_STORE_APPAREIL, 'readwrite');
      const store = transaction.objectStore(IDB_STORE_APPAREIL);
      const lecture = store.get(IDB_CLE_COURANT) as IDBRequest<EnregistrementAppareil | undefined>;
      lecture.onsuccess = () => {
        const enregistrement = lecture.result;
        if (
          enregistrement === undefined ||
          typeof enregistrement.appareilId !== 'string' ||
          enregistrement.appareilId.length === 0
        ) {
          // Pas d'appareil connu : le jeton ne peut pas vivre seul —
          // l'enregistrement complet repassera à la prochaine ouverture.
          resolve(false);
          return;
        }
        const ecriture = store.put({
          id: IDB_CLE_COURANT,
          appareilId: enregistrement.appareilId,
          jetonSync: jeton,
        } satisfies EnregistrementAppareil);
        ecriture.onsuccess = () => resolve(true);
        ecriture.onerror = () => reject(ecriture.error ?? new Error('IndexedDB indisponible'));
      };
      lecture.onerror = () => reject(lecture.error ?? new Error('IndexedDB indisponible'));
    });
  } catch {
    return false;
  } finally {
    base.close();
  }
}

/** Jeton du canal sync mémorisé, null si l'appareil n'est pas enregistré. */
export async function lireJetonSync(): Promise<string | null> {
  if (!indexedDbDisponible()) {
    return null;
  }
  try {
    const enregistrement = await avecStore<EnregistrementAppareil | undefined>(
      IDB_STORE_APPAREIL,
      'readonly',
      (store) => store.get(IDB_CLE_COURANT) as IDBRequest<EnregistrementAppareil | undefined>,
    );
    return typeof enregistrement?.jetonSync === 'string' && enregistrement.jetonSync.length > 0
      ? enregistrement.jetonSync
      : null;
  } catch {
    return null;
  }
}
