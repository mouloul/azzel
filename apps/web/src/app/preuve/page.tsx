import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { FilEtapes, etapesPreuve } from '@/components/fil-etapes';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import { canDepositPreuve } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getPreuveState, type PreuveState } from '@/modules/inscriptions/proof-service';
import { getComptesPaiement, getMontantDu } from '@/modules/inscriptions/service';

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

  const comptes = await getComptesPaiement(session);
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
        {comptes !== null ? (
          <section className="encart-comptes" aria-labelledby="titre-comptes">
            <p className="encart-comptes__surtitre">Où verser</p>
            <h2 id="titre-comptes" className="encart-comptes__titre">
              Rappel des comptes de l’événement
            </h2>
            <p className="encart-comptes__intro">
              Verse le montant ci-dessus sur{' '}
              {comptes.ccp !== null && comptes.baridimob !== null
                ? 'l’un des deux comptes ci-dessous, CCP ou Baridimob (pas les deux).'
                : 'le compte ci-dessous.'}
            </p>
            <div className="encart-comptes__liste">
              {comptes.ccp !== null ? (
                <dl className="encart-comptes__compte">
                  <dt>Compte CCP</dt>
                  <dd className="encart-comptes__numero">{comptes.ccp}</dd>
                  {comptes.titulaireCcp !== null ? (
                    <>
                      <dt>Titulaire</dt>
                      <dd>{comptes.titulaireCcp}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
              {comptes.ccp !== null && comptes.baridimob !== null ? (
                <p className="encart-comptes__ou" aria-hidden="true">
                  ou
                </p>
              ) : null}
              {comptes.baridimob !== null ? (
                <dl className="encart-comptes__compte">
                  <dt>RIP Baridimob</dt>
                  <dd className="encart-comptes__numero">{comptes.baridimob}</dd>
                  {comptes.titulaireBaridimob !== null ? (
                    <>
                      <dt>Titulaire</dt>
                      <dd>{comptes.titulaireBaridimob}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </div>
            <ul className="encart-comptes__regles">
              <li>
                <strong>Un versement par personne.</strong> Chaque coureur règle sa propre
                participation, en un seul versement : un paiement ne vaut que pour une
                inscription.
              </li>
              <li>
                <strong>Le reçu CCP ou Baridimob</strong> porte un numéro de transaction.
                Il doit être parfaitement lisible sur la pièce jointe.
              </li>
              <li>
                <strong>Ce numéro est unique.</strong> Tu le saisis ci-dessous ; le système
                vérifie qu’il n’a jamais servi, pour qu’un même reçu ne puisse pas valider
                plusieurs inscriptions.
              </li>
            </ul>
          </section>
        ) : null}
      </PreuveForm>
    </>
  );
}
