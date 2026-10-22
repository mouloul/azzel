import { requireRolePage } from '@/modules/iam/session';
import { toMissionsApiError } from '@/modules/missions/errors';
import { getMissionsAdminState } from '@/modules/missions/service';

import { AdminIndisponible } from '../indisponible';
import { MissionsManager } from './missions-manager';
import './missions.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Secteurs et missions',
};

export default async function AdminMissionsPage() {
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

  let state: Awaited<ReturnType<typeof getMissionsAdminState>>;
  try {
    state = await getMissionsAdminState(session);
  } catch (error) {
    const { envelope } = toMissionsApiError(error);
    return (
      <AdminIndisponible
        titre="Missions indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Secteurs et missions{state.edition ? ` — ${state.edition.nom}` : ''}</h1>
        <p className="lead">
          Découpe ton édition en secteurs, puis crée des missions typées (scan,
          accueil, sécurité…). Affecte tes volontaires importés : chaque mission
          affiche son état <strong>couverte</strong> ou <strong>vacante</strong>. Un
          chevauchement d’horaires pour un volontaire déclenche un avertissement —
          jamais un blocage.
        </p>
        <MissionsManager
          edition={state.edition}
          secteurs={state.secteurs}
          volontaires={state.volontaires}
        />
      </article>
    </section>
  );
}
