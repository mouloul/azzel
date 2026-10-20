import { describe, expect, it } from 'vitest';

import {
  buildThemeInitScript,
  nextTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('resolveInitialTheme', () => {
  it('suit la préférence système quand aucune préférence n’est mémorisée', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
  });

  it('la préférence mémorisée surcharge le système', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('light', true)).toBe('light');
  });

  it('une valeur mémorisée invalide retombe sur le système', () => {
    expect(resolveInitialTheme('sombre', true)).toBe('dark');
    expect(resolveInitialTheme('sombre', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('inverse le thème courant', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('buildThemeInitScript', () => {
  function runThemeInitScript(stored: string | null, prefersDark: boolean): string | null {
    const setAttributeCalls: Array<[string, string]> = [];
    const storage = new Map<string, string>();
    if (stored !== null) {
      storage.set(THEME_STORAGE_KEY, stored);
    }
    const sandboxWindow = {
      matchMedia: (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' && prefersDark,
      }),
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
    return setAttributeCalls.find(([name]) => name === 'data-theme')?.[1] ?? null;
  }

  it('préférence mémorisée valide : le script l’applique', () => {
    expect(runThemeInitScript('dark', false)).toBe('dark');
    expect(runThemeInitScript('dark', false)).toBe(resolveInitialTheme('dark', false));
  });

  it('préférence mémorisée invalide : le script suit le système', () => {
    expect(runThemeInitScript('sombre', true)).toBe('dark');
    expect(runThemeInitScript('sombre', false)).toBe('light');
    expect(runThemeInitScript('sombre', true)).toBe(resolveInitialTheme('sombre', true));
  });

  it('aucune préférence, système clair : thème clair', () => {
    expect(runThemeInitScript(null, false)).toBe('light');
    expect(runThemeInitScript(null, false)).toBe(resolveInitialTheme(null, false));
  });

  it('aucune préférence, système sombre : thème sombre', () => {
    expect(runThemeInitScript(null, true)).toBe('dark');
    expect(runThemeInitScript(null, true)).toBe(resolveInitialTheme(null, true));
  });
});
