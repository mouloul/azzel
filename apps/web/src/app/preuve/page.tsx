import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { FilEtapes, etapesPreuve } from '@/components/fil-etapes';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import { canDepositPreuve } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getPreuveState, type PreuveState } from '@/modules/inscriptions/proof-service';
import { getMontantDu } from '@/modules/inscriptions/service';

import { PreuveForm } from './preuve-form';
import '../dossier.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preuve de paiement CCP',
};

export default async function PreuvePage() {
  const assistancePhone = readAssistancePhone();
  // Garde de RÔLE, pas seulement de session : un organisateur ou un
  // volontaire est renvoyé vers son espace au lieu de rester ici.
  const result = await requireRolePage('coureur');
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

  // Le montant ne fait jamais tomber la page : getMontantDu rend null plutôt
  // que de lever, et l'encart disparaît.
  const montant = await getMontantDu(session);

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

  if (!canDepositPreuve(state.coureurStatus)) {
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

  return (
    <>
      {state.coureurStatus === 'refusé' && state.refusalReason !== null ? (
        <section className="auth">
          <article className="card">
            <div role="alert" aria-live="assertive" className="error-box">
              <p className="error-message">Ta preuve a été refusée.</p>
              <p className="error-action">Motif : {state.refusalReason}</p>
              <div className="auth-alt">
                <AssistanceButton phone={assistancePhone} />
              </div>
            </div>
          </article>
        </section>
      ) : null}
      <PreuveForm state={state} assistancePhone={assistancePhone}>
        <FilEtapes
          etapes={etapesPreuve(state.coureurStatus, state.documentsAcceptes)}
        />
        {montant !== null ? (
          <p className="encart-montant" role="status">
            Montant à verser :{' '}
            <strong>{`${montant.totalDa} DA`}</strong>
            {montant.avecHebergement
              ? ` — dossard ${montant.prixDossardDa} DA et hébergement ${montant.prixHebergementDa} DA, en un seul versement.`
              : ` — le dossard seul.`}
          </p>
        ) : null}
      </PreuveForm>
    </>
  );
}
