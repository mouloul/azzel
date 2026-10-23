// Story 6.2 — domaine tracking : types et pures de l'ingestion des positions
// GPS coureurs. Calque MINCE du module chrono : ingestion append-only
// uniquement ; la carte publique (épopée 7) lira par-dessus sans toucher à
// l'ingestion. Toute la validation de forme vit dans le contrat shared
// (estPositionValide) — ici, jamais réinventée.

import {
  MOTIF_REJET_POSITION_INVALIDE,
  type ResultatPositionSync,
  type StatutSyncPosition,
} from '@azzel/shared';

/** Appareil coureur authentifié par Bearer — résolu par hash, avant tout GUC. */
export interface AppareilCoureurAuth {
  id: string;
  organisationId: string;
  accountId: string;
  appareilClient: string;
}

export interface AppareilCoureurRecord {
  id: string;
  accountId: string;
  appareilClient: string;
  revokedAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

/** Réponse d'enregistrement : le jeton BRUT ne vivra qu'ici (une fois). */
export interface EnregistrementAppareilCoureur {
  appareilId: string;
  jeton: string;
  rotation: boolean;
}

/** Ligne position telle que lue en base (audit / future carte publique). */
export interface PositionRecord {
  id: string;
  organisationId: string;
  appareilCoureurId: string;
  cleIdempotence: string;
  latitude: number;
  longitude: number;
  capteAt: Date;
  recuA: Date;
  offsetEstimeMs: number;
}

export const APPAREIL_CLIENT_MAX_LENGTH = 120;

/** Offset estimé : réception SERVEUR − capture APPAREIL (donnée d'audit). */
export function calculerOffsetEstimeMs(recuA: Date, capteAt: Date): number {
  return Math.round(recuA.getTime() - capteAt.getTime());
}

/** Compte les statuts d'un lot pour la réponse (compteurs du lot). */
export function compterStatutsPositions(resultats: ResultatPositionSync[]): {
  acceptes: number;
  dejaConnus: number;
  rejetes: number;
} {
  const compteurs = { acceptes: 0, dejaConnus: 0, rejetes: 0 };
  for (const resultat of resultats) {
    if (resultat.statut === 'accepté') {
      compteurs.acceptes += 1;
    } else if (resultat.statut === 'déjà-connu') {
      compteurs.dejaConnus += 1;
    } else {
      compteurs.rejetes += 1;
    }
  }
  return compteurs;
}

/** Construit un résultat par position (statut fermé + motif optionnel). */
export function resultatPosition(
  cle: string,
  statut: StatutSyncPosition,
  motif?: string,
): ResultatPositionSync {
  return motif === undefined ? { cle, statut } : { cle, statut, motif };
}

/** Motif de rejet par position hors contrat (garde shared, jamais locale). */
export { MOTIF_REJET_POSITION_INVALIDE };
