import { requireRolePage } from '@/modules/iam/session';
import { toSponsorsApiError } from '@/modules/sponsors/errors';
import { getSponsorsAdminState } from '@/modules/sponsors/service';

import { AdminIndisponible } from '../indisponible';
import { SponsorsManager } from './sponsors-manager';
import './sponsors.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sponsors',
};

export default async function AdminSponsorsPage() {
  const guard = await requireRolePage('organisateur');
  if (guard.status === 'db-unavailable') {
    return (
      <AdminIndisponible
        titre="Connexion indisponible"
        message="Connexion indisponible."
        action="Réessaie dans un instant."
      />
    );
  }
  const session = guard.session;

  let state: Awaited<ReturnType<typeof getSponsorsAdminState>>;
  try {
    state = await getSponsorsAdminState(session);
  } catch (error) {
    const { envelope } = toSponsorsApiError(error);
    return (
      <AdminIndisponible
        titre="Sponsors indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Sponsors</h1>
        <p className="lead">
          Configure la section « Partenaires » de la page d’accueil : le mode
          d’affichage et la liste des sponsors. Chaque changement est visible sur
          l’accueil au simple rechargement.
        </p>
        <SponsorsManager mode={state.mode} sponsors={state.sponsors} />
      </article>
    </section>
  );
}
