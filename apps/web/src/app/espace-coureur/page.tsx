import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';
import { requireRolePage } from '@/modules/iam/session';

import { libelleEpreuve, statutAffiche } from '@/modules/inscriptions/domain';
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
import '../dossier.css';

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
    state = await lectureBorneeOuIndisponible(getChecklistState(session), 'checklist coureur');
  } catch (error) {
    failure = toInscriptionsApiError(error);
  }

  return (
    <section className="auth auth-wide dossier-section espace">
      <article className="card espace-compte">
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
        <div className="auth-alt espace-compte__action">
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
          statut={state.statut ?? null}
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
  statut,
  assistancePhone,
}: {
  edition: EditionSummary;
  pieces: ChecklistPiece[];
  recap: ChecklistRecap | null;
  statut: string | null;
  assistancePhone: string;
}) {
  const complet = estComplet(pieces);
  // La preuve se lit sur la pièce de la checklist : c'est elle qui sépare
  // « en attente de justificatif » de « en attente de validation ».
  const statutLu =
    statut === null
      ? null
      : statutAffiche(statut, pieces.some((piece) => piece.id === 'preuve' && piece.fait));

  return (
    <article className="card espace-dossier">
      <p className="surtitre">Dossier</p>
      <h2>Ton dossier — {edition.nom}</h2>
      {statutLu !== null && (
        <p className="espace-statut">
          Statut :{' '}
          <span className={`socle-pastille ${statutLu.pastille}`}>
            <span className="socle-pastille-point" aria-hidden="true" />
            {statutLu.libelle}
          </span>
        </p>
      )}
      <p className="checklist-compteur" aria-live="polite">
        {compteurPieces(pieces)}
      </p>
      {/* Jauge décorative : le compteur écrit ci-dessus porte déjà
          l'information, la barre ne fait que la rendre lisible d'un coup
          d'œil. */}
      <div className="checklist-jauge" aria-hidden="true">
        <span
          className="checklist-jauge__remplie"
          style={{
            width: `${pieces.length === 0 ? 0 : Math.round((pieces.filter((piece) => piece.fait).length / pieces.length) * 100)}%`,
          }}
        />
      </div>
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
      <div className="espace-dossier__corps">
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
        <aside className="recap espace-recap" aria-label="Récapitulatif de ton inscription">
          <p className="recap-titre">Récapitulatif</p>
          {statutLu !== null && (
            <p>
              Statut :{' '}
              <span className={`socle-pastille ${statutLu.pastille}`}>
                <span className="socle-pastille-point" aria-hidden="true" />
                {statutLu.libelle}
              </span>
            </p>
          )}
          <p>
            Épreuve : <strong>{libelleEpreuve(recap.epreuve, recap.distanceKm)}</strong>
          </p>
          <p>Catégorie : {recap.categorieAge}</p>
          <p>T-shirt : {recap.tshirt}</p>
          <p>
            Contact d’urgence : {recap.contactUrgenceNom} · {recap.contactUrgenceTelephone}
          </p>
          <p>Course : {recap.dateCourseLibelle}</p>
        </aside>
      )}
      </div>
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
