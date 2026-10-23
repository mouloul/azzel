import {
  cleIdempotenceRetrait,
  estAnnuaireValide,
  estRetraitValide,
  type AnnuaireEdition,
  type RetraitTerrain,
} from '@azzel/shared';

import type { MissionVolontaireView } from '@/modules/missions/service';

// Stories 3.3/3.4/4.3 — persistance IndexedDB de la poche volontaires. Une base
// nommée + versionnée : v1 = store « etat » (fiche missions), v2 = store
// « annuaire » (réplique des coureurs), v3 = stores « outbox » (événements
// terrain append-only) + « appareil » (identifiant d'appareil stable) — chaque
// upgrade crée SANS toucher les stores précédents.
//
// L'outbox appartient à l'APPAREIL (AD-5) : il survit à la déconnexion (la
// purge logout vide etat/annuaire mais CONSERVE outbox/appareil). Append-only
// strict (AD-2, AD-8) : insertion (add, clé d'idempotence en keyPath → un
// doublon physique est impossible) et lecture uniquement — jamais de mutation
// ni de suppression locale ; 4.5 marquera l'envoi.
//
// SSR-safe : sans indexedDB (serveur, vieux navigateur, mode privé iOS qui
// jette), lire renvoie null/vide et écrire renvoie false — le rendu serveur
// reste le plan A, jamais d'écran vide pour un échec de stockage.

export const IDB_NOM_BASE = 'azzel-volontaires';
export const IDB_VERSION = 3;
export const IDB_STORE_ETAT = 'etat';
export const IDB_STORE_ANNUAIRE = 'annuaire';
export const IDB_STORE_OUTBOX = 'outbox';
export const IDB_STORE_APPAREIL = 'appareil';
export const IDB_CLE_COURANT = 'courant';

/** Préfixe des caches du service worker volontaires (voir public/sw-volontaires.js). */
export const PREFIXE_CACHES_VOLONTAIRES = 'az-volontaires-';

/** Réponse de GET /api/volontaires/etat — exactement ce qui est persisté. */
export interface EtatVolontaires {
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

/**
 * Garde de schéma : la base peut contenir un enregistrement d'une autre
 * époque (épopée 4, écriture concurrente) — seul un état de la bonne forme
 * alimente le rendu, sinon null (jamais de fiche cassée à l'écran).
 */
export function estEtatVolontaires(valeur: unknown): valeur is EtatVolontaires {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    (candidat.editionNom === null || typeof candidat.editionNom === 'string') &&
    typeof candidat.assistancePhone === 'string' &&
    Array.isArray(candidat.mesMissions) &&
    Array.isArray(candidat.missions) &&
    typeof candidat.generéA === 'string'
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

async function avecStore<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await ouvrirBase();
  try {
    const transaction = base.transaction(store, mode);
    return await promettreRequete(operation(transaction.objectStore(store)));
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

// ---------------------------------------------------------------------------
// Story 4.3 — outbox append-only (AD-2, AD-8) + identifiant d'appareil (AD-5).
// ---------------------------------------------------------------------------

interface EnregistrementOutbox extends RetraitTerrain {
  cle: string;
}

interface EnregistrementAppareil {
  id: typeof IDB_CLE_COURANT;
  appareilId: string;
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
