import { formatLocalDateTime } from '@azzel/shared';

import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireRolePage } from '@/modules/iam/session';

import { AssistanceButton } from '@/components/assistance-button';
import { FilEtapes, etapesAcceptations } from '@/components/fil-etapes';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';

import {
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_EXPIREE,
  COUREUR_STATUS_LISTE_ATTENTE,
  COUREUR_STATUS_REFUSE,
  DOCUMENT_SLUGS,
  peutAccepterDocuments,
} from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import { getAcceptancesState, type AcceptancesState } from '@/modules/inscriptions/service';

import { AcceptancesForm } from './acceptances-form';
import '../dossier.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Décharge et règlement',
};

export default async function AcceptancesPage() {
  const assistancePhone = readAssistancePhone();
  // Garde de RÔLE, pas seulement de session : un organisateur ou un
  // volontaire est renvoyé vers son espace au lieu de rester ici.
  const result = await requireRolePage('coureur');
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
          <div className="auth-alt">
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }
  const session = result.session;

  let state: AcceptancesState;
  try {
    state = await lectureBorneeOuIndisponible(getAcceptancesState(session), 'acceptations');
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

  if (state.coureurStatus === null || !peutAccepterDocuments(state.coureurStatus)) {
    const fige = pageFigee(state.coureurStatus);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Documents</p>
          <h1>{fige.titre}</h1>
          <p className="lead">{fige.texte}</p>
          <div className="auth-alt">
            <a className="btn-contour" href={fige.href}>
              {fige.lien}
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

  return (
    <AcceptancesForm state={state} assistancePhone={assistancePhone}>
      <FilEtapes etapes={etapesAcceptations(state.coureurStatus)} />
    </AcceptancesForm>
  );
}

/**
 * Page affichée quand les acceptations ne sont pas ouvertes : le titre dit
 * POURQUOI, statut par statut. « Dossier déjà validé » est réservé au validé.
 */
function pageFigee(statut: string | null): {
  titre: string;
  texte: string;
  href: string;
  lien: string;
} {
  if (statut === null) {
    return {
      titre: 'Inscris-toi d’abord',
      texte: 'La décharge et le règlement s’acceptent après ton inscription à l’édition.',
      href: '/inscription',
      lien: 'M’inscrire',
    };
  }
  if (statut === COUREUR_STATUS_EN_VALIDATION) {
    return {
      titre: 'Dossier en cours de validation',
      texte:
        'Ta preuve est déposée : l’organisation examine ton dossier. Les acceptations ne peuvent plus être modifiées en attendant sa décision.',
      href: '/espace-coureur',
      lien: 'Voir mon inscription',
    };
  }
  if (statut === COUREUR_STATUS_REFUSE || statut === COUREUR_STATUS_EXPIREE) {
    return {
      titre: statut === COUREUR_STATUS_REFUSE ? 'Dossier refusé' : 'Inscription expirée',
      texte:
        'Ton dossier doit d’abord être repris : modifie ton inscription, puis accepte les documents.',
      href: '/inscription',
      lien: 'Modifier mon inscription',
    };
  }
  if (statut === COUREUR_STATUS_LISTE_ATTENTE) {
    return {
      titre: 'Inscription en liste d’attente',
      texte:
        'Les documents s’acceptent une fois une place attribuée : l’organisation te préviendra par email.',
      href: '/espace-coureur',
      lien: 'Voir mon inscription',
    };
  }
  return {
    titre: 'Dossier déjà validé',
    texte:
      'Ton dossier a été validé par l’organisation : les acceptations ne peuvent plus être modifiées en ligne.',
    href: '/espace-coureur',
    lien: 'Voir mon inscription',
  };
}
