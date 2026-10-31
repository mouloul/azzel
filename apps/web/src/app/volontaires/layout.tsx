import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { PwaRegister } from '@/components/pwa-register';

// Story 3.3 — layout PWA de la surface volontaires : manifeste + icônes
// dédiées, thème clair/sombre pour la barre système, enregistrement du
// service worker (scope /volontaires — jamais la vitrine). Le layout racine
// (en-tête vitrine + bascule de thème) reste inchangé : pas de route group.

export const metadata: Metadata = {
  title: 'Espace volontaire',
  // iOS anciens : standalone + titre dédié sous l'icône (iOS ne lit pas le
  // champ display du manifeste sur les vieilles versions).
  appleWebApp: { capable: true, title: 'Azzel Volontaires' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Standalone iOS : env(safe-area-inset-*) n'est renseigné qu'avec
  // viewport-fit=cover (barre « Appeler l'équipe » hors de l'indicateur).
  viewportFit: 'cover',
  themeColor: [
    // Aligné sur le theme_color du manifeste (vert Djurdjura) : la barre
    // système porte la couleur terrain dans les deux modes.
    { media: '(prefers-color-scheme: light)', color: '#345E4A' },
    { media: '(prefers-color-scheme: dark)', color: '#101A14' },
  ],
};

export default function VolontairesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="manifest" href="/volontaires/manifest.webmanifest" />
      <link
        rel="apple-touch-icon"
        href="/volontaires/apple-touch-icon-180.png"
        sizes="180x180"
      />
      <PwaRegister />
      {children}
    </>
  );
}
