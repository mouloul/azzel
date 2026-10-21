import { formatLocalDateTime } from '@azzel/shared';

import { LogoutButton } from '@/components/logout-button';
import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireSession } from '@/modules/iam/session';

import { AGE_CATEGORY_LABELS, formatDateFrUtc, type AgeCategory } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getInscriptionState } from '@/modules/inscriptions/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace coureur',
};

export default async function EspaceCoureurPage() {
  const result = await requireSession();
  if (result.status === 'db-unavailable') {
    const { envelope } = toApiError(new DbUnavailableError());
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace coureur</p>
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

  let state: Awaited<ReturnType<typeof getInscriptionState>> | null = null;
  let failure: ReturnType<typeof toInscriptionsApiError> | null = null;
  try {
    state = await getInscriptionState(session);
  } catch (error) {
    failure = toInscriptionsApiError(error);
  }

  return (
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace coureur</p>
        <h1>Tu es connecté</h1>
        <p className="lead">
          Ton accès est lié à <strong>{session.email}</strong>.
        </p>
        <p className="meta">
          Session ouverte le {formatLocalDateTime(session.createdAt.toISOString())}
        </p>
        <p className="hint">
          Session unique : te connecter sur un autre appareil déconnecte automatiquement
          celui-ci.
        </p>
        <div className="auth-alt">
          <LogoutButton />
        </div>
      </article>

      {failure !== null && (
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h2>Inscription indisponible</h2>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{failure.envelope.error.message}</p>
            <p className="error-action">{failure.envelope.error.action}</p>
          </div>
        </article>
      )}

      {state?.edition && (
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h2>{state.edition.nom}</h2>
          {state.coureur ? (
            <>
              <p>
                Ton épreuve :{' '}
                <strong>
                  {state.coureur.epreuveNom} ({state.coureur.distanceKm} km)
                </strong>
              </p>
              <p>
                Catégorie : {AGE_CATEGORY_LABELS[state.coureur.categorie as AgeCategory]} —{' '}
                {state.coureur.age} ans le jour de la course
              </p>
              <p>T-shirt : {state.coureur.tailleTshirt}</p>
              <p>
                Contact d’urgence : {state.coureur.contactUrgenceNom} ·{' '}
                {state.coureur.contactUrgenceTelephone}
              </p>
              <p className="mono">Dossier : {state.coureur.status}</p>
              <p className="meta">
                Clôture des inscriptions : {formatDateFrUtc(state.edition.registrationClosesAt)}
              </p>
              {state.edition.registrationOpen ? (
                <div className="auth-alt">
                  <a className="btn-contour" href="/inscription">
                    Modifier mon inscription
                  </a>
                </div>
              ) : (
                <p className="hint">
                  Les inscriptions sont fermées : les modifications en ligne ne sont plus
                  possibles.
                </p>
              )}
            </>
          ) : state.edition.registrationOpen ? (
            <>
              <p className="lead">
                Course le {formatDateFrUtc(state.edition.dateCourse)} : choisis ton épreuve,
                complète ton dossier et réserve ta place.
              </p>
              <a className="btn-action" href="/inscription">
                M’inscrire à l’édition {state.edition.slug}
              </a>
              <p className="meta">
                Clôture des inscriptions : {formatDateFrUtc(state.edition.registrationClosesAt)}
              </p>
            </>
          ) : (
            <p className="hint">Les inscriptions à cette édition sont fermées.</p>
          )}
        </article>
      )}
    </section>
  );
}
