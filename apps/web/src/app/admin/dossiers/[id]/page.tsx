import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatLocalDateTime } from '@azzel/shared';

import { requireRolePage } from '@/modules/iam/session';

import {
  AGE_CATEGORY_LABELS,
  COUREUR_STATUS_LABELS,
  coureurStatusChipClass,
  type AgeCategory,
  type CoureurStatus,
} from '@/modules/inscriptions/domain';
import { toAdminApiError } from '@/modules/inscriptions/errors';
import { formatKiloBytes } from '@/modules/inscriptions/proof-format';
import { getDossierDetail } from '@/modules/inscriptions/service';

import { AdminIndisponible } from '../../indisponible';
import { DecisionForm } from './decision-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dossier coureur',
};

export default async function AdminDossierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getDossierDetail>>;
  try {
    detail = await getDossierDetail(session, id);
  } catch (error) {
    const { envelope } = toAdminApiError(error);
    return (
      <AdminIndisponible titre="Dossier indisponible" message={envelope.error.message} action={envelope.error.action}>
        <div className="auth-alt">
          <Link className="btn-contour" href="/admin/dossiers">
            Retour aux dossiers
          </Link>
        </div>
      </AdminIndisponible>
    );
  }
  if (!detail) {
    notFound();
  }

  const coureur = detail.coureur;

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration — Dossier</p>
        <h1>
          {coureur.prenom} {coureur.nom}
        </h1>
        <p className="meta">{detail.email}</p>
        <p>
          Statut :{' '}
          <span className={coureurStatusChipClass(coureur.status)}>
            {COUREUR_STATUS_LABELS[coureur.status as CoureurStatus] ?? coureur.status}
          </span>
        </p>

        <div className="recap">
          <p className="recap-titre">Pièces du dossier</p>
          <p>
            Épreuve : {coureur.epreuveNom} ({coureur.distanceKm} km) —{' '}
            {AGE_CATEGORY_LABELS[coureur.categorie as AgeCategory]}
          </p>
          <p>
            Né(e) le {coureur.dateNaissance} · T-shirt {coureur.tailleTshirt} · Téléphone{' '}
            {coureur.telephone}
          </p>
          <p>
            Contact d’urgence : {coureur.contactUrgenceNom} · {coureur.contactUrgenceTelephone}
          </p>
          <p>
            Acceptations :{' '}
            {coureur.dechargeAccepte !== null && coureur.reglementAccepte !== null
              ? `décharge ${coureur.dechargeAccepte.version} et règlement ${coureur.reglementAccepte.version} acceptés le ${formatLocalDateTime(coureur.dechargeAccepte.acceptedAt)}`
              : 'à compléter'}
          </p>
          <p>Inscription créée le {formatLocalDateTime(coureur.createdAt)}</p>
          <p>Dernière mise à jour le {formatLocalDateTime(coureur.updatedAt)}</p>
        </div>

        <div>
          <p className="recap-titre">Preuve de paiement</p>
          {detail.preuveActive !== null ? (
            <>
              <p>
                Déposée le {formatLocalDateTime(detail.preuveActive.depositedAt)} ·{' '}
                {formatKiloBytes(detail.preuveActive.sizeBytes)} · {detail.preuveActive.mime}
              </p>
              <div className="auth-alt">
                <a
                  className="btn-contour"
                  href={`/api/admin/preuves/${detail.preuveActive.id}`}
                  download
                >
                  Télécharger la preuve
                </a>
              </div>
            </>
          ) : (
            <p className="hint">Aucune preuve active déposée pour le moment.</p>
          )}
        </div>

        {detail.decidePar !== null ? (
          <p className="meta">
            Décidé par {detail.decidePar.email} le{' '}
            {formatLocalDateTime(detail.decidePar.decidedAt)}
          </p>
        ) : null}

        {coureur.status === 'refusé' && coureur.refusalReason !== null ? (
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Dossier refusé</p>
            <p className="error-action">Motif enregistré : {coureur.refusalReason}</p>
          </div>
        ) : null}

        <DecisionForm coureurId={coureur.id} status={coureur.status} />

        <div className="auth-alt">
          <Link className="btn-lien" href="/admin/dossiers">
            ← Retour aux dossiers
          </Link>
        </div>
      </article>
    </section>
  );
}
