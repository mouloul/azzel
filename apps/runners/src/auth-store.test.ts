import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChecklistState } from '@azzel/shared';

import { ApiErreur } from './api-client';
import {
  ecrireEtatSession,
  ecrireToken,
  lireEtatSession,
  lireToken,
  oublierSession,
  purgerAuth,
} from './auth-store';
import { ecrireCacheDossier, lireCacheDossier } from './offline-cache';

// Story 6.1 — tests du magasin d'authentification : token en SecureStore
// (mocké), état de session en AsyncStorage (mocké), deux purges DISTINCTES —
// oublierSession (401) garde le cache, purgerAuth (logout) purge tout. Un
// refus keychain sur ecrireToken lève une ApiErreur exploitable (message +
// action) au lieu d'un rejet silencieux.

const secure = new Map<string, string>();
const stockage = new Map<string, string>();
let refusEcritureSecure = false;

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (cle: string) => secure.get(cle) ?? null,
  setItemAsync: async (cle: string, valeur: string) => {
    if (refusEcritureSecure) {
      throw new Error('keychain refused');
    }
    secure.set(cle, valeur);
  },
  deleteItemAsync: async (cle: string) => {
    secure.delete(cle);
  },
}));

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
  edition: null,
  pieces: [{ id: 'email', libelle: 'Email vérifié', fait: true }],
  recap: null,
};

beforeEach(() => {
  secure.clear();
  stockage.clear();
  refusEcritureSecure = false;
});

describe('token de session', () => {
  it('écrit puis relit le token depuis le SecureStore', async () => {
    await ecrireToken('jeton-natif-clair');
    expect(await lireToken()).toBe('jeton-natif-clair');
  });

  it('SecureStore vide : lireToken renvoie null', async () => {
    expect(await lireToken()).toBeNull();
  });

  it('refus keychain : ApiErreur avec message + action (exploitable par l’écran connexion)', async () => {
    refusEcritureSecure = true;

    const erreur = await ecrireToken('jeton').catch((error: unknown) => error);

    expect(erreur).toBeInstanceOf(ApiErreur);
    const apiErreur = erreur as ApiErreur;
    expect(apiErreur.enveloppe?.error.code).toBe('app.stockage_token_refuse');
    expect(apiErreur.enveloppe?.error.message).toContain('garder ta session');
    expect(apiErreur.enveloppe?.error.action).toContain('appelle');
    // Rien n'a été écrit : l'état reste cohérent pour une nouvelle tentative.
    expect(await lireToken()).toBeNull();
  });
});

describe('état de session', () => {
  it('écrit puis relit l’état { email, role }', async () => {
    await ecrireEtatSession({ email: 'coureur@exemple.dz', role: 'coureur' });
    expect(await lireEtatSession()).toEqual({ email: 'coureur@exemple.dz', role: 'coureur' });
  });

  it('JSON illisible : null', async () => {
    stockage.set('azzel.session', 'pas-json');
    expect(await lireEtatSession()).toBeNull();
  });
});

describe('oublierSession — session expirée (401/AD-5)', () => {
  it('jette token et état de session mais GARDE le cache dossier', async () => {
    await ecrireToken('jeton-revoque');
    await ecrireEtatSession({ email: 'coureur@exemple.dz', role: 'coureur' });
    await ecrireCacheDossier(DOSSIER);

    await oublierSession();

    expect(await lireToken()).toBeNull();
    expect(await lireEtatSession()).toBeNull();
    expect(await lireCacheDossier()).not.toBeNull();
  });
});

describe('purgerAuth — logout explicite', () => {
  it('jette token, état ET caches', async () => {
    await ecrireToken('jeton');
    await ecrireEtatSession({ email: 'coureur@exemple.dz', role: 'coureur' });
    await ecrireCacheDossier(DOSSIER);

    await purgerAuth();

    expect(await lireToken()).toBeNull();
    expect(await lireEtatSession()).toBeNull();
    expect(await lireCacheDossier()).toBeNull();
  });
});
