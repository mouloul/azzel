'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  nextTheme,
  readStoredTheme,
  resolveInitialTheme,
  THEME_CHANGE_EVENT,
  writeStoredTheme,
  type Theme,
} from '@/lib/theme';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(resolveInitialTheme(readStoredTheme()));
    // Thème choisi ailleurs (invitation mode sombre volontaires) : la bascule
    // suit, son libellé et son prochain clic restent justes.
    const suivre = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail === 'light' || detail === 'dark') {
        setTheme(detail);
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, suivre);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, suivre);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const initial: Theme = current ?? resolveInitialTheme(null);
      const next = nextTheme(initial);
      applyTheme(next);
      writeStoredTheme(next);
      return next;
    });
  }, []);

  const label =
    theme === null
      ? 'Thème clair ou sombre'
      : theme === 'dark'
        ? 'Passer en thème clair'
        : 'Passer en thème sombre';

  return (
    <button type="button" className="btn-contour" onClick={toggle} aria-label={label}>
      {label}
    </button>
  );
}
