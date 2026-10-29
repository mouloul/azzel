import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import {
  COUREUR_STATUS_EN_CONSTITUTION,
  formatDateFrUtc,
} from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getInscriptionState, type InscriptionState } from '@/modules/inscriptions/service';

import { InscriptionForm } from './inscription-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Inscription à l’édition',
};

export default async function InscriptionPage() {
  // Garde de RÔLE, pas seulement de session : un organisateur ou un
  // volontaire est renvoyé vers son espace au lieu de rester ici.
  const result = await requireRolePage('coureur');
  if (result.status === 'db-unavailable') {
    const { envelope } = toApiError(new DbUnavailableError());
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{envelope.error.message}</p>
            <p className="error-action">{envelope.error.action}</p>
          </div>
        </article>
      </section>
    );
  }
  const session = result.session;

  let state: InscriptionState;
  try {
    state = await getInscriptionState(session);
  } catch (error) {
    const { envelope } = toInscriptionsApiError(error);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h1>Inscription indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{envelope.error.message}</p>
            <p className="error-action">{envelope.error.action}</p>
          </div>
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Retour à mon espace
            </a>
          </div>
        </article>
      </section>
    );
  }

  if (!state.edition) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h1>Aucune édition disponible</h1>
          <p className="hint">
            Aucune édition n’est configurée pour le moment. Réessaie plus tard.
          </p>
        </article>
      </section>
    );
  }

  if (!state.edition.registrationOpen) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h1>Les inscriptions sont fermées</h1>
          <p className="lead">
            Les inscriptions se sont clôturées le{' '}
            {formatDateFrUtc(state.edition.registrationClosesAt)}.
          </p>
          <p className="hint">
            Contacte l’organisation pour savoir si une inscription tardive reste possible.
          </p>
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Retour à mon espace
            </a>
          </div>
        </article>
      </section>
    );
  }

  if (state.coureur && state.coureur.status !== COUREUR_STATUS_EN_CONSTITUTION) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h1>Dossier déjà validé</h1>
          <p className="lead">
            Ton dossier a été validé par l’organisation : il ne peut plus être modifié en ligne.
          </p>
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Voir mon inscription
            </a>
          </div>
        </article>
      </section>
    );
  }

  return <InscriptionForm state={state} />;
}
