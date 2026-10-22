'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { effacerEtatVolontaires } from '@/lib/idb-volontaires';
import { purgerCachesCoureur } from '@/lib/pwa-coureur';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout(): Promise<void> {
    setPending(true);
    // Appareil partagé (stories 3.3/4.1) : les poches locales — fiche et
    // annuaire volontaires en IndexedDB + caches des service workers
    // volontaires ET coureur (le QR e-dossard) — ne survivent pas au compte.
    // Purge SYSTÉMATIQUE, parallèle à l'appel d'API et indépendante de son
    // succès : la redirection a lieu de toute façon, et le QR ne doit jamais
    // rester sur l'appareil si le serveur est injoignable. Silencieuse par
    // construction : elle ne bloque jamais la sortie.
    try {
      await Promise.all([
        effacerEtatVolontaires(),
        purgerCachesCoureur(),
        fetch('/api/auth/logout', { method: 'POST' }),
      ]);
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
