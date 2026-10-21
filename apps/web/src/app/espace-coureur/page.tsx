import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton, DEFAULT_ASSISTANCE_PHONE } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readEnv } from '@/modules/iam/env';
import { requireSession } from '@/modules/iam/session';

import { AGE_CATEGORY_LABELS, COUREUR_STATUS_EN_CONSTITUTION, COUREUR_STATUS_REFUSE, canDepositPreuve, formatDateFrUtc, type AgeCategory } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { formatKiloBytes } from '@/modules/inscriptions/proof-format';
import { getPreuveState, type PreuveState } from '@/modules/inscriptions/proof-service';
import { getInscriptionState } from '@/modules/inscriptions/service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace coureur',
};

export default async function EspaceCoureurPage() {
  const assistancePhone = readEnv('ASSISTANCE_PHONE') ?? DEFAULT_ASSISTANCE_PHONE;
  const result = await requireSession();
  if (result.status === 'db-unavailable') {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace coureur</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Connexion indisponible.</p>
            <p className="error-action">Réessaie dans un instant.</p>
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

  let preuveState: PreuveState | null = null;
  let preuveIndisponible = false;
  if (state !== null) {
    try {
      preuveState = await getPreuveState(session);
    } catch {
      preuveIndisponible = true;
    }
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
              {state.coureur.status === COUREUR_STATUS_REFUSE &&
              state.coureur.refusalReason !== null ? (
                <div role="alert" aria-live="assertive" className="error-box">
                  <p className="error-message">Ton dossier a été refusé.</p>
                  <p className="error-action">Motif : {state.coureur.refusalReason}</p>
                  {state.edition.registrationOpen ? (
                    <div className="auth-alt">
                      <a className="btn-action" href="/preuve">
                        Déposer une nouvelle preuve
                      </a>
                    </div>
                  ) : null}
                  <div className="auth-alt">
                    <AssistanceButton phone={assistancePhone} />
                  </div>
                </div>
              ) : null}
              {state.coureur.dechargeAccepte !== null &&
              state.coureur.reglementAccepte !== null ? (
                <p className="mono">
                  Décharge + règlement : acceptés le{' '}
                  {formatLocalDateTime(state.coureur.dechargeAccepte.acceptedAt)} (décharge{' '}
                  {state.coureur.dechargeAccepte.version} · règlement{' '}
                  {state.coureur.reglementAccepte.version})
                </p>
              ) : state.edition.registrationOpen &&
                state.coureur.status === COUREUR_STATUS_EN_CONSTITUTION ? (
                <div className="auth-alt">
                  <a className="btn-contour" href="/acceptations">
                    Accepter la décharge et le règlement
                  </a>
                </div>
              ) : (
                <p className="mono">Décharge + règlement : à accepter</p>
              )}
              {preuveIndisponible ? (
                <p className="mono">Preuve de paiement : état indisponible — réessaie plus tard.</p>
              ) : preuveState?.preuve != null ? (
                <>
                  <p className="mono">
                    Preuve de paiement : déposée le{' '}
                    {formatLocalDateTime(preuveState.preuve.depositedAt)} ·{' '}
                    {formatKiloBytes(preuveState.preuve.sizeBytes)} · remplaçable
                  </p>
                  {state.edition.registrationOpen &&
                  canDepositPreuve(state.coureur.status) ? (
                    <div className="auth-alt">
                      <a className="btn-contour" href="/preuve">
                        Remplacer ma preuve de paiement
                      </a>
                    </div>
                  ) : null}
                </>
              ) : preuveState !== null &&
                state.edition.registrationOpen &&
                canDepositPreuve(state.coureur.status) ? (
                <div className="auth-alt">
                  <a className="btn-action" href="/preuve">
                    Déposer ma preuve de paiement CCP
                  </a>
                </div>
              ) : null}
              <p className="meta">
                Clôture des inscriptions :{' '}
                {formatLocalDateTime(state.edition.registrationClosesAt)}
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
                Clôture des inscriptions :{' '}
                {formatLocalDateTime(state.edition.registrationClosesAt)}
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
