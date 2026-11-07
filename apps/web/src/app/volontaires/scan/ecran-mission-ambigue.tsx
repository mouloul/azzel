import { formatLocalHeure } from '@azzel/shared';
import Link from 'next/link';

import { assistancePhoneHref } from '@/components/assistance-button';
import type { RaisonBlocageMission } from '@/lib/scan/mission-scan';
import type { MissionVolontaireView } from '@/modules/missions/service';

/**
 * Story 4.6 — écran de blocage : la résolution refuse de choisir un checkpoint
 * plutôt que d'en deviner un. Le libellé nomme les missions EN CAUSE avec leurs
 * horaires, pour que l'organisateur sache quoi corriger et que le volontaire
 * sache quand revenir. Assistance et retour fiche toujours offerts : une
 * impasse sans porte de sortie n'en est pas une.
 */
export function EcranMissionAmbigue({
  raison,
  missions,
  assistancePhone,
}: {
  raison: RaisonBlocageMission;
  missions: readonly MissionVolontaireView[];
  assistancePhone: string;
}) {
  const chevauchement = raison === 'chevauchement';
  return (
    <section className="auth scan-page-etat">
      <article className="socle-carte scan-cadre">
        <p className="surtitre">Scan des e-dossards</p>
        <h1>
          {chevauchement
            ? 'Deux missions se chevauchent sur ce créneau'
            : 'Aucune mission de scan en cours'}
        </h1>
        <p className="lead" role="status">
          {chevauchement
            ? 'Impossible de savoir à quel point de contrôle rattacher les passages : le PC doit corriger tes affectations avant que tu scannes.'
            : 'Aucune de tes missions de scan ne couvre cette heure. Scanner maintenant rattacherait les passages au mauvais point de contrôle.'}
        </p>
        <ul className="scan-missions-cause">
          {missions.map((mission) => (
            <li key={mission.id}>
              <strong>{mission.titre}</strong> — {mission.secteurNom}, de{' '}
              {formatLocalHeure(mission.debutLe)} à {formatLocalHeure(mission.finLe)}
            </li>
          ))}
        </ul>
        <div className="scan-etat-actions">
          <a className="socle-action" href={assistancePhoneHref(assistancePhone)}>
            Appeler le PC
          </a>
          <Link className="btn-lien" href="/volontaires">
            Revenir à ma fiche
          </Link>
        </div>
      </article>
    </section>
  );
}
