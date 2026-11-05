import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildThemeInitScript,
  REQUETE_SOMBRE,
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
  /* UX-DR-2 : défaut = préférence SYSTÈME, override mémorisé.
   *
   * L'ancien test épinglait « sans préférence mémorisée → light » quelle que
   * soit la préférence système. Il décrivait l'implémentation, pas la règle :
   * la revue visuelle du 04/11/2026 (B2) a montré 41 écrans sur 44 rendus à
   * l'identique en clair et en sombre, avec ce test au vert. */
  it('sans préférence mémorisée, le système décide', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  it('la préférence mémorisée prime sur le système', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('light', true)).toBe('light');
  });

  it('une valeur mémorisée invalide laisse décider le système', () => {
    expect(resolveInitialTheme('sombre', true)).toBe('dark');
    expect(resolveInitialTheme('sombre', false)).toBe('light');
    expect(resolveInitialTheme('', true)).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('inverse le thème courant', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('buildThemeInitScript', () => {
  /** Rejoue le script d'init hors navigateur et rend le thème posé sur <html>,
   *  avec les requêtes média que le script a réellement interrogées. */
  function runThemeInitScript(
    stored: string | null,
    systemeSombre: boolean,
  ): { theme: string | null; requetes: string[] } {
    const setAttributeCalls: Array<[string, string]> = [];
    const storage = new Map<string, string>();
    if (stored !== null) {
      storage.set(THEME_STORAGE_KEY, stored);
    }
    const requetes: string[] = [];
    const sandboxWindow = {
      matchMedia: (query: string) => {
        requetes.push(query);
        return { matches: systemeSombre };
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
    return {
      theme: setAttributeCalls.find(([name]) => name === 'data-theme')?.[1] ?? null,
      requetes,
    };
  }

  it('préférence mémorisée valide : le script l’applique, quel que soit le système', () => {
    expect(runThemeInitScript('dark', false).theme).toBe('dark');
    expect(runThemeInitScript('light', true).theme).toBe('light');
  });

  it('préférence mémorisée invalide : le système décide', () => {
    expect(runThemeInitScript('sombre', true).theme).toBe('dark');
    expect(runThemeInitScript('sombre', false).theme).toBe('light');
  });

  /* UX-DR-2, revue visuelle du 04/11/2026 (B2). L'ancien test affirmait
   * « aucune préférence : thème clair, SANS suivi système » et vérifiait que
   * matchMedia n'était jamais appelé — il épinglait précisément le défaut. */
  it('aucune préférence : le script interroge le système et le suit', () => {
    const sombre = runThemeInitScript(null, true);
    expect(sombre.theme).toBe('dark');
    expect(sombre.requetes).toEqual([REQUETE_SOMBRE]);

    const clair = runThemeInitScript(null, false);
    expect(clair.theme).toBe('light');
    expect(clair.requetes).toEqual([REQUETE_SOMBRE]);
  });

  it('navigateur sans matchMedia : repli sur le thème clair, sans exception', () => {
    const script = new Function(
      'window',
      'localStorage',
      'document',
      buildThemeInitScript(),
    );
    const poses: Array<[string, string]> = [];
    expect(() =>
      script(
        {},
        { getItem: () => null },
        {
          documentElement: {
            setAttribute: (name: string, value: string) => poses.push([name, value]),
          },
        },
      ),
    ).not.toThrow();
    expect(poses.find(([name]) => name === 'data-theme')?.[1]).toBe('light');
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
