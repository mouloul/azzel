export const THEME_STORAGE_KEY = 'azzel-theme';

export type Theme = 'light' | 'dark';

export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

export function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function buildThemeInitScript(): string {
  return `(function(){try{var s=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});var t=(${resolveInitialTheme.toString()})(s,window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
}
