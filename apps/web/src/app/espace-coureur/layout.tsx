import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PwaRegisterCoureur } from '@/components/pwa-register-coureur';
import { readAssistancePhone } from '@/lib/assistance-phone';

// Story 4.1 — layout de l'espace coureur : enregistrement du service worker
// e-dossard (scope /espace-coureur — jamais la vitrine ni les autres espaces).
// Pas de manifeste dédié : l'e-dossard vit dans le navigateur, le raccourci
// système (écran d'accueil) suffit à NFR-6.

export const metadata: Metadata = {
  title: 'Espace coureur',
};

export default function EspaceCoureurLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PwaRegisterCoureur assistancePhone={readAssistancePhone()} />
      {children}
    </>
  );
}
