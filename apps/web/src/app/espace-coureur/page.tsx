import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';

import { formatDateFrUtc } from '@/modules/inscriptions/domain';
import { toApiError as toInscriptionsApiError } from '@/modules/inscriptions/errors';
import {
  getChecklistState,
  type ChecklistPiece,
  type ChecklistRecap,
  type EditionSummary,
} from '@/modules/inscriptions/service';

import {
  BANDEAU_DOSSIER_VALIDE,
  compteurPieces,
  estComplet,
  etatPiece,
} from './checklist-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace coureur',
};

export default async function EspaceCoureurPage() {
  const assistancePhone = readAssistancePhone();
  // Garde de RÔLE, pas seulement de session : un organisateur ou un
  // volontaire est renvoyé vers son espace au lieu de rester ici.
  const result = await requireRolePage('coureur');
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

  let state: Awaited<ReturnType<typeof getChecklistState>> | null = null;
  let failure: ReturnType<typeof toInscriptionsApiError> | null = null;
  try {
    state = await getChecklistState(session);
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
          <p className="surtitre">Dossier</p>
          <h2>Checklist indisponible</h2>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{failure.envelope.error.message}</p>
            <p className="error-action">{failure.envelope.error.action}</p>
          </div>
          <div className="auth-alt">
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      )}

      {state !== null && state.edition === null && (
        <article className="card">
          <p className="surtitre">Dossier</p>
          <h2>Aucune édition disponible</h2>
          <p className="hint">
            Aucune édition n’est configurée pour le moment. Réessaie plus tard.
          </p>
          <div className="auth-alt">
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      )}

      {state !== null && state.edition !== null && (
        <ChecklistCard
          edition={state.edition}
          pieces={state.pieces}
          recap={state.recap}
          assistancePhone={assistancePhone}
        />
      )}
    </section>
  );
}

function ChecklistCard({
  edition,
  pieces,
  recap,
  assistancePhone,
}: {
  edition: EditionSummary;
  pieces: ChecklistPiece[];
  recap: ChecklistRecap | null;
  assistancePhone: string;
}) {
  const complet = estComplet(pieces);

  return (
    <article className="card">
      <p className="surtitre">Dossier</p>
      <h2>Ton dossier — {edition.nom}</h2>
      <p className="checklist-compteur" aria-live="polite">
        {compteurPieces(pieces)}
      </p>
      {complet && (
        <div role="status" className="checklist-bandeau">
          <p className="checklist-bandeau-texte">{BANDEAU_DOSSIER_VALIDE}</p>
        </div>
      )}
      {complet && (
        <a className="checklist-action" href="/espace-coureur/e-dossard">
          Ton e-dossard — QR à présenter au guichet
        </a>
      )}
      <ol role="list" className="checklist">
        {pieces.map((piece) => {
          const etat = etatPiece(piece);
          return (
            <li
              key={piece.id}
              className={
                piece.fait ? 'checklist-item checklist-item--fait' : 'checklist-item'
              }
            >
              <p className="checklist-entete">
                <span className="checklist-puce" aria-hidden="true" />
                <span className="checklist-libelle">{piece.libelle}</span>
                <span className={etat.classe}>{etat.texte}</span>
              </p>
              {piece.motifRefus != null && (
                <div role="alert" aria-live="assertive" className="error-box">
                  <p className="error-message">Ton dossier a été refusé.</p>
                  <p className="error-action">Motif : {piece.motifRefus}</p>
                </div>
              )}
              {piece.actionLabel != null && piece.actionHref != null && (
                <a className="checklist-action" href={piece.actionHref}>
                  {piece.actionLabel}
                </a>
              )}
              {piece.actionLabel != null && piece.actionHref == null && (
                <span className="checklist-action-inactive">{piece.actionLabel}</span>
              )}
            </li>
          );
        })}
      </ol>
      {recap !== null && (
        <div className="recap">
          <p className="recap-titre">Récapitulatif</p>
          <p>
            Épreuve : <strong>{recap.epreuve} ({recap.distanceKm} km)</strong>
          </p>
          <p>Catégorie : {recap.categorieAge}</p>
          <p>T-shirt : {recap.tshirt}</p>
          <p>
            Contact d’urgence : {recap.contactUrgenceNom} · {recap.contactUrgenceTelephone}
          </p>
          <p>Course le {formatDateFrUtc(recap.dateCourse)}</p>
        </div>
      )}
      <p className="meta">
        Clôture des inscriptions : {formatLocalDateTime(edition.registrationClosesAt)}
      </p>
      {!edition.registrationOpen && (
        <p className="hint">
          Les inscriptions sont fermées : la checklist reste consultable, chaque page
          gère son propre état.
        </p>
      )}
      <div className="auth-alt">
        <AssistanceButton phone={assistancePhone} />
      </div>
    </article>
  );
}
