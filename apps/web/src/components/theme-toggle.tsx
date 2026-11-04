'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  readStoredTheme,
  resolveInitialTheme,
  THEME_CHANGE_EVENT,
  writeStoredTheme,
  type Theme,
} from '@/lib/theme';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

const CHOIX: readonly { valeur: Theme; libelle: string }[] = [
  { valeur: 'light', libelle: 'Thème clair' },
  { valeur: 'dark', libelle: 'Thème sombre' },
];

/** Soleil (thème clair) — trait en currentColor, suit la couleur de l'en-tête. */
function IconeClair() {
  return (
    <svg
      className="theme-switch__icone"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.22 4.22l1.7 1.7M18.08 18.08l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.22 19.78l1.7-1.7M18.08 5.92l1.7-1.7" />
    </svg>
  );
}

/** Croissant (thème sombre). */
function IconeSombre() {
  return (
    <svg
      className="theme-switch__icone"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
    </svg>
  );
}

/**
 * Revue visuelle du 04/11/2026 (B3 + M4) — la bascule occupait jusqu'à 60 % de
 * l'en-tête en 390 px et débordait sur /admin/dossiers. Deux boutons radio
 * icôniques à la place : largeur fixe, libellés lus par les lecteurs d'écran,
 * état courant visible sans dépendre de la seule couleur (fond plein + contour).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(resolveInitialTheme(readStoredTheme()));
    const suivre = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail === 'light' || detail === 'dark') {
        setTheme(detail);
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, suivre);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, suivre);
  }, []);

  const choisir = useCallback((valeur: Theme) => {
    applyTheme(valeur);
    writeStoredTheme(valeur);
    setTheme(valeur);
  }, []);

  return (
    <div className="theme-switch" role="radiogroup" aria-label="Thème">
      {CHOIX.map(({ valeur, libelle }) => (
        <label className="theme-switch__option" key={valeur}>
          <input
            type="radio"
            name="theme"
            value={valeur}
            checked={theme === valeur}
            onChange={() => choisir(valeur)}
          />
          {valeur === 'light' ? <IconeClair /> : <IconeSombre />}
          <span className="visually-hidden">{libelle}</span>
        </label>
      ))}
    </div>
  );
}
