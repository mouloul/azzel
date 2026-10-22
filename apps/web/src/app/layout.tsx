import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminHeaderLink } from '@/components/admin-header-link';
import { BandeauEgide } from '@/components/bandeau-egide';
import { ThemeToggle } from '@/components/theme-toggle';
import { buildThemeInitScript } from '@/lib/theme';
import './globals.css';
import './tokens-synchronises.css';

export const metadata: Metadata = {
  title: {
    default: 'Azzel',
    template: '%s — Week-end Sportif Aït Aïssi',
  },
  description:
    'Inscriptions, e-dossard et gestion de course pour le Week-end Sportif Aït Aïssi — Sport, Santé et Citoyenneté, au village d’Aït Aïssi (Yakouren).',
};

const themeInitScript = buildThemeInitScript();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-theme="light" suppressHydrationWarning>
      <body>
        <link
          rel="preload"
          href="/charte/fonts/barlow-condensed-latin-700-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/charte/fonts/barlow-condensed-latin-800-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/charte/fonts/inter-latin-400-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        <BandeauEgide />
        <header className="site-header">
          <Link
            className="brand-logo"
            href="/"
            aria-label="Week-end Sportif Aït Aïssi — Accueil"
          >
            <span className="header-logo" aria-hidden="true" />
          </Link>
          <div className="header-actions">
            <AdminHeaderLink />
            <ThemeToggle />
          </div>
        </header>
        <main id="contenu">{children}</main>
        <footer className="site-footer">
          <nav className="footer-nav" aria-label="Se préparer">
            <Link href="/parcours">Parcours</Link>
            <Link href="/region">La région</Link>
          </nav>
          <p className="meta">Plateforme Azzel</p>
        </footer>
      </body>
    </html>
  );
}
