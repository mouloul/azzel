'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'azzel-theme';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current: Theme =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    setTheme(current);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) {
        return;
      }
      const next: Theme = event.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
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
