'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  nextTheme,
  readStoredTheme,
  resolveInitialTheme,
  writeStoredTheme,
  type Theme,
} from '@/lib/theme';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = readStoredTheme();
    const current = resolveInitialTheme(
      stored,
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    );
    setTheme(current);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme() !== null) {
        return;
      }
      const system: Theme = resolveInitialTheme(null, event.matches);
      applyTheme(system);
      setTheme(system);
    };
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const initial: Theme = current ?? resolveInitialTheme(null, false);
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
