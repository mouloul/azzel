import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANNUAIRE_SCHEMA_VERSION, type AnnuaireEdition } from '@azzel/shared';

import type { MissionVolontaireView } from '@/modules/missions/service';

import {
  IDB_CLE_COURANT,
  IDB_NOM_BASE,
  IDB_STORE_ANNUAIRE,
  IDB_STORE_ETAT,
  IDB_VERSION,
  effacerEtatVolontaires,
  ecrireAnnuaire,
  ecrireEtatVolontaires,
  lireAnnuaire,
  lireEtatVolontaires,
  type EtatVolontaires,
} from './idb-volontaires';

// Stories 3.3/3.4 — tests du wrapper IndexedDB : aller-retour écriture/lecture
// (etat ET annuaire), SSR-safe sans indexedDB (node), clé unique « courant »
// (le dernier sync gagne), upgrade v1→v2 (store annuaire créé sans toucher
// etat). Le stub maison imite le strict contrat utilisé : open + upgrade,
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
  // Version de la base « sur disque » : 0 = neuve, 1 = époque 3.3, 2 = 3.4.
  let versionBase = 0;

  const requete = <T>(): RequeteFactice<T> => ({
    result: undefined,
    error: undefined,
    onsuccess: null,
    onerror: null,
  });

  const base = {
    objectStoreNames: { contains: (nom: string) => stores.has(nom) },
    createObjectStore: (nom: string) => {
      stores.set(nom, stores.get(nom) ?? new Map());
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
        // Contrat réel : result est posé AVANT upgradeneeded/success, et
        // l'upgrade ne part QUE si la version demandée dépasse celle du disque.
        r.result = base;
        if ((version ?? 1) > versionBase) {
          versionBase = version ?? 1;
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
        versionBase = 0;
        r.onsuccess?.();
      });
      return r as unknown as IDBOpenDBRequest;
    },
  };

  /** Simule une base restée en v1 (épopée 3.3) : store etat déjà peuplé. */
  const semerBaseV1 = (etat: EtatVolontaires): void => {
    versionBase = 1;
    const store = new Map<string, unknown>();
    store.set(IDB_CLE_COURANT, { ...etat, id: IDB_CLE_COURANT });
    stores.set(IDB_STORE_ETAT, store);
  };

  return { fabrique, stores, fermetures: () => fermetures, suppressions, semerBaseV1 };
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

function annuaireExemple(genereA: string): AnnuaireEdition {
  return {
    version: ANNUAIRE_SCHEMA_VERSION,
    editionId: 'edition-1',
    genereA,
    coureurs: [
      // Story 4.1 — contrat v2 : jeton base64url 22 caractères par coureur.
      {
        dossard: 1,
        nom: 'Ulahianne',
        prenom: 'Yani',
        jeton: 'jeton-coureur-1-aaaaaa',
      },
      {
        dossard: 12,
        nom: 'Cherchée',
        prenom: 'Iness',
        jeton: 'jeton-coureur-12-aaaaa',
      },
    ],
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

describe('lireAnnuaire / ecrireAnnuaire — store dédié v2 (story 3.4)', () => {
  it('SSR-safe : sans indexedDB, lire → null et écrire → false, sans exception', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(lireAnnuaire()).resolves.toBeNull();
    await expect(ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'))).resolves.toBe(
      false,
    );
  });

  it('aller-retour dans le store annuaire : clé « courant », clé interne retirée à la lecture', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    expect(await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'))).toBe(true);

    const enregistrement = stores.get(IDB_STORE_ANNUAIRE)?.get(IDB_CLE_COURANT) as Record<
      string,
      unknown
    >;
    expect(enregistrement.id).toBe(IDB_CLE_COURANT);
    // L'état missions reste dans SON store : aucune confusion des deux poches
    // (le store etat existe — créé par l'upgrade — mais reste vide).
    expect(stores.get(IDB_STORE_ETAT)?.has(IDB_CLE_COURANT) ?? false).toBe(false);

    const lu = await lireAnnuaire();
    expect(lu).toEqual(annuaireExemple('2026-10-22T08:00:00.000Z'));
    expect(Object.keys(lu ?? {})).not.toContain('id');
  });

  it('upgrade v1 → v2 : le store annuaire est créé SANS toucher « etat »', async () => {
    const { fabrique, stores, semerBaseV1 } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const etatV1 = etatExemple('2026-10-20T08:00:00.000Z');
    semerBaseV1(etatV1);

    // Toute opération réouvre la base en v2 : l'upgrade part, crée « annuaire »…
    expect(await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'))).toBe(true);
    expect(stores.has(IDB_STORE_ANNUAIRE)).toBe(true);
    // …et l'état v1 (données ET store) survit intact.
    await expect(lireEtatVolontaires()).resolves.toEqual(etatV1);

    // Base neuve (v0) : les deux stores sont créés d'un coup.
    const neuve = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', neuve.fabrique);
    expect(await ecrireEtatVolontaires(etatV1)).toBe(true);
    expect(neuve.stores.has(IDB_STORE_ETAT)).toBe(true);
    expect(neuve.stores.has(IDB_STORE_ANNUAIRE)).toBe(true);
  });

  it('réécriture : le dernier annuaire synchronisé gagne', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'));
    await ecrireAnnuaire(annuaireExemple('2026-10-22T09:30:00.000Z'));
    const lu = await lireAnnuaire();
    expect(lu?.genereA).toBe('2026-10-22T09:30:00.000Z');
  });

  it('annuaire hors contrat : écriture refusée (false), rien en poche', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const invalide = {
      ...annuaireExemple('2026-10-22T08:00:00.000Z'),
      coureurs: [
        { dossard: 7, nom: 'Doublon', prenom: 'Un', jeton: 'jeton-doublon-1-aaaaaa' },
        { dossard: 7, nom: 'Doublon', prenom: 'Deux', jeton: 'jeton-doublon-2-aaaaaa' },
      ],
    };
    expect(await ecrireAnnuaire(invalide)).toBe(false);
    expect(stores.get(IDB_STORE_ANNUAIRE)?.has(IDB_CLE_COURANT) ?? false).toBe(false);
    // Version inconnue aussi : la poche ne stocke qu'un contrat identifié.
    expect(
      await ecrireAnnuaire({
        ...annuaireExemple('2026-10-22T08:00:00.000Z'),
        version: 99 as unknown as AnnuaireEdition['version'],
      }),
    ).toBe(false);
  });

  it('enregistrement corrompu : lecture → null, jamais d’annuaire cassé', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const store = new Map<string, unknown>();
    store.set(IDB_CLE_COURANT, { id: IDB_CLE_COURANT, nimporte: 'quoi' });
    stores.set(IDB_STORE_ANNUAIRE, store);
    await expect(lireAnnuaire()).resolves.toBeNull();
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

  it('la purge emporte aussi l’annuaire : etat ET annuaire disparaissent avec la base', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'));
    expect(stores.has(IDB_STORE_ETAT)).toBe(true);
    expect(stores.has(IDB_STORE_ANNUAIRE)).toBe(true);

    await effacerEtatVolontaires();

    expect(stores.size).toBe(0);
  });
});
