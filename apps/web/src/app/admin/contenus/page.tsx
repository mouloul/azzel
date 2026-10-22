import { requireRolePage } from '@/modules/iam/session';
import { toContenusApiError } from '@/modules/contenus/errors';
import { getContenusAdminState } from '@/modules/contenus/service';

import { AdminIndisponible } from '../indisponible';
import { ContenusManager } from './contenus-manager';
import './contenus.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Contenus',
};

export default async function AdminContenusPage() {
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

  let state: Awaited<ReturnType<typeof getContenusAdminState>>;
  try {
    state = await getContenusAdminState(session);
  } catch (error) {
    const { envelope } = toContenusApiError(error);
    return (
      <AdminIndisponible
        titre="Contenus indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Contenus de la vitrine</h1>
        <p className="lead">
          Modifie les blocs des pages « Parcours » et « La région » : titres,
          textes et adresse du tracé GPX. Chaque changement est visible sur le
          site public au simple rechargement.
        </p>
        <ContenusManager blocs={state.blocs} />
      </article>
    </section>
  );
}
