import type { ReactNode } from 'react';

import { requireRolePage } from '@/modules/iam/session';

import { AdminNav } from './admin-nav';
import './admin.css';

export const dynamic = 'force-dynamic';

/**
 * Coquille de l'espace d'administration : garde de rôle mutualisée et
 * navigation entre les sections. Les pages conservent leur propre
 * `requireRolePage` — défense en profondeur, même philosophie que `withOrg`.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const guard = await requireRolePage('organisateur');
  if (guard.status === 'db-unavailable') {
    // La page rendra son propre écran « Connexion indisponible » : on se
    // contente de ne pas afficher une navigation trompeuse.
    return <>{children}</>;
  }
  return (
    <div className="admin-shell">
      <AdminNav />
      {children}
    </div>
  );
}
