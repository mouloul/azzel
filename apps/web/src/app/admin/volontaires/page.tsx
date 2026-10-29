import { requireRolePage } from '@/modules/iam/session';
import { toMissionsApiError } from '@/modules/missions/errors';
import { getVolontairesAdminState } from '@/modules/missions/service';

import { AdminIndisponible } from '../indisponible';
import { VolontairesManager } from './volontaires-manager';
import './volontaires.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Volontaires',
};

export default async function AdminVolontairesPage() {
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

  let state: Awaited<ReturnType<typeof getVolontairesAdminState>>;
  try {
    state = await getVolontairesAdminState(session);
  } catch (error) {
    const { envelope } = toMissionsApiError(error);
    return (
      <AdminIndisponible
        titre="Volontaires indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Volontaires</h1>
        <p className="lead">
          Arme ton édition sans saisie manuelle : importe un fichier Excel ou CSV
          (nom, email, téléphone). Chaque volontaire reçoit une invitation par
          email et se connecte sur <code>/connexion</code> avec son adresse et un
          code de vérification, comme les coureurs. Le rapport t’indique ligne par ligne ce qui a été
          créé, ignoré ou rejeté — jamais d’import silencieux.
        </p>
        <VolontairesManager volontaires={state.volontaires} />
        <p className="hint">
          Prochaine étape :{' '}
          <a className="btn-lien" href="/admin/missions">
            découpe ton édition en secteurs et missions
          </a>{' '}
          puis affecte ces volontaires.
        </p>
      </article>
    </section>
  );
}
