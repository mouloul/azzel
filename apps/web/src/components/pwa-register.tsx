'use client';

import { useEffect } from 'react';

import { enregistrerSwVolontaires } from '@/lib/pwa-volontaires';

// Story 3.3 — enregistrement du service worker volontaires. Scope réduit à
// /volontaires : la vitrine, l'admin et l'espace coureur ne passent jamais
// par lui. L'enregistrement attend la fin du chargement pour ne pas
// concurrencer le premier rendu ; un échec (navigateur sans SW, premier
// lancement hors-ligne) ne casse rien — la page serveur reste le plan A.
// Chemin, scope et journalisation de l'échec : lib/pwa-volontaires (testé).

export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const enregistrer = () => {
      void enregistrerSwVolontaires(navigator.serviceWorker);
    };
    if (document.readyState === 'complete') {
      enregistrer();
      return;
    }
    window.addEventListener('load', enregistrer, { once: true });
    return () => window.removeEventListener('load', enregistrer);
  }, []);

  return null;
}
