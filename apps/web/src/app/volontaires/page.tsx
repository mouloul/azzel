import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';
import { toMissionsApiError } from '@/modules/missions/errors';
import { getMissionsVolontaireState } from '@/modules/missions/service';

import './volontaires.css';

// Story 3.2 — espace volontaire : tes missions + couverture générale de
// l'édition. La fiche hors-ligne (3.3) et l'annuaire (3.4) viendront se greffer
// ici : ne rien verrouiller qui empêche l'épopée 4.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace volontaire',
};

export default async function VolontairesPage() {
  const assistancePhone = readAssistancePhone();
  const guard = await requireRolePage('volontaire');
  if (guard.status === 'db-unavailable') {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Connexion indisponible.</p>
            <p className="error-action">Réessaie dans un instant.</p>
          </div>
        </article>
      </section>
    );
  }
  const session = guard.session;

  let state: Awaited<ReturnType<typeof getMissionsVolontaireState>>;
  try {
    state = await getMissionsVolontaireState(session);
  } catch (error) {
    const { envelope } = toMissionsApiError(error);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Tu es connecté</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{envelope.error.message}</p>
            <p className="error-action">{envelope.error.action}</p>
          </div>
          <div className="auth-alt">
            <LogoutButton />
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace volontaire</p>
        <h1>Ton espace mission</h1>
        <p className="lead">
          Ton accès volontaire est lié à <strong>{session.email}</strong>.
          {state.editionNom !== null ? ` Édition : ${state.editionNom}.` : ''}
        </p>

        <h2 className="volontaires-titre">Tes missions</h2>
        {state.mesMissions.length === 0 ? (
          <p className="hint">
            Tu n’as pas encore de mission attribuée — l’équipe t’affectera une
            mission ; cette page se mettra à jour. En attendant, garde ce lien.
          </p>
        ) : (
          <ul className="volontaires-mes-missions">
            {state.mesMissions.map((mission) => (
              <li key={mission.id}>
                <strong>{mission.titre}</strong>
                <span className="meta">
                  {mission.typeLabel} · {mission.secteurNom}
                </span>
                <span className="meta">
                  {formatLocalDateTime(mission.debutLe)} → {formatLocalDateTime(mission.finLe)}
                </span>
                {mission.consignes !== null && mission.consignes.length > 0 ? (
                  <details className="volontaires-consignes">
                    <summary>Consignes</summary>
                    <p className="meta">{mission.consignes}</p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <h2 className="volontaires-titre">Toutes les missions de l’édition</h2>
        {state.missions.length === 0 ? (
          <p className="hint">Les missions de l’édition ne sont pas encore publiées.</p>
        ) : (
          <ul className="volontaires-mes-missions">
            {state.missions.map((mission) => (
              <li key={mission.id}>
                <strong>{mission.titre}</strong>
                <span className="meta">
                  {mission.typeLabel} · {mission.secteurNom}
                </span>
                <span className="meta">
                  {formatLocalDateTime(mission.debutLe)} → {formatLocalDateTime(mission.finLe)} ·{' '}
                  {mission.couverture === 'couverte'
                    ? 'couverture assurée'
                    : 'vacante — besoins volontaires'}
                </span>
                {mission.consignes !== null && mission.consignes.length > 0 ? (
                  <details className="volontaires-consignes">
                    <summary>Consignes</summary>
                    <p className="meta">{mission.consignes}</p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="auth-alt">
          <LogoutButton />
          <AssistanceButton phone={assistancePhone} />
        </div>
      </article>
    </section>
  );
}
