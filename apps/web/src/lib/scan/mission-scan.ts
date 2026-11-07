import { FAMILLE_SCAN, type FamilleScan } from '@/modules/missions/domain';
import type { MissionVolontaireView } from '@/modules/missions/service';

// Story 4.2 (revue) — la « mission scan en cours » du badge était arbitraire
// quand le volontaire a PLUSIEURS missions scan_checkpoint : helper pur partagé
// par la page scanner (libellé du badge) et la fiche PWA (entrée « Démarrer le
// scan »).
//
// Story 4.3 — le helper est généralisé aux types de mission : le mode retrait
// du scanner est débloqué par une mission distribution_dossards « en cours ».
//
// Story 4.6 — le repli « première mission du type » était sûr tant qu'un
// volontaire n'en tenait qu'une. Avec deux checkpoints dans la journée (CP1
// 9h-12h, CP4 14h-18h), un scan à 13h repartait sur CP1 : erreur SILENCIEUSE,
// clé naturelle valide, serveur qui accepte, temps et classements faussés.
// Désormais la résolution refuse de deviner — elle bloque, et le PC corrige
// l'affectation. Le checkpoint est une décision d'organisation, pas un choix
// de liste.

/**
 * Débordement toléré de part et d'autre d'un créneau. Symétrique à dessein :
 * le dernier coureur passe après l'heure, et le volontaire arrive en avance à
 * son poste suivant — une seule règle couvre les deux.
 *
 * 30 minutes, et pas plus : à 60 min, deux créneaux espacés de 2 h voyaient
 * leurs tolérances se toucher, et un scan à 13h01 partait sur le checkpoint
 * suivant alors que le volontaire finissait peut-être le précédent. Ici le
 * creux reste ouvert (12h30 → 13h30 sur CP1 9h-12h puis CP4 14h-18h), et
 * c'est le PC qui tranche. Constante nommée : ajustable après la recette.
 */
export const TOLERANCE_CRENEAU_MS = 30 * 60 * 1000;

export type RaisonBlocageMission = 'chevauchement' | 'hors-creneau';

export type ResolutionMission =
  | { ok: true; mission: MissionVolontaireView }
  /** Les missions EN CAUSE, pour que l'écran dise quoi corriger ou quand revenir. */
  | { ok: false; raison: RaisonBlocageMission; missions: MissionVolontaireView[] };

function couvre(mission: MissionVolontaireView, instant: number, marge: number): boolean {
  return (
    new Date(mission.debutLe).getTime() - marge <= instant &&
    instant <= new Date(mission.finLe).getTime() + marge
  );
}

/**
 * Mission de la famille à utiliser, ou la raison pour laquelle on refuse d'en
 * choisir une. `null` = aucune mission de cette famille (le mode reste fermé,
 * gating 4.3/4.4 inchangé).
 *
 * Le verdict ne dépend JAMAIS de l'ordre de la liste : chaque étape ne conclut
 * que sur une candidate unique, sinon elle bloque.
 */
export function resoudreMissionDeFamille(
  mesMissions: readonly MissionVolontaireView[],
  famille: FamilleScan,
  maintenant: Date,
): ResolutionMission | null {
  const candidates = mesMissions.filter((mission) => FAMILLE_SCAN[mission.type] === famille);
  if (candidates.length === 0) {
    return null;
  }
  // Une seule mission : aucune ambiguïté possible, à aucune heure. C'est le
  // cas majoritaire, et le repli hors fenêtre sert la préparation avant la
  // course — on ne touche pas à ce qui marche.
  const seule = candidates[0];
  if (candidates.length === 1 && seule) {
    return { ok: true, mission: seule };
  }

  const instant = maintenant.getTime();
  for (const marge of [0, TOLERANCE_CRENEAU_MS]) {
    const retenues = candidates.filter((mission) => couvre(mission, instant, marge));
    const unique = retenues[0];
    if (retenues.length === 1 && unique) {
      return { ok: true, mission: unique };
    }
    if (retenues.length > 1) {
      return { ok: false, raison: 'chevauchement', missions: retenues };
    }
  }
  return { ok: false, raison: 'hors-creneau', missions: candidates };
}

/** Mission scan_checkpoint (scanner 4.2/4.4 — mode passages). */
export function resoudreMissionScan(
  mesMissions: readonly MissionVolontaireView[],
  maintenant: Date,
): ResolutionMission | null {
  return resoudreMissionDeFamille(mesMissions, 'chrono', maintenant);
}

/** Mission distribution_dossards (scanner 4.3 — mode retrait). */
export function resoudreMissionRetrait(
  mesMissions: readonly MissionVolontaireView[],
  maintenant: Date,
): ResolutionMission | null {
  return resoudreMissionDeFamille(mesMissions, 'retrait', maintenant);
}
