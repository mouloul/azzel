import Link from 'next/link';

import { formatLocalDateTime } from '@azzel/shared';

import { requireRolePage } from '@/modules/iam/session';

import {
  COUREUR_STATUS_LABELS,
  coureurStatusChipClass,
  type CoureurStatus,
} from '@/modules/inscriptions/domain';
import { toAdminApiError } from '@/modules/inscriptions/errors';
import { getDossiersState } from '@/modules/inscriptions/service';

import { AdminIndisponible } from '../indisponible';
import { AttributionDossards } from './attribution-dossards';

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
    state = await getDossiersState(session, search);
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

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Dossiers{state.edition ? ` — ${state.edition.nom}` : ''}</h1>
        <p className="lead">
          Examine les dossiers de l’édition, télécharge les preuves, valide ou refuse avec un
          motif.
        </p>
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
            <table className="table-dossiers">
              <thead>
                <tr>
                  <th scope="col">Coureur</th>
                  <th scope="col">Épreuve</th>
                  <th scope="col">Dossard</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Preuve</th>
                  <th scope="col">Acceptations</th>
                  <th scope="col">Inscrit le</th>
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
                    <td>
                      {dossier.dossard !== null ? (
                        <span className="dossard-numero">{dossier.dossard}</span>
                      ) : (
                        <span className="meta">—</span>
                      )}
                    </td>
                    <td>
                      <span className={coureurStatusChipClass(dossier.status)}>
                        {COUREUR_STATUS_LABELS[dossier.status as CoureurStatus] ?? dossier.status}
                      </span>
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
                    <td>{formatLocalDateTime(dossier.createdAt)}</td>
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
          {state.dossiers.length} dossier(s) affiché(s) — 200 maximum.
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
