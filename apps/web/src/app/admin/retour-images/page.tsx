import { requireRolePage } from '@/modules/iam/session';
import { toRetourImagesApiError } from '@/modules/retour-images/errors';
import { getRetourImagesAdminState } from '@/modules/retour-images/service';

import { AdminIndisponible } from '../indisponible';
import { RetourImagesManager } from './retour-images-manager';
import './retour-images.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Retour en images',
};

export default async function AdminRetourImagesPage() {
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

  let state: Awaited<ReturnType<typeof getRetourImagesAdminState>>;
  try {
    state = await getRetourImagesAdminState(session);
  } catch (error) {
    const { envelope } = toRetourImagesApiError(error);
    return (
      <AdminIndisponible
        titre="Retour en images indisponible"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Retour en images</h1>
        <p className="lead">
          Configure la page « Retour en images » de la vitrine : l’adresse de la
          vidéo de la première édition et les témoignages des coureurs. Chaque
          changement est visible sur la page au simple rechargement.
        </p>
        <RetourImagesManager trailerUrl={state.trailerUrl} temoignages={state.temoignages} />
      </article>
    </section>
  );
}
