import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ecrireJetonAppareil,
  ecrireOptin,
  lireAppareilClient,
  lireJetonAppareil,
  lireOptin,
  oublierJetonAppareil,
  purgerSuivi,
  reinitialiserUuidRepliPourTests,
} from './suivi-store';

// Story 6.2 — tests du magasin de suivi : opt-in AsyncStorage (défaut NON —
// rien n'est enregistré tant que le coureur n'a pas activé ; l'échec
// d'écriture REMONTE), jeton appareil SecureStore, appareilClient STABLE
// (UUID généré une fois — repli mémoïsé en échec de stockage, sinon clé
// capture ≠ clé sync → 400 permanent), purgerSuivi purge tout et SIGNALE
// un échec de purge outbox (logout / changement de compte).

const secure = new Map<string, string>();
const stockage = new Map<string, string>();
let refusEcritureStockage = false;
let refusLectureStockage = false;
const outboxStub = vi.hoisted(() => ({
  purgerOutbox: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (cle: string) => secure.get(cle) ?? null,
  setItemAsync: async (cle: string, valeur: string) => {
    secure.set(cle, valeur);
  },
  deleteItemAsync: async (cle: string) => {
    secure.delete(cle);
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (cle: string) => {
      if (refusLectureStockage) {
        throw new Error('storage read refused');
      }
      return stockage.get(cle) ?? null;
    },
    setItem: async (cle: string, valeur: string) => {
      if (refusEcritureStockage) {
        throw new Error('storage write refused');
      }
      stockage.set(cle, valeur);
    },
    removeItem: async (cle: string) => {
      stockage.delete(cle);
    },
  },
}));

vi.mock('./outbox-sqlite', () => ({
  outboxSuivi: outboxStub,
}));

beforeEach(() => {
  secure.clear();
  stockage.clear();
  refusEcritureStockage = false;
  refusLectureStockage = false;
  outboxStub.purgerOutbox.mockReset();
  outboxStub.purgerOutbox.mockReturnValue(undefined);
  reinitialiserUuidRepliPourTests();
});

describe('opt-in explicite', () => {
  it('défaut : NON (aucune capture possible sans activation)', async () => {
    expect(await lireOptin()).toBe(false);
  });

  it('active puis relit la préférence', async () => {
    await ecrireOptin(true);
    expect(await lireOptin()).toBe(true);
    await ecrireOptin(false);
    expect(await lireOptin()).toBe(false);
  });

  it('échec d’écriture : false remonté (l’écran ramène le toggle à l’état réel)', async () => {
    refusEcritureStockage = true;
    await expect(ecrireOptin(true)).resolves.toBe(false);
    // La préférence n'a pas bougé : toujours désactivée.
    expect(await lireOptin()).toBe(false);
  });
});

describe('jeton appareil (SecureStore)', () => {
  it('écrit puis relit le jeton', async () => {
    await ecrireJetonAppareil('jeton-brut-256-bits');
    expect(await lireJetonAppareil()).toBe('jeton-brut-256-bits');
  });

  it('oublierJetonAppareil jette le secret SANS toucher au reste', async () => {
    await ecrireJetonAppareil('jeton');
    await ecrireOptin(true);
    await oublierJetonAppareil();
    expect(await lireJetonAppareil()).toBeNull();
    // L'opt-in survit : c'est un ré-enregistrement, pas un logout.
    expect(await lireOptin()).toBe(true);
  });
});

describe('appareilClient stable', () => {
  it('génère une fois puis RELIT le même identifiant', async () => {
    const premier = await lireAppareilClient();
    const second = await lireAppareilClient();
    expect(premier).toBe(second);
    expect(premier).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('deux installations (storages distincts) → identifiants distincts', async () => {
    const premier = await lireAppareilClient();
    stockage.clear();
    const second = await lireAppareilClient();
    expect(premier).not.toBe(second);
  });

  it('échec de stockage : UUID de repli STABLE d’un appel à l’autre (clé capture = clé sync)', async () => {
    refusLectureStockage = true;
    refusEcritureStockage = true;
    const premier = await lireAppareilClient();
    const second = await lireAppareilClient();
    expect(premier).toBe(second);
    expect(premier).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('purgerSuivi — logout / changement de compte', () => {
  it('purge jeton, préférence, identifiant ET outbox : true', async () => {
    await ecrireJetonAppareil('jeton-a-purger');
    await ecrireOptin(true);
    await lireAppareilClient();

    await expect(purgerSuivi()).resolves.toBe(true);

    expect(await lireJetonAppareil()).toBeNull();
    expect(await lireOptin()).toBe(false);
    expect(stockage.get('azzel.appareil_client')).toBeUndefined();
    expect(outboxStub.purgerOutbox).toHaveBeenCalledTimes(1);
  });

  it('échec de purge outbox : false REMONTÉ (déconnexion incomplète à dire)', async () => {
    await ecrireJetonAppareil('jeton');
    outboxStub.purgerOutbox.mockImplementation(() => {
      throw new Error('sqlite verrouillée');
    });
    await expect(purgerSuivi()).resolves.toBe(false);
    // La session-local a quand même été purgée (jeton, préférences) —
    // c'est l'outbox qui reste, et c'est DIT.
    expect(await lireJetonAppareil()).toBeNull();
  });
});
