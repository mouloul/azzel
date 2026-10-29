'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ADMIN_HOME_PATH } from '@/modules/iam/constants';
import { fetchAvecDelai } from '@/lib/fetch-delai';

/**
 * Lien vers l'administration, affiché quand la session est celle d'un
 * organisateur. Le rôle est demandé au serveur côté client, à dessein : le lire
 * dans le layout rendrait TOUTE l'application dynamique et ferait tomber le
 * cache de l'accueil (budget de premier chargement).
 *
 * Une panne réseau ne doit pas faire disparaître le lien en silence — c'était
 * le cas, et l'organisateur n'avait alors plus aucun chemin vers l'admin. On
 * réessaie donc une fois avant d'abandonner, et `/admin` existe désormais.
 */
export function AdminHeaderLink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function lireRole(): Promise<boolean> {
      const response = await fetchAvecDelai('/api/auth/session', { method: 'GET' }, 10_000);
      if (!response.ok) {
        // 401/403 : visiteur anonyme ou non-organisateur — réponse légitime,
        // inutile de réessayer.
        return false;
      }
      const payload = (await response.json()) as { role?: unknown };
      return payload.role === 'organisateur';
    }

    void (async () => {
      for (let essai = 0; essai < 2; essai += 1) {
        try {
          const organisateur = await lireRole();
          if (!cancelled && organisateur) {
            setVisible(true);
          }
          return;
        } catch {
          // Échec réseau ou délai dépassé : un second essai, puis on renonce.
          if (cancelled) {
            return;
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }
  return (
    <Link className="admin-link" href={ADMIN_HOME_PATH}>
      Administration
    </Link>
  );
}
