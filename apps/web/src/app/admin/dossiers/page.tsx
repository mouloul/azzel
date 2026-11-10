import Link from 'next/link';

import { formatLocalDateTime } from '@azzel/shared';

import { lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';
import { requireRolePage } from '@/modules/iam/session';

import {
  LIST_COUREURS_LIMIT,
  statutAffiche,
} from '@/modules/inscriptions/domain';
import { toAdminApiError } from '@/modules/inscriptions/errors';
import { getDossiersState } from '@/modules/inscriptions/service';

import { AdminIndisponible } from '../indisponible';
import { AttributionDossards } from './attribution-dossards';
import './dossiers.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dossiers',
};

export default async function AdminDossiersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const guard = await requireRolePage('organisateur');
  if (guard.status === 'db-unavailable') {
    return (
      <AdminIndisponible
        titre="Connexion indisponible"
        message="Connexion indisponible."
        action="Réessaie dans un instant."
      />
    );
  }
  const session = guard.session;
  const { q } = await searchParams;
  const search = typeof q === 'string' ? q : '';

  let state: Awaited<ReturnType<typeof getDossiersState>>;
  try {
    state = await lectureBorneeOuIndisponible(getDossiersState(session, search), 'admin dossiers');
  } catch (error) {
    const { envelope } = toAdminApiError(error);
    return (
      <AdminIndisponible
        titre="Dossiers indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  // Story 10.3 — compteurs de tête de page, calculés UNIQUEMENT sur la liste
  // déjà chargée (aucune requête supplémentaire). La page ne porte qu'un
  // filtre de recherche texte : aucun filtre de statut n'existe, les
  // compteurs ne sont donc PAS des liens (un compteur non cliquable vaut
  // mieux qu'un lien mort). Les libellés comptent ce qui est affiché.
  const valides = state.dossiers.filter((d) => d.status === 'validé').length;
  const enAttenteJustificatif = state.dossiers.filter(
    (d) => d.status === 'en constitution' && !d.hasActivePreuve,
  ).length;
  const enAttenteValidation = state.dossiers.filter(
    (d) => d.status === 'en constitution' && d.hasActivePreuve,
  ).length;
  // M1 (revue épopée 10) — un dossier REFUSÉ n'est jamais complétable : il
  // sort du compteur d'acceptations manquantes (le comité n'agit que sur
  // les dossiers encore ouverts).
  const acceptationsManquantes = state.dossiers.filter(
    (d) => !d.acceptationsCompletes && d.status !== 'refusé',
  ).length;
  const dossardsAttribues = state.dossiers.filter((d) => d.dossard !== null).length;

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Dossiers{state.edition ? ` — ${state.edition.nom}` : ''}</h1>
        <p className="lead">
          Examine les dossiers de l’édition, télécharge les preuves, valide ou refuse avec un
          motif.
        </p>
        <dl className="dossiers-compteurs">
          <div className="dossiers-compteur">
            <dt className="dossiers-compteur-libelle">Validés</dt>
            <dd className="dossiers-compteur-nombre">{valides}</dd>
          </div>
          <div className="dossiers-compteur">
            <dt className="dossiers-compteur-libelle">En attente de justificatif</dt>
            <dd className="dossiers-compteur-nombre">{enAttenteJustificatif}</dd>
          </div>
          <div className="dossiers-compteur">
            <dt className="dossiers-compteur-libelle">En attente de validation</dt>
            <dd className="dossiers-compteur-nombre">{enAttenteValidation}</dd>
          </div>
          <div className="dossiers-compteur">
            <dt className="dossiers-compteur-libelle">Acceptations manquantes</dt>
            <dd className="dossiers-compteur-nombre">{acceptationsManquantes}</dd>
          </div>
          <div className="dossiers-compteur">
            <dt className="dossiers-compteur-libelle">Dossards attribués</dt>
            <dd className="dossiers-compteur-nombre">{dossardsAttribues}</dd>
          </div>
        </dl>
        {search.length > 0 || state.hasMore ? (
          <p className="hint">
            Comptages sur la liste affichée
            {search.length > 0 ? ' (recherche active)' : ''}
            {state.hasMore ? ` — tronquée à ${LIST_COUREURS_LIMIT} dossiers` : ''}.
          </p>
        ) : null}
        <form className="search-form" action="/admin/dossiers" method="get" role="search">
          <label className="field" htmlFor="dossiers-q">
            <span className="search-label">Rechercher un coureur (nom ou email)</span>
            <input
              id="dossiers-q"
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Nom, prénom ou email"
            />
          </label>
          <button type="submit" className="btn-contour">
            Rechercher
          </button>
        </form>

        <AttributionDossards />

        {state.dossiers.length === 0 ? (
          <p className="hint">
            {search.length > 0
              ? 'Aucun dossier ne correspond à cette recherche.'
              : 'Aucun coureur inscrit pour le moment.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="socle-table table-dossiers">
              <thead>
                <tr>
                  <th scope="col">Coureur</th>
                  <th scope="col">Épreuve</th>
                  <th scope="col" className="socle-num">
                    Dossard
                  </th>
                  <th scope="col">Statut</th>
                  <th scope="col">Preuve</th>
                  <th scope="col">Acceptations</th>
                  <th scope="col" className="socle-num">
                    Inscrit le
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.dossiers.map((dossier) => (
                  <tr key={dossier.coureurId}>
                    <td>
                      <span className="dossier-nom">
                        {dossier.prenom} {dossier.nom}
                      </span>
                      <span className="meta dossier-email">{dossier.email}</span>
                    </td>
                    <td>{dossier.epreuveNom}</td>
                    <td className="socle-num">
                      {dossier.dossard !== null ? (
                        <span className="dossard-numero">{dossier.dossard}</span>
                      ) : (
                        <span className="meta">—</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const statut = statutAffiche(dossier.status, dossier.hasActivePreuve);
                        return (
                          <span className={`socle-pastille ${statut.pastille}`}>
                            <span className="socle-pastille-point" aria-hidden="true" />
                            {statut.libelle}
                          </span>
                        );
                      })()}
                      {dossier.status === 'refusé' && dossier.refusalReason !== null ? (
                        <span className="meta dossier-motif">{dossier.refusalReason}</span>
                      ) : null}
                    </td>
                    <td>
                      {dossier.hasActivePreuve && dossier.preuveDepositedAt !== null ? (
                        <>Déposée le {formatLocalDateTime(dossier.preuveDepositedAt)}</>
                      ) : (
                        <span className="meta">Absente</span>
                      )}
                    </td>
                    <td>
                      {dossier.acceptationsCompletes ? (
                        'Complètes'
                      ) : (
                        <span className="meta">À compléter</span>
                      )}
                    </td>
                    <td className="socle-num">{formatLocalDateTime(dossier.createdAt)}</td>
                    <td>
                      <Link className="btn-lien" href={`/admin/dossiers/${dossier.coureurId}`}>
                        Examiner
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="meta">
          {state.dossiers.length} dossier(s) affiché(s) — {LIST_COUREURS_LIMIT} maximum.
          {state.hasMore ? ' Liste tronquée — affinez la recherche.' : ''}
        </p>
        <p className="hint">
          Le jour J :{' '}
          <a className="btn-lien" href="/admin/course">
            pilote la course en direct depuis le PC course
          </a>
          .
        </p>
        {/* Story 7.4 — processus J-10 : la commande part des dossiers validés
            que cette page sert — passerelle vers /admin/rapports. */}
        <p className="hint">
          À J-10 :{' '}
          <a className="btn-lien" href="/admin/rapports">
            prépare la commande t-shirts et médailles depuis les rapports
          </a>
          .
        </p>
      </article>
    </section>
  );
}
