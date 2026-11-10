import { lectureBorneeOuIndisponible } from '@/lib/lecture-bornee';
import { formatDateFrUtc } from '@/modules/inscriptions/domain';
import { requireRolePage } from '@/modules/iam/session';
import { toRapportsApiError } from '@/modules/rapports/errors';
import { getEtatRapports } from '@/modules/rapports/service';

import { AdminIndisponible } from '../indisponible';

// Story 7.4 — page /admin/rapports (organisateur) : deux cartes descriptives
// avec boutons de téléchargement (liens GET simples vers les routes CSV,
// ouverts dans un ONGLET NEUF : un échec 503 n'écrase pas la page rapports)
// et la note de processus J-10 DÉRIVÉE de la date de course de l'édition
// courante (− 10 jours, formatée fr). Aucune collecte à l'affichage : les
// fichiers s'assemblent au téléchargement, sur l'édition courante de
// l'organisation de session.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Rapports',
};

/** J-10 = date de course − 10 jours, formatée fr (UTC stable : date civile). */
const JOURS_AVANT_COMMANDE = 10;
const JOUR_MS = 86_400_000;

export default async function AdminRapportsPage() {
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

  let etat: Awaited<ReturnType<typeof getEtatRapports>>;
  try {
    etat = await lectureBorneeOuIndisponible(getEtatRapports(session), 'admin rapports');
  } catch (error) {
    const { envelope } = toRapportsApiError(error);
    return (
      <AdminIndisponible
        titre="Rapports indisponibles"
        message={envelope.error.message}
        action={envelope.error.action}
      />
    );
  }

  const dateCommande =
    etat.edition !== null
      ? formatDateFrUtc(
          new Date(Date.parse(etat.edition.raceDate) - JOURS_AVANT_COMMANDE * JOUR_MS).toISOString(),
        )
      : null;
  const libelleJ10 = `Processus J-10${
    dateCommande !== null ? ` (${dateCommande})` : ' (dix jours avant la course)'
  }`;

  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>Rapports{etat.edition ? ` — ${etat.edition.nom}` : ''}</h1>
        <p className="lead">
          Le bilan chiffré de ton édition, prêt à partager au directoire : un
          fichier unique par export, des détails limités aux dossards (aucun
          nom ni contact de coureur ne quitte la plateforme).
        </p>

        <section aria-labelledby="rapport-post-course-titre">
          <h2 id="rapport-post-course-titre">Rapport post-course</h2>
          <p>
            Un fichier CSV unique couvrant toute l’édition : inscrits par
            statut, présents au départ, passages par checkpoint, arrivées avec
            rang et temps officiels, abandons détaillés, portée des partages
            des résultats. Il s’ouvre proprement dans Excel (UTF-8, séparateur
            point-virgule).
          </p>
          <a
            className="btn-contour"
            href="/api/admin/rapports/post-course"
            target="_blank"
            rel="noopener"
          >
            Télécharger le rapport post-course (CSV)
          </a>
        </section>

        <section aria-labelledby="rapport-commande-titre">
          <h2 id="rapport-commande-titre">Commande t-shirts et médailles</h2>
          <p>
            Les décomptes des dossiers VALIDÉS, par épreuve et par taille de
            t-shirt, avec les médailles (une par coureur validé et par
            épreuve). Zéro stock : commandé = validé — les dossiers en
            constitution n’apparaissent nulle part.
          </p>
          <a
            className="btn-contour"
            href="/api/admin/rapports/commande"
            target="_blank"
            rel="noopener"
          >
            Télécharger la commande (CSV)
          </a>
        </section>

        <p className="hint">
          {libelleJ10} : télécharge la commande dix jours avant la course pour commander
          t-shirts et médailles — les décomptes reprennent les validés du moment,
          re-télécharge le jour de l’envoi pour les derniers validés.
        </p>
      </article>
    </section>
  );
}
