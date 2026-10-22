import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MissionVolontaireView } from '@/modules/missions/service';

import {
  IDB_CLE_COURANT,
  IDB_NOM_BASE,
  IDB_STORE_ETAT,
  IDB_VERSION,
  effacerEtatVolontaires,
  ecrireEtatVolontaires,
  lireEtatVolontaires,
  type EtatVolontaires,
} from './idb-volontaires';

// Story 3.3 — tests du wrapper IndexedDB : aller-retour écriture/lecture,
// SSR-safe sans indexedDB (node), clé unique « courant » (le dernier sync
// gagne). Le stub maison imite le strict contrat utilisé : open + upgrade,
// transaction → objectStore → get/put, requêtes promessifiées.

interface RequeteFactice<T> {
  result: T | undefined;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

function creerIndexedDbMemoire() {
  const stores = new Map<string, Map<string, unknown>>();
  const suppressions: string[] = [];
  let fermetures = 0;

  const requete = <T>(): RequeteFactice<T> => ({
    result: undefined,
    error: undefined,
    onsuccess: null,
    onerror: null,
  });

  const base = {
    objectStoreNames: { contains: (nom: string) => stores.has(nom) },
    createObjectStore: (nom: string) => {
      stores.set(nom, new Map());
    },
    transaction: () => ({
      objectStore: (nom: string) => ({
        get: (cle: string) => {
          const r = requete<unknown>();
          queueMicrotask(() => {
            r.result = stores.get(nom)?.get(cle);
            r.onsuccess?.();
          });
          return r;
        },
        put: (valeur: { id?: string }) => {
          const r = requete<string>();
          queueMicrotask(() => {
            stores.get(nom)?.set(valeur.id ?? '', valeur);
            r.result = valeur.id ?? '';
            r.onsuccess?.();
          });
          return r;
        },
      }),
    }),
    close: () => {
      fermetures += 1;
    },
  };

  const fabrique = {
    open: (nom: string, version?: number) => {
      expect(nom).toBe(IDB_NOM_BASE);
      expect(version).toBe(IDB_VERSION);
      const r: RequeteFactice<typeof base> & { onupgradeneeded: (() => void) | null } = {
        ...requete<typeof base>(),
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if ((version ?? 1) > 1) {
          throw new Error('le stub ne versionne pas au-delà de v1');
        }
        // Contrat réel : result est posé AVANT upgradeneeded/success.
        r.result = base;
        if (!stores.has(IDB_STORE_ETAT)) {
          r.onupgradeneeded?.();
        }
        r.onsuccess?.();
      });
      return r as unknown as IDBOpenDBRequest;
    },
    deleteDatabase: (nom: string) => {
      suppressions.push(nom);
      const r = requete<undefined>();
      queueMicrotask(() => {
        stores.clear();
        r.onsuccess?.();
      });
      return r as unknown as IDBOpenDBRequest;
    },
  };

  return { fabrique, stores, fermetures: () => fermetures, suppressions };
}

const MISSION: MissionVolontaireView = {
  id: 'mission-1',
  secteurNom: 'Village',
  secteurLieu: 'Place du village',
  secteurContact: '+213 555 010 203',
  type: 'accueil',
  typeLabel: 'Accueil',
  titre: 'Accueil village',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
  consignes: 'Arrive 15 min avant.',
  couverture: 'couverte',
  couvertureLabel: 'Couverte',
};

function etatExemple(generéA: string): EtatVolontaires {
  return {
    editionNom: 'Édition 2027',
    assistancePhone: '+213 555 010 200',
    mesMissions: [MISSION],
    missions: [MISSION],
    generéA,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lireEtatVolontaires / ecrireEtatVolontaires — IndexedDB', () => {
  it('SSR-safe : sans indexedDB, lire → null et écrire → false, sans exception', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(lireEtatVolontaires()).resolves.toBeNull();
    await expect(ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'))).resolves.toBe(
      false,
    );
  });

  it('aller-retour : l’état écrit est relu à l’identique, la clé interne retirée', async () => {
    const { fabrique, stores, fermetures } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    const ecrit = await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    expect(ecrit).toBe(true);

    const enregistrement = stores.get(IDB_STORE_ETAT)?.get(IDB_CLE_COURANT) as Record<
      string,
      unknown
    >;
    expect(enregistrement.id).toBe(IDB_CLE_COURANT);

    const lu = await lireEtatVolontaires();
    expect(lu).toEqual(etatExemple('2026-10-22T08:00:00.000Z'));
    expect(Object.keys(lu ?? {})).not.toContain('id');
    // La connexion est refermée après chaque opération (pas de fuite).
    expect(fermetures()).toBeGreaterThanOrEqual(2);
  });

  it('le dernier sync gagne : réécriture puis relecture de la valeur fraîche', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    await ecrireEtatVolontaires(etatExemple('2026-10-22T09:30:00.000Z'));

    await expect(lireEtatVolontaires()).resolves.toEqual(etatExemple('2026-10-22T09:30:00.000Z'));
  });

  it('base vide : lecture → null, jamais d’exception', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await expect(lireEtatVolontaires()).resolves.toBeNull();
  });

  it('stockage défaillant : les erreurs sont absorbées (false/null, pas d’exception)', async () => {
    const fabriqueFausse: IDBFactory = {
      open: () => {
        const r: RequeteFactice<unknown> & { onupgradeneeded: (() => void) | null } = {
          result: undefined,
          error: undefined,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => {
          r.error = new Error('quota');
          r.onerror?.();
        });
        return r as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory;
    vi.stubGlobal('indexedDB', fabriqueFausse);
    await expect(lireEtatVolontaires()).resolves.toBeNull();
    await expect(ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'))).resolves.toBe(
      false,
    );
  });

  it('enregistrement corrompu (autre schéma) : lecture → null, jamais de fiche cassée', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const store = new Map<string, unknown>();
    store.set(IDB_CLE_COURANT, { id: IDB_CLE_COURANT, nimporte: 'quoi' });
    stores.set(IDB_STORE_ETAT, store);
    await expect(lireEtatVolontaires()).resolves.toBeNull();

    store.set(IDB_CLE_COURANT, {
      id: IDB_CLE_COURANT,
      editionNom: 'Édition 2027',
      assistancePhone: '+213 555 010 200',
      mesMissions: [MISSION],
      // missions manquant + generéA non chaîne : schéma invalide aussi.
      missions: 'pas-un-tableau',
      generéA: 42,
    });
    await expect(lireEtatVolontaires()).resolves.toBeNull();
  });
});

describe('effacerEtatVolontaires — purge à la déconnexion (appareil partagé)', () => {
  it('supprime la base IndexedDB ET les caches az-volontaires-* (rien d’autre)', async () => {
    const { fabrique, suppressions } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const cachesSupprimes: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => [
        'az-volontaires-shell-v1',
        'az-volontaires-etat-v0',
        'site-cache-v2',
      ],
      delete: async (nom: string) => {
        cachesSupprimes.push(nom);
        return true;
      },
    });

    await effacerEtatVolontaires();

    expect(suppressions).toEqual([IDB_NOM_BASE]);
    expect(cachesSupprimes.sort()).toEqual(['az-volontaires-etat-v0', 'az-volontaires-shell-v1']);
  });

  it('SSR-safe : sans indexedDB ni caches, purge silencieuse sans exception', async () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(typeof caches).toBe('undefined');
    await expect(effacerEtatVolontaires()).resolves.toBeUndefined();
  });
});
