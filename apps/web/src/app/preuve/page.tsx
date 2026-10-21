import { formatLocalDateTime } from '@azzel/shared';

import { DEFAULT_ASSISTANCE_PHONE, AssistanceButton } from '@/components/assistance-button';
import { readEnv } from '@/modules/iam/env';
import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireSession } from '@/modules/iam/session';

import { COUREUR_STATUS_EN_CONSTITUTION } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getPreuveState, type PreuveState } from '@/modules/inscriptions/proof-service';

import { PreuveForm } from './preuve-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preuve de paiement CCP',
};

export default async function PreuvePage() {
  const assistancePhone = readEnv('ASSISTANCE_PHONE') ?? DEFAULT_ASSISTANCE_PHONE;
  const result = await requireSession();
  if (result.status === 'db-unavailable') {
    const { envelope } = toApiError(new DbUnavailableError());
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
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

  let state: PreuveState;
  try {
    state = await getPreuveState(session);
  } catch (error) {
    const { envelope } = toInscriptionsApiError(error);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <h1>Dépôt indisponible</h1>
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
          <p className="surtitre">Preuve de paiement</p>
          <h1>Aucune édition disponible</h1>
          <p className="hint">Aucune édition n’est configurée pour le moment. Réessaie plus tard.</p>
          <div className="auth-alt">
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  if (state.coureurStatus === null) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <h1>Inscris-toi d’abord</h1>
          <p className="lead">
            La preuve de paiement CCP se dépose après ton inscription à l’édition.
          </p>
          <div className="auth-alt">
            <a className="btn-action" href="/inscription">
              M’inscrire à l’édition {state.edition.slug}
            </a>
          </div>
        </article>
      </section>
    );
  }

  if (!state.edition.registrationOpen) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <h1>Les inscriptions sont fermées</h1>
          <p className="lead">
            Les inscriptions se sont clôturées le{' '}
            {formatLocalDateTime(state.edition.registrationClosesAt)} : le dépôt de preuve en
            ligne n’est plus possible.
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

  if (state.coureurStatus !== COUREUR_STATUS_EN_CONSTITUTION) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <h1>Dossier déjà validé</h1>
          <p className="lead">
            Ton dossier a été validé par l’organisation : la preuve de paiement ne peut plus
            être modifiée en ligne.
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

  return <PreuveForm state={state} assistancePhone={assistancePhone} />;
}
