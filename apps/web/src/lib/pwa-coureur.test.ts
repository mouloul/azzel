import { afterEach, describe, expect, it, vi } from 'vitest';

import { PREFIXE_CACHES_COUREUR, purgerCachesCoureur } from './pwa-coureur';

// Story 4.1 (revue) — purge des caches du SW coureur : seuls les caches
// az-coureur-* disparaissent (pattern idb-volontaires.test.ts), le reste du
// navigateur (SW volontaires, caches du site) n'est pas touché, et l'absence
// de l'API caches (SSR, contexte non sécurisé) reste silencieuse.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('purgerCachesCoureur — purge à la déconnexion (appareil partagé)', () => {
  it('supprime UNIQUEMENT les caches az-coureur-*', async () => {
    const supprimes: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => [
        'az-coureur-shell-v1',
        'az-coureur-statiques-v1',
        'az-coureur-shell-v0',
        'az-volontaires-shell-v1',
        'site-cache-v2',
      ],
      delete: async (nom: string) => {
        supprimes.push(nom);
        return true;
      },
    });

    await purgerCachesCoureur();

    expect(supprimes.sort()).toEqual([
      'az-coureur-shell-v0',
      'az-coureur-shell-v1',
      'az-coureur-statiques-v1',
    ]);
  });

  it('un échec de suppression n’interrompt jamais la purge des autres', async () => {
    const supprimes: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['az-coureur-shell-v1', 'az-coureur-statiques-v1'],
      delete: async (nom: string) => {
        if (nom === 'az-coureur-shell-v1') {
          throw new Error('quota');
        }
        supprimes.push(nom);
        return true;
      },
    });

    await expect(purgerCachesCoureur()).resolves.toBeUndefined();
    expect(supprimes).toEqual(['az-coureur-statiques-v1']);
  });

  it('SSR-safe : sans caches, purge silencieuse sans exception', async () => {
    expect(typeof caches).toBe('undefined');
    await expect(purgerCachesCoureur()).resolves.toBeUndefined();
  });

  it('le préfixe épinglé correspond au SW (public/sw-coureur.js)', () => {
    expect(PREFIXE_CACHES_COUREUR).toBe('az-coureur-');
  });
});
