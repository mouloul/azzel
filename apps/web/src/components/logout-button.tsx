'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout(): Promise<void> {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
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
