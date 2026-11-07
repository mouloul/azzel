import type { EtatVolontaires } from '@/lib/idb-volontaires';
import type { FamilleScan } from '@/modules/missions/domain';
import type { MissionVolontaireView } from '@/modules/missions/service';

import { resoudreMissionDeFamille, type RaisonBlocageMission } from './mission-scan';

// Story 4.7 — réseau présent et base muette : le serveur répond, le service
// worker laisse donc passer sa réponse, et la carte « Connexion indisponible »
// prend la place du scanner — alors que l'annuaire, la boîte d'envoi et le
// jeton d'appareil dorment en IndexedDB (NFR-8 : aucune fonction critique ne
// dépend du réseau).
//
// Le checkpoint n'est pas une décision calculée au scan : c'est l'affectation
// posée par l'organisateur, et elle est déjà dans la poche. Ce module la relit
// avec la résolution de 4.6 — la MÊME fonction, repli et blocages compris.
// Rien de nouveau n'est décidé ici : on déplace une lecture, pas une règle.

export type ReplipocheResultat =
  | { statut: 'resolue'; mission: MissionVolontaireView; repriseDe: string }
  | { statut: 'bloquee'; raison: RaisonBlocageMission; missions: MissionVolontaireView[] }
  /** Poche vide, ou aucune mission de cette famille : pas de scan à l'aveugle. */
  | { statut: 'absente' };

/**
 * Affectation reprise de la poche. `repriseDe` est la date de l'état mémorisé :
 * c'est elle que le bandeau de fraîcheur affiche, pour que le volontaire sache
 * sur quelle information il travaille et puisse appeler le PC s'il a été
 * réaffecté depuis.
 */
export function repliPoche(
  etat: EtatVolontaires | null,
  famille: FamilleScan,
  maintenant: Date,
): ReplipocheResultat {
  if (etat === null) {
    return { statut: 'absente' };
  }
  const resolution = resoudreMissionDeFamille(etat.mesMissions, famille, maintenant);
  if (resolution === null) {
    return { statut: 'absente' };
  }
  if (!resolution.ok) {
    return { statut: 'bloquee', raison: resolution.raison, missions: resolution.missions };
  }
  return { statut: 'resolue', mission: resolution.mission, repriseDe: etat.generéA };
}
