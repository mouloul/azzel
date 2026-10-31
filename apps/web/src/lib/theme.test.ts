import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildThemeInitScript,
  deferThemeInvitation,
  isThemeInvitationDeferred,
  nextTheme,
  notifyThemeChange,
  resolveInitialTheme,
  THEME_CHANGE_EVENT,
  THEME_INVITATION_DEFERRED_KEY,
  THEME_STORAGE_KEY,
} from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveInitialTheme', () => {
  it('sans préférence mémorisée, le thème clair (charte) est la référence', () => {
    expect(resolveInitialTheme(null)).toBe('light');
  });

  it('la préférence mémorisée est appliquée', () => {
    expect(resolveInitialTheme('dark')).toBe('dark');
    expect(resolveInitialTheme('light')).toBe('light');
  });

  it('une valeur mémorisée invalide retombe sur le thème clair', () => {
    expect(resolveInitialTheme('sombre')).toBe('light');
    expect(resolveInitialTheme('')).toBe('light');
  });
});

describe('nextTheme', () => {
  it('inverse le thème courant', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('buildThemeInitScript', () => {
  function runThemeInitScript(stored: string | null): string | null {
    const setAttributeCalls: Array<[string, string]> = [];
    const storage = new Map<string, string>();
    if (stored !== null) {
      storage.set(THEME_STORAGE_KEY, stored);
    }
    const matchMediaCalls: string[] = [];
    const sandboxWindow = {
      matchMedia: (query: string) => {
        matchMediaCalls.push(query);
        return { matches: true };
      },
    };
    const sandboxLocalStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
    };
    const sandboxDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          setAttributeCalls.push([name, value]);
        },
      },
    };
    const script = new Function(
      'window',
      'localStorage',
      'document',
      buildThemeInitScript(),
    );
    script(sandboxWindow, sandboxLocalStorage, sandboxDocument);
    expect(matchMediaCalls).toEqual([]);
    return setAttributeCalls.find(([name]) => name === 'data-theme')?.[1] ?? null;
  }

  it('préférence mémorisée valide : le script l’applique', () => {
    expect(runThemeInitScript('dark')).toBe('dark');
    expect(runThemeInitScript('dark')).toBe(resolveInitialTheme('dark'));
  });

  it('préférence mémorisée invalide : thème clair', () => {
    expect(runThemeInitScript('sombre')).toBe('light');
    expect(runThemeInitScript('sombre')).toBe(resolveInitialTheme('sombre'));
  });

  it('aucune préférence : thème clair, sans suivi système', () => {
    expect(runThemeInitScript(null)).toBe('light');
    expect(runThemeInitScript(null)).toBe(resolveInitialTheme(null));
  });
});

describe('notifyThemeChange (revue 3.3)', () => {
  it('annonce le thème choisi hors bascule : la bascule d’en-tête se resynchronise', () => {
    const cible = new EventTarget();
    vi.stubGlobal('window', cible);
    const recus: unknown[] = [];
    cible.addEventListener(THEME_CHANGE_EVENT, (event) => {
      recus.push((event as CustomEvent<unknown>).detail);
    });
    notifyThemeChange('dark');
    expect(recus).toEqual(['dark']);
  });

  it('SSR-safe : sans window, aucun effet ni exception', () => {
    expect(() => notifyThemeChange('dark')).not.toThrow();
  });
});

describe('invitation mode sombre « Plus tard » (revue 3.3)', () => {
  it('reportée pour la session seulement : aucun thème mémorisé', () => {
    const session = new Map<string, string>();
    const local = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (cle: string) => session.get(cle) ?? null,
      setItem: (cle: string, valeur: string) => session.set(cle, valeur),
    });
    vi.stubGlobal('localStorage', {
      getItem: (cle: string) => local.get(cle) ?? null,
      setItem: (cle: string, valeur: string) => local.set(cle, valeur),
    });
    expect(isThemeInvitationDeferred()).toBe(false);
    deferThemeInvitation();
    expect(isThemeInvitationDeferred()).toBe(true);
    expect(session.get(THEME_INVITATION_DEFERRED_KEY)).toBe('1');
    expect(local.has(THEME_STORAGE_KEY)).toBe(false);
  });

  it('stockage indisponible : jamais d’exception, invitation non reportée', () => {
    expect(() => deferThemeInvitation()).not.toThrow();
    expect(isThemeInvitationDeferred()).toBe(false);
  });
});
