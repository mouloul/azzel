import type { MissionVolontaireView } from '@/modules/missions/service';

// Story 4.2 (revue) — la « mission scan en cours » du badge était arbitraire
// quand le volontaire a PLUSIEURS missions scan_checkpoint : helper pur partagé
// par la page scanner (libellé du badge) et la fiche PWA (entrée « Démarrer le
// scan »). La mission dont la fenêtre horaire contient l'instant gagne ;
// sinon repli sur la première mission scan ; sinon null (pas d'entrée).

/**
 * Mission scan_checkpoint à afficher : la première dont la fenêtre
 * [debutLe, finLe] contient `maintenant`, sinon la première mission scan
 * (repli hors fenêtre), sinon null si aucune mission scan.
 */
export function missionScanEnCours(
  mesMissions: readonly MissionVolontaireView[],
  maintenant: Date,
): MissionVolontaireView | null {
  const missionsScan = mesMissions.filter((mission) => mission.type === 'scan_checkpoint');
  if (missionsScan.length === 0) {
    return null;
  }
  const temps = maintenant.getTime();
  const courante = missionsScan.find(
    (mission) =>
      new Date(mission.debutLe).getTime() <= temps &&
      temps <= new Date(mission.finLe).getTime(),
  );
  return courante ?? missionsScan[0] ?? null;
}
