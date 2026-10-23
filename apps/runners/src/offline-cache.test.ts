import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistState, ReponseEdossardApi } from '@azzel/shared';

import {
  ecrireCacheDossier,
  ecrireCacheEdossard,
  lireCacheDossier,
  lireCacheEdossard,
  purgerCache,
} from './offline-cache';

// Story 6.1 — tests du cache hors-ligne (AsyncStorage mocké en mémoire) :
// écriture/lecture du dossier et de l'e-dossard, e-dossard non disponible
// jamais caché, JSON corrompu traité comme absent, purge explicite.

const stockage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (cle: string) => stockage.get(cle) ?? null,
    setItem: async (cle: string, valeur: string) => {
      stockage.set(cle, valeur);
    },
    removeItem: async (cle: string) => {
      stockage.delete(cle);
    },
  },
}));

const DOSSIER: ChecklistState = {
  edition: {
    id: 'edition-1',
    slug: '2027',
    nom: 'Édition 2027',
    dateCourse: '2027-05-16',
    registrationClosesAt: '2027-03-16T22:59:59.000Z',
    registrationOpen: true,
  },
  pieces: [
    { id: 'email', libelle: 'Email vérifié', fait: true },
    { id: 'validation', libelle: 'Dossier validé', fait: false },
  ],
  recap: null,
};

const EDOSSARD: ReponseEdossardApi = {
  disponible: true,
  jeton: 'AbCdEfGhIjKlMnOpQrStUv',
  dossard: 184,
  prenom: 'Yacine',
  nom: 'Amrani',
  epreuveNom: 'La Longue — 35 km',
  editionNom: 'Édition 2027',
  payloadQr: 'azzel-e1:AbCdEfGhIjKlMnOpQrStUv',
};

beforeEach(() => {
  stockage.clear();
});

describe('cache dossier', () => {
  it('écrit puis relit le dossier avec sa date de synchronisation', async () => {
    await ecrireCacheDossier(DOSSIER);

    const cache = await lireCacheDossier();

    expect(cache).not.toBeNull();
    expect(cache?.donnees.pieces).toHaveLength(2);
    expect(cache?.donnees.edition?.slug).toBe('2027');
    expect(Number.isNaN(new Date(cache?.recuLe as string).getTime())).toBe(false);
  });

  it('absent avant toute écriture : null (écran première connexion requise)', async () => {
    expect(await lireCacheDossier()).toBeNull();
  });

  it('JSON corrompu : null, jamais de crash', async () => {
    stockage.set('azzel.cache.dossier', '{pas du json');
    expect(await lireCacheDossier()).toBeNull();
  });

  it('entrée avec donnees null : rejetée (null n’est pas un dossier)', async () => {
    stockage.set(
      'azzel.cache.dossier',
      JSON.stringify({ recuLe: '2026-10-23T10:00:00.000Z', donnees: null }),
    );
    expect(await lireCacheDossier()).toBeNull();
  });
});

describe('cache e-dossard', () => {
  it('cache l’état disponible AVEC son payload QR (lisible réseau coupé)', async () => {
    await ecrireCacheEdossard(EDOSSARD);

    const cache = await lireCacheEdossard();

    expect(cache).not.toBeNull();
    expect(cache?.donnees.payloadQr).toBe('azzel-e1:AbCdEfGhIjKlMnOpQrStUv');
    expect(cache?.donnees.dossard).toBe(184);
    expect((cache?.donnees as unknown as Record<string, unknown>).disponible).toBeUndefined();
  });

  it('« pas encore validé » n’est JAMAIS caché', async () => {
    await ecrireCacheEdossard({ disponible: false });

    expect(await lireCacheEdossard()).toBeNull();
  });
});

describe('purge', () => {
  it('logout : dossier et e-dossard disparaissent', async () => {
    await ecrireCacheDossier(DOSSIER);
    await ecrireCacheEdossard(EDOSSARD);

    await purgerCache();

    expect(await lireCacheDossier()).toBeNull();
    expect(await lireCacheEdossard()).toBeNull();
  });
});
