import { describe, expect, it } from 'vitest';

import {
  buildThemeInitScript,
  nextTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from './theme';

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
