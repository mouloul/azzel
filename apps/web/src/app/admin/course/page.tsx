import { requireRolePage } from '@/modules/iam/session';
import { toCourseApiError } from '@/modules/chrono/errors';
import { getEtatCourse } from '@/modules/chrono/service';

import { AdminIndisponible } from '../indisponible';
import { CourseLive } from './course-live';
import './course.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'PC course',
};

export default async function AdminCoursePage() {
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

  let etat: Awaited<ReturnType<typeof getEtatCourse>>;
  try {
    etat = await getEtatCourse(session);
  } catch (error) {
    const { envelope } = toCourseApiError(error);
    return (
      <AdminIndisponible
        titre="Tableau de bord indisponible"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>PC course{etat.edition ? ` — ${etat.edition.nom}` : ''}</h1>
        <p className="lead">
          Pilotage live de la course : retraits, partants, coureurs en course,
          arrivées et abandons saisis au PC, passages arbitrés par checkpoint
          (premier reçu fait foi). Les chiffres se rafraîchissent toutes les
          5 secondes — leur fraîcheur reste affichée en toutes circonstances.
        </p>
        <CourseLive etatInitial={etat} />
      </article>
    </section>
  );
}
