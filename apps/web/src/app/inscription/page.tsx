import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import { AssistanceButton } from '@/components/assistance-button';
import { FilEtapes, etapesInscription } from '@/components/fil-etapes';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { lectureBornee, lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';

import {
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_EXPIREE,
  COUREUR_STATUS_LISTE_ATTENTE,
  COUREUR_STATUS_REFUSE,
  FUSEAU_COURSE,
  estModifiable,
  formatDateFrUtc,
} from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import {
  getHebergementState,
  getInscriptionState,
  getPlacesState,
  HEBERGEMENT_INDISPONIBLE,
  PLACES_MUETTES,
  type InscriptionState,
} from '@/modules/inscriptions/service';
import { CompteurPlaces } from '@/components/compteur-places';

import { InscriptionForm } from './inscription-form';
import '../dossier.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Inscription à l’édition',
};

export default async function InscriptionPage() {
  const assistancePhone = readAssistancePhone();
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
          <div className="auth-alt">
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }
  const session = result.session;

  let state: InscriptionState;
  try {
    state = await lectureBorneeOuIndisponible(getInscriptionState(session), 'inscription');
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
            <AssistanceButton phone={assistancePhone} />
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

  if (state.coureur && !estModifiable(state.coureur.status)) {
    // Deux dossiers figés, deux raisons : « déjà validé » adressé à un coureur
    // qui attend la décision lui ferait croire que c'est fait.
    const enValidation = state.coureur.status === COUREUR_STATUS_EN_VALIDATION;
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Inscription</p>
          <h1>{enValidation ? 'Dossier en cours de validation' : 'Dossier déjà validé'}</h1>
          <p className="lead">
            {enValidation
              ? 'Ta preuve de paiement est déposée : l’organisation examine ton dossier. Il ne peut plus être modifié en attendant sa décision — tu peux seulement remplacer ta preuve.'
              : 'Ton dossier a été validé par l’organisation : il ne peut plus être modifié en ligne.'}
          </p>
          {enValidation ? (
            <div className="auth-alt">
              <a className="btn-action" href="/preuve">
                Remplacer ma preuve de paiement
              </a>
            </div>
          ) : null}
          <div className="auth-alt">
            <a className="btn-contour" href="/espace-coureur">
              Voir mon inscription
            </a>
          </div>
        </article>
      </section>
    );
  }

  const [places, hebergement] = await Promise.all([
    lectureBornee(getPlacesState(result.session.organisationId), PLACES_MUETTES, 'places'),
    lectureBornee(
      getHebergementState(result.session.organisationId),
      HEBERGEMENT_INDISPONIBLE,
      'hébergement',
    ),
  ]);
  const enAttente = state.coureur?.status === COUREUR_STATUS_LISTE_ATTENTE;
  const refuse = state.coureur?.status === COUREUR_STATUS_REFUSE;
  const expiree = state.coureur?.status === COUREUR_STATUS_EXPIREE;
  // Échéance rendue à l'heure de la course : l'instant est stocké en UTC,
  // mais le coureur vit à Alger — lui afficher 22h59 le ferait rater d'une heure.
  // Seul un dossier en constitution a une échéance VIVANTE : celle d'un
  // dossier refusé ou expiré est passée, la lui annoncer serait faux.
  const echeance =
    state.coureur?.status === COUREUR_STATUS_EN_CONSTITUTION && state.coureur.preuveDueAt != null
      ? new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: FUSEAU_COURSE,
        }).format(new Date(state.coureur.preuveDueAt))
      : null;

  return (
    <InscriptionForm state={state} assistancePhone={assistancePhone} hebergement={hebergement}>
      <FilEtapes etapes={etapesInscription(state.coureur)} />
      <CompteurPlaces places={places} />
      {refuse ? (
        <div role="alert" aria-live="assertive" className="error-box">
          <p className="error-message">Ton dossier a été refusé.</p>
          {state.coureur?.refusalReason != null ? (
            <p className="error-action">Motif : {state.coureur.refusalReason}</p>
          ) : null}
          <p className="error-action">
            Corrige ton inscription puis enregistre-la : elle repart du début. S’il reste une
            place, elle t’est réservée avec un nouveau délai pour déposer une{' '}
            <strong>nouvelle</strong> preuve de paiement (la preuve refusée ne compte plus) ;
            sinon, tu passes en liste d’attente.
          </p>
        </div>
      ) : null}
      {expiree ? (
        <p className="encart-attente" role="status">
          Ton inscription a <strong>expiré</strong> faute de preuve de paiement dans le délai,
          et ta place a été rendue. Enregistre de nouveau ton inscription pour la reprendre :
          s’il reste une place, elle t’est réservée avec un nouveau délai ; sinon, tu passes
          en liste d’attente.
        </p>
      ) : null}
      {echeance !== null ? (
        <p className="encart-echeance" role="status">
          Ta place est réservée. Dépose ta preuve de paiement avant le
          <strong> {echeance}</strong> : passé ce délai, l’inscription expire et
          la place repart aux autres coureurs.
        </p>
      ) : null}
      {enAttente ? (
        <p className="encart-attente" role="status">
          Les dossards sont tous pris : ton inscription est enregistrée en
          <strong> liste d’attente</strong>. Tu peux encore la corriger. Aucun
          versement n’est à faire tant qu’une place ne t’a pas été attribuée —
          l’organisation te préviendra par email.
        </p>
      ) : null}
    </InscriptionForm>
  );
}
