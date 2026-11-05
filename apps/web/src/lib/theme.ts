export const THEME_STORAGE_KEY = 'azzel-theme';

export type Theme = 'light' | 'dark';

/**
 * UX-DR-2 : défaut = préférence système, override mémorisé.
 *
 * Revue visuelle du 04/11/2026 (B2) — cette fonction rendait « light » dès
 * qu'aucun choix n'était mémorisé, et `prefers-color-scheme` n'était lu nulle
 * part : 41 des 44 écrans capturés rendaient une image IDENTIQUE en clair et
 * en sombre. Le choix mémorisé reste prioritaire ; sans lui, le système
 * décide.
 *
 * `systemePrefereSombre` est passé par l'appelant (et non lu ici) pour que la
 * fonction reste pure et sérialisable : elle est injectée telle quelle dans le
 * script d'initialisation du document par `buildThemeInitScript`.
 */
export function resolveInitialTheme(
  stored: string | null,
  systemePrefereSombre: boolean,
): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return systemePrefereSombre ? 'dark' : 'light';
}

/** Requête média unique, pour que le script d'init et la bascule s'accordent. */
export const REQUETE_SOMBRE = '(prefers-color-scheme: dark)';

/** Préférence système courante ; `false` si le navigateur ne la fournit pas. */
export function systemePrefereSombre(): boolean {
  try {
    return window.matchMedia(REQUETE_SOMBRE).matches;
  } catch {
    return false;
  }
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
  // Exécuté avant le premier rendu : le thème est posé sur <html> sans
  // clignotement. La préférence système est lue ICI et passée à la fonction
  // pure, qui est sérialisée telle quelle dans le script.
  return `(function(){try{var s=localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )});var d=window.matchMedia&&window.matchMedia(${JSON.stringify(
    REQUETE_SOMBRE,
  )}).matches;var t=(${resolveInitialTheme.toString()})(s,d);document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
}
