import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { buildTokensCss } from '@/lib/tokens-css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Azzel',
    template: '%s — Azzel',
  },
  description:
    'Plateforme clé en main de gestion de course de trail, hors-ligne d’abord — portée par son village.',
};

const themeInitScript = `(function(){try{var s=localStorage.getItem('azzel-theme');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-theme="light" suppressHydrationWarning>
      <body>
        <style
          precedence="tokens"
          dangerouslySetInnerHTML={{ __html: buildTokensCss() }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        <header className="site-header">
          <p className="brand">Azzel</p>
          <ThemeToggle />
        </header>
        <main id="contenu">{children}</main>
        <footer className="site-footer">
          <p className="meta">
            Azzel — monorepo pnpm · apps/web Next.js 16 · apps/runners Expo SDK 58 ·
            packages/shared
          </p>
        </footer>
      </body>
    </html>
  );
}
