import type { MissionVolontaireView } from '@/modules/missions/service';

// Story 3.3 — persistance IndexedDB de l'état volontaires. Radical mais
// minimal : une base nommée + versionnée, un store « etat », un enregistrement
// « courant ». L'épopée 4 réutilisera cette base pour l'outbox (bump de
// version + nouveaux stores — ne rien verrouiller).
//
// SSR-safe : sans indexedDB (serveur, vieux navigateur, mode privé iOS qui
// jette), lire renvoie null et écrire renvoie false — le rendu serveur reste
// le plan A, jamais d'écran vide pour un échec de stockage.

export const IDB_NOM_BASE = 'azzel-volontaires';
export const IDB_VERSION = 1;
export const IDB_STORE_ETAT = 'etat';
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
      const base = requete.result;
      if (!base.objectStoreNames.contains(IDB_STORE_ETAT)) {
        base.createObjectStore(IDB_STORE_ETAT, { keyPath: 'id' });
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
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await ouvrirBase();
  try {
    const transaction = base.transaction(IDB_STORE_ETAT, mode);
    return await promettreRequete(operation(transaction.objectStore(IDB_STORE_ETAT)));
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
    await avecStore('readwrite', (store) =>
      store.put({ ...etat, id: IDB_CLE_COURANT } satisfies EnregistrementEtat),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Purge complète de la poche : suppression de la base IndexedDB (donc du
 * store « etat ») et des caches du service worker volontaires. Appelée à la
 * déconnexion — appareil partagé, la fiche ne survit pas au compte.
 * Silencieuse par construction (sans indexedDB/caches, ou erreur) : la
 * déconnexion ne doit jamais échouer pour ça.
 */
export async function effacerEtatVolontaires(): Promise<void> {
  if (indexedDbDisponible()) {
    await new Promise<void>((resolve) => {
      const requete = indexedDB.deleteDatabase(IDB_NOM_BASE);
      requete.onsuccess = () => resolve();
      requete.onerror = () => resolve();
      requete.onblocked = () => resolve();
    }).catch(() => undefined);
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
