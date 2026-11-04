import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminHeaderLink } from '@/components/admin-header-link';
import { MonTrail } from '@/components/mon-trail';
import { ThemeToggle } from '@/components/theme-toggle';
import { buildThemeInitScript } from '@/lib/theme';
import './globals.css';
import './socle.css';
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
        {/* Préchargements du chemin critique : Barlow 800 (titre du hero, LCP)
            et Inter 400 (texte courant). Barlow Condensed 700 (libellés de
            boutons, rail, nav) n'est pas préchargé : son @font-face reste dans
            tokens-synchronises.css avec font-display swap, et le repli
            métriquement calibré « Barlow Condensed Fallback » (ascent/descent
            overrides + size-adjust) garantit des hauteurs de ligne identiques —
            mesure CDP : aucun déplacement vertical, seules les pilules et la nav
            se recalent horizontalement (CLS ≈ 0,002, seuil 0,1). Spec 9.6 : ce
            retrait n'enlève AUCUN octet de la page (la police reste servie via
            @font-face) — il sort la police du décompte du chemin critique du
            script de budget et débloque le premier rendu, qui n'attend plus ce
            fichier. */}
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
        <header className="site-header">
          <div className="site-header__inner">
            <Link
              className="brand-logo"
              href="/"
              aria-label="Week-end Sportif Aït Aïssi — Accueil"
            >
              <span className="header-logo" aria-hidden="true" />
            </Link>
            {/* Navigation vitrine dans l'en-tête à partir de 960 px (sous ce
                seuil, le pied de page porte les mêmes liens). */}
            <nav className="header-nav" aria-label="La course">
              <Link href="/parcours">Parcours</Link>
              <Link href="/region">La région</Link>
              <Link href="/retour-en-images">Retour en images</Link>
              <Link href="/resultats">Résultats</Link>
            </nav>
            <div className="header-actions">
              <AdminHeaderLink />
              <ThemeToggle />
            </div>
          </div>
        </header>
        {/* Onglet « Mon trail » (bord droit) : session lue côté client, à
            l'ouverture de l'encart seulement — le layout reste statique. */}
        <MonTrail />
        <main id="contenu">{children}</main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <nav className="footer-nav" aria-label="Le week-end sportif">
              <Link href="/parcours">Parcours</Link>
              <Link href="/region">La région</Link>
              {/* Story 2.5 — un simple lien texte : le trailer et la page retour en
                  images restent hors du budget de premier chargement de l'accueil. */}
              <Link href="/retour-en-images">Retour en images</Link>
              {/* Story 7.2 — résultats en direct partageables : la course devient
                  lisible de l'extérieur le jour J, lien sobre dans la même nav. */}
              <Link href="/resultats">Résultats</Link>
            </nav>
            <p className="meta">Plateforme Azzel</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
