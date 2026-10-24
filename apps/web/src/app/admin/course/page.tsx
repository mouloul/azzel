import { requireRolePage } from '@/modules/iam/session';
import { toCourseApiError } from '@/modules/chrono/errors';
import { getEtatCourse, getHeuresDepart } from '@/modules/chrono/service';

import { AdminIndisponible } from '../indisponible';
import { CourseLive } from './course-live';
import { HeuresDepart } from './heures-depart';
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
  let heures: Awaited<ReturnType<typeof getHeuresDepart>>;
  try {
    [etat, heures] = await Promise.all([
      getEtatCourse(session),
      getHeuresDepart(session),
    ]);
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
        {/* Story 7.1 — heures de départ officielles par épreuve : la carte
            vit derrière la garde organisateur de la page (un volontaire ne
            voit jamais /admin/course, la carte non plus). */}
        <HeuresDepart epreuvesInitiales={heures.epreuves} />
        {/* Story 7.4 — passerelle vers les rapports : le bilan post-course et
            la commande J-10 se téléchargent depuis /admin/rapports. */}
        <p className="hint">
          Après la course :{' '}
          <a className="btn-lien" href="/admin/rapports">
            télécharge le rapport post-course et la commande t-shirts/médailles
          </a>
          .
        </p>
      </article>
    </section>
  );
}
