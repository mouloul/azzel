import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { FilEtapes, etapesPreuve } from '@/components/fil-etapes';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { lectureBornee, lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';
import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import {
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_EXPIREE,
  COUREUR_STATUS_LISTE_ATTENTE,
  COUREUR_STATUS_REFUSE,
  canDepositPreuve,
} from '@/modules/inscriptions/domain';
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
  const montant = await lectureBornee(getMontantDu(session), null, 'montant dû');

  let state: PreuveState;
  try {
    state = await lectureBorneeOuIndisponible(getPreuveState(session), 'preuve');
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

  if (state.coureurStatus === COUREUR_STATUS_EN_VALIDATION) {
    // Dossier en validation : lecture seule, avant même la clôture des
    // inscriptions (le dépôt est fait, la clôture ne le concerne plus). Aucun
    // remplacement (PO, 11/11/2026) : l'organisateur ne doit jamais valider
    // une preuve qu'il n'a pas vue. Une erreur se corrige par l'organisation,
    // qui refuse le dossier ; le coureur le reprend ensuite.
    const preuve = state.preuve;
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <FilEtapes etapes={etapesPreuve(state.coureurStatus, state.documentsAcceptes)} />
          <h1>Preuve déposée</h1>
          <p className="encart-attente" role="status">
            Ton dossier est <strong>en cours de validation</strong> par l’organisation. Tu
            reçois un email dès sa décision — tu n’as rien d’autre à faire d’ici là.
          </p>
          {preuve !== null ? (
            <div className="recap">
              <p className="recap-titre">Preuve déposée</p>
              <p>
                Déposée le {formatLocalDateTime(preuve.depositedAt)} · {preuve.format}
              </p>
              {preuve.numeroTransaction !== null ? (
                <p>N° de transaction : {preuve.numeroTransaction}</p>
              ) : null}
            </div>
          ) : (
            <p className="hint">
              Ta preuve est enregistrée ; son détail est momentanément indisponible.
            </p>
          )}
          <p className="hint">
            Tu t’es trompé de fichier ? Contacte l’organisation : elle refusera ton dossier,
            que tu pourras ensuite reprendre avec « Modifier mon inscription ».
          </p>
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Retour à mon espace
            </a>
            <AssistanceButton phone={assistancePhone} />
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
    const refuse = state.coureurStatus === COUREUR_STATUS_REFUSE;
    const aReprendre = refuse || state.coureurStatus === COUREUR_STATUS_EXPIREE;
    const enAttente = state.coureurStatus === COUREUR_STATUS_LISTE_ATTENTE;
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <h1>
            {aReprendre
              ? refuse
                ? 'Dossier refusé'
                : 'Inscription expirée'
              : enAttente
                ? 'Inscription en liste d’attente'
                : 'Dossier déjà validé'}
          </h1>
          {refuse && state.refusalReason !== null ? (
            <div role="alert" aria-live="assertive" className="error-box">
              <p className="error-message">Ta preuve a été refusée.</p>
              <p className="error-action">Motif : {state.refusalReason}</p>
            </div>
          ) : null}
          <p className="lead">
            {aReprendre
              ? 'Ton dossier doit d’abord être repris : modifie ton inscription. S’il reste une place, elle t’est réservée avec un nouveau délai pour déposer une nouvelle preuve.'
              : enAttente
                ? 'Aucun versement n’est à faire tant qu’une place ne t’a pas été attribuée : l’organisation te préviendra par email.'
                : 'Ton dossier a été validé par l’organisation : la preuve de paiement ne peut plus être modifiée en ligne.'}
          </p>
          <div className="auth-alt">
            {aReprendre ? (
              <a className="btn-action" href="/inscription">
                Modifier mon inscription
              </a>
            ) : (
              <a className="btn-contour" href="/espace-coureur">
                Voir mon inscription
              </a>
            )}
            {aReprendre ? <AssistanceButton phone={assistancePhone} /> : null}
          </div>
        </article>
      </section>
    );
  }

  if (!state.documentsAcceptes) {
    // Acceptations AVANT la preuve (PO, 11/11/2026) : le dépôt serait refusé.
    // On renvoie vers les documents plutôt que d'ouvrir un formulaire inutile.
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Preuve de paiement</p>
          <FilEtapes etapes={etapesPreuve(state.coureurStatus, state.documentsAcceptes)} />
          <h1>Accepte d’abord la décharge et le règlement</h1>
          <p className="lead">
            Ta preuve de paiement se dépose une fois la décharge de bonne santé et le règlement
            intérieur acceptés.
          </p>
          <div className="auth-alt">
            <a className="btn-action" href="/acceptations">
              Accepter la décharge et le règlement
            </a>
          </div>
        </article>
      </section>
    );
  }

  const comptes = await lectureBornee(getComptesPaiement(session), null, 'comptes CCP');
  return (
    <>
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
