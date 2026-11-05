import { requireRolePage } from '@/modules/iam/session';
import { toAdminApiError } from '@/modules/inscriptions/errors';
import { getReglagesAdmin } from '@/modules/inscriptions/service';

import { AdminIndisponible } from '../indisponible';
import { InscriptionsManager } from './inscriptions-manager';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Inscriptions',
};

export default async function AdminInscriptionsPage() {
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

  let etat: Awaited<ReturnType<typeof getReglagesAdmin>>;
  try {
    etat = await getReglagesAdmin(guard.session);
  } catch (error) {
    const { envelope } = toAdminApiError(error);
    return (
      <AdminIndisponible
        titre="Inscriptions indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  if (etat.edition === null) {
    return (
      <AdminIndisponible
        titre="Aucune édition"
        message="Aucune édition n’est configurée pour cette organisation."
        action="Exécute les migrations, puis recharge cette page."
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Inscriptions — {etat.edition.nom}</h1>
        <p className="lead">
          Nombre de dossards, contingent d’hébergement, prix et délai de dépôt
          de la preuve. Chaque changement de réglage est horodaté et attribué.
        </p>
        <InscriptionsManager etat={etat} />
      </article>
    </section>
  );
}
