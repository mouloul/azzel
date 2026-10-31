'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { effacerEtatVolontaires } from '@/lib/idb-volontaires';
import { purgerCachesCoureur } from '@/lib/pwa-coureur';
import { CONNEXION_PATH } from '@/modules/iam/constants';

export function LogoutButton({
  libelle = 'Se déconnecter',
  className = 'btn-contour',
}: {
  /** Libellé du bouton (l'onglet Mon trail dit « Me déconnecter »). */
  libelle?: string;
  className?: string;
} = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout(): Promise<void> {
    setPending(true);
    // Appareil partagé (stories 3.3/4.1) : les poches liées au COMPTE — fiche
    // et annuaire volontaires en IndexedDB + caches des service workers
    // volontaires ET coureur (le QR e-dossard) — ne survivent pas à la
    // déconnexion. Story 4.3 (AD-5) : l'outbox terrain et l'appareilId
    // appartiennent à l'APPAREIL, ils sont conservés (jetons opaques seulement).
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
    router.replace(CONNEXION_PATH);
  }

  return (
    <button type="button" className={className} onClick={onLogout} disabled={pending}>
      {pending ? 'Déconnexion…' : libelle}
    </button>
  );
}
