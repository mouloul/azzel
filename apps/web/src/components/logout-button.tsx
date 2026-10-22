'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { effacerEtatVolontaires } from '@/lib/idb-volontaires';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout(): Promise<void> {
    setPending(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        // Appareil partagé (story 3.3) : la poche volontaires — fiche en
        // IndexedDB et caches du service worker — ne survit pas à la
        // déconnexion. Purge silencieuse : elle ne bloque jamais la sortie.
        await effacerEtatVolontaires();
      }
    } catch {} finally {
      setPending(false);
    }
    router.replace('/connexion');
  }

  return (
    <button type="button" className="btn-contour" onClick={onLogout} disabled={pending}>
      {pending ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  );
}
