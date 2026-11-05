import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import { AssistanceButton } from '@/components/assistance-button';
import { FilEtapes, etapesInscription } from '@/components/fil-etapes';
import { readAssistancePhone } from '@/lib/assistance-phone';

import {
  COUREUR_STATUS_LISTE_ATTENTE,
  FUSEAU_COURSE,
  STATUTS_MODIFIABLES,
  formatDateFrUtc,
} from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import {
  getInscriptionState,
  getPlacesState,
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

  if (state.coureur && !STATUTS_MODIFIABLES.includes(state.coureur.status)) {
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

  const places = await getPlacesState(result.session.organisationId);
  const enAttente = state.coureur?.status === COUREUR_STATUS_LISTE_ATTENTE;
  // Échéance rendue à l'heure de la course : l'instant est stocké en UTC,
  // mais le coureur vit à Alger — lui afficher 22h59 le ferait rater d'une heure.
  const echeance =
    state.coureur?.preuveDueAt != null
      ? new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: FUSEAU_COURSE,
        }).format(new Date(state.coureur.preuveDueAt))
      : null;

  return (
    <InscriptionForm state={state} assistancePhone={assistancePhone}>
      <FilEtapes etapes={etapesInscription(state.coureur)} />
      <CompteurPlaces places={places} />
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
