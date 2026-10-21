import { formatLocalDateTime } from '@azzel/shared';

import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireSession } from '@/modules/iam/session';

import { COUREUR_STATUS_EN_CONSTITUTION, DOCUMENT_SLUGS } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getAcceptancesState, type AcceptancesState } from '@/modules/inscriptions/service';

import { AcceptancesForm } from './acceptances-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Décharge et règlement',
};

export default async function AcceptationsPage() {
  const result = await requireSession();
  if (result.status === 'db-unavailable') {
    const { envelope } = toApiError(new DbUnavailableError());
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Documents</p>
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

  let state: AcceptancesState;
  try {
    state = await getAcceptancesState(session);
  } catch (error) {
    const { envelope } = toInscriptionsApiError(error);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Documents</p>
          <h1>Documents indisponibles</h1>
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
          <p className="surtitre">Documents</p>
          <h1>Aucune édition disponible</h1>
          <p className="hint">Aucune édition n’est configurée pour le moment. Réessaie plus tard.</p>
        </article>
      </section>
    );
  }

  if (state.coureurStatus === null) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Documents</p>
          <h1>Inscris-toi d’abord</h1>
          <p className="lead">
            La décharge de bonne santé et le règlement intérieur se signent après ton
            inscription.
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
          <p className="surtitre">Documents</p>
          <h1>Les inscriptions sont fermées</h1>
          <p className="lead">
            Les inscriptions se sont clôturées le{' '}
            {formatLocalDateTime(state.edition.registrationClosesAt)} : les acceptations en
            ligne ne sont plus possibles.
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
          <p className="surtitre">Documents</p>
          <h1>Dossier déjà validé</h1>
          <p className="lead">
            Ton dossier a été validé par l’organisation : les acceptations ne peuvent plus
            être modifiées en ligne.
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

  if (!state.documents.length || !DOCUMENT_SLUGS.every((slug) => state.documents.some((document) => document.slug === slug))) {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Documents</p>
          <h1>Documents indisponibles</h1>
          <p className="hint">
            La décharge de bonne santé et le règlement intérieur ne sont pas tous les deux
            publiés par l’organisation. Réessaie plus tard.
          </p>
        </article>
      </section>
    );
  }

  return <AcceptancesForm state={state} />;
}
