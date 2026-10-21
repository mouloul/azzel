'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function AdminHeaderLink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { role?: unknown };
        if (!cancelled && payload.role === 'organisateur') {
          setVisible(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }
  return (
    <Link className="admin-link" href="/admin/dossiers">
      Administration
    </Link>
  );
}
