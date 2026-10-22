'use client';

import { useEffect } from 'react';

// Story 4.1 — enregistrement du service worker e-dossard. Scope réduit à
// /espace-coureur : la vitrine, l'admin et le portail volontaires ne passent
// jamais par lui. Le numéro d'assistance voyage dans l'URL du SW
// (?assistance=…) : la page d'explication hors-ligne peut ainsi proposer
// « Appeler l'équipe » sans accès à l'environnement serveur. L'enregistrement
// attend la fin du chargement pour ne pas concurrencer le premier rendu ; un
// échec (navigateur sans SW, premier lancement hors-ligne) est silencieux —
// la page serveur reste le plan A.

export function PwaRegisterCoureur({ assistancePhone }: { assistancePhone: string }) {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const enregistrer = () => {
      navigator.serviceWorker
        .register(`/sw-coureur.js?assistance=${encodeURIComponent(assistancePhone)}`, {
          scope: '/espace-coureur',
        })
        .catch(() => {
          // Réessaiera à la prochaine ouverture de la page.
        });
    };
    if (document.readyState === 'complete') {
      enregistrer();
      return;
    }
    window.addEventListener('load', enregistrer, { once: true });
    return () => window.removeEventListener('load', enregistrer);
  }, [assistancePhone]);

  return null;
}
