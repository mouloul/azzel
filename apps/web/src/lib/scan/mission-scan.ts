import type { MissionType } from '@/modules/missions/domain';
import type { MissionVolontaireView } from '@/modules/missions/service';

// Story 4.2 (revue) — la « mission scan en cours » du badge était arbitraire
// quand le volontaire a PLUSIEURS missions scan_checkpoint : helper pur partagé
// par la page scanner (libellé du badge) et la fiche PWA (entrée « Démarrer le
// scan »). La mission dont la fenêtre horaire contient l'instant gagne ;
// sinon repli sur la première mission du type ; sinon null (pas d'entrée).
//
// Story 4.3 — le helper est généralisé aux types de mission : le mode retrait
// du scanner est débloqué par une mission distribution_dossards « en cours »
// (même fenêtre horaire, mêmes écrans, même moteur).

/**
 * Mission du type demandé à afficher : la première dont la fenêtre
 * [debutLe, finLe] contient `maintenant`, sinon la première mission du type
 * (repli hors fenêtre), sinon null si aucune mission de ce type.
 */
export function missionTypeEnCours(
  mesMissions: readonly MissionVolontaireView[],
  type: MissionType,
  maintenant: Date,
): MissionVolontaireView | null {
  const missionsDuType = mesMissions.filter((mission) => mission.type === type);
  if (missionsDuType.length === 0) {
    return null;
  }
  const temps = maintenant.getTime();
  const courante = missionsDuType.find(
    (mission) =>
      new Date(mission.debutLe).getTime() <= temps &&
      temps <= new Date(mission.finLe).getTime(),
  );
  return courante ?? missionsDuType[0] ?? null;
}

/** Mission scan_checkpoint en cours (scanner 4.2 — mode passages). */
export function missionScanEnCours(
  mesMissions: readonly MissionVolontaireView[],
  maintenant: Date,
): MissionVolontaireView | null {
  return missionTypeEnCours(mesMissions, 'scan_checkpoint', maintenant);
}

/** Mission distribution_dossards en cours (scanner 4.3 — mode retrait). */
export function missionRetraitEnCours(
  mesMissions: readonly MissionVolontaireView[],
  maintenant: Date,
): MissionVolontaireView | null {
  return missionTypeEnCours(mesMissions, 'distribution_dossards', maintenant);
}
