export const THEME_STORAGE_KEY = 'azzel-theme';

export type Theme = 'light' | 'dark';

export function resolveInitialTheme(stored: string | null): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'light';
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

/**
 * Story 3.3 (revue) — un changement de thème fait HORS de la bascule
 * d'en-tête (invitation mode sombre des volontaires) est annoncé : la bascule
 * se resynchronise au lieu de garder l'état lu à son montage.
 */
export const THEME_CHANGE_EVENT = 'azzel-theme-change';

export function notifyThemeChange(theme: Theme): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

/**
 * « Plus tard » sur l'invitation mode sombre : reporté pour la SESSION
 * (sessionStorage), jamais mémorisé comme choix — l'invitation revient à la
 * prochaine ouverture tant qu'aucun thème n'est choisi.
 */
export const THEME_INVITATION_DEFERRED_KEY = 'azzel-theme-invitation-reportee';

export function deferThemeInvitation(): void {
  try {
    sessionStorage.setItem(THEME_INVITATION_DEFERRED_KEY, '1');
  } catch {
    return;
  }
}

export function isThemeInvitationDeferred(): boolean {
  try {
    return sessionStorage.getItem(THEME_INVITATION_DEFERRED_KEY) === '1';
  } catch {
    return false;
  }
}

export function buildThemeInitScript(): string {
  return `(function(){try{var s=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});var t=(${resolveInitialTheme.toString()})(s);document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
}
