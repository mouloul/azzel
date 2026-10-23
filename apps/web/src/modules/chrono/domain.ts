// Story 4.5 — domaine chrono : types et pures de l'ingestion terrain.
// Le module reste volontairement MINCE : ingestion + arbitrage uniquement ;
// classements et tableaux (épopées 5/7) interrogent premierRecu sans toucher
// à l'ingestion. Toute la validation de forme vit dans le contrat shared
// (estRetraitValide/estPassageValide) — ici, jamais réinventée.

import type {
  EvenementSyncTerrain,
  ResultatEvenementSync,
  StatutSyncTerrain,
} from '@azzel/shared';

/** Appareil authentifié par Bearer — résolu par hash, avant tout GUC. */
export interface AppareilAuth {
  id: string;
  organisationId: string;
  appareilClient: string;
}

export interface AppareilRecord {
  id: string;
  appareilClient: string;
  revokedAt: Date | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

/** Réponse d'enregistrement : le jeton BRUT ne vivra qu'ici (une fois). */
export interface EnregistrementAppareil {
  appareilId: string;
  jeton: string;
  rotation: boolean;
}

/** Ligne terrain_evenement telle que lue en base (audit/arbitrage). */
export interface TerrainEvenementRecord {
  id: string;
  cleIdempotence: string;
  type: 'retrait' | 'passage';
  editionId: string;
  jetonCoureur: string;
  checkpointId: string | null;
  horodatageAppareil: Date;
  horodatageReception: Date;
  offsetEstimeMs: number;
  appareilId: string;
}

// ---------------------------------------------------------------------------
// Story 5.1 — agrégats du tableau de bord PC course (lecture seule, AD-3).
// ---------------------------------------------------------------------------

/** Ligne de board UX-DR-12 : un passage ARBITRÉ (premier reçu par coureur×checkpoint). */
export interface PassageArbitre {
  dossard: number;
  horodatageReception: Date;
}

/** Board d'un checkpoint (mission scan_checkpoint de l'édition courante). */
export interface CheckpointCourse {
  id: string;
  titre: string;
  estArrivee: boolean;
  /** Tri heure de réception serveur DÉCROISSANT (UX-DR-12). */
  passages: PassageArbitre[];
}

/** Partants par épreuve : coureurs VALIDÉS de l'édition courante. */
export interface PartantsEpreuve {
  epreuveId: string;
  epreuveNom: string;
  total: number;
}

/** Agrégats PC course, org-scopés — tout horodatage est SERVEUR (AD-3). */
export interface EtatCourseRecord {
  edition: { id: string; nom: string } | null;
  partants: PartantsEpreuve[];
  /** Premiers retraits reçus, par coureur distinct. */
  retraits: number;
  /** Retirés ∧ passage arbitré au checkpoint est_arrivee (∧ = intersection). */
  arrives: number;
  /** retraits − abandonnés − arrivés (abandonnés = 0 en 5.1, réservé 5.3). */
  enCourse: number;
  /** Au plus un checkpoint d'arrivée par édition (garde service missions). */
  arriveeDefinie: boolean;
  checkpoints: CheckpointCourse[];
  /** max(horodatage_reception) — null = aucune donnée reçue. */
  fraicheur: Date | null;
}

/** Bornes symétriques du CHECK SQL appareil_client (0025). */
export const APPAREIL_CLIENT_MAX_LENGTH = 120;

/**
 * Plafond doux d'appareils ENREGISTRÉS par organisation (défense volumétrie) :
 * au-delà, l'enregistrement d'un NOUVEAU appareil est refusé (409) — la
 * rotation d'un appareil connu reste toujours possible.
 */
export const PLAFOND_APPAREILS_PAR_ORG = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Garde de forme UUID — les identifiants de checkpoint (mission scan_checkpoint,
 * V1) et d'édition transitent par des tableaux ::uuid[] SQL : un candidat non
 * UUID ne part jamais en requête (sinon erreur cast), il est simplement
 * introuvable.
 */
export function estUuidValide(valeur: string): boolean {
  return UUID_PATTERN.test(valeur);
}

/**
 * Offset estimé (AD-3) : référence SERVEUR à la réception moins heure
 * APPAREIL au scan — une DONNÉE d'audit journalisée par événement, jamais un
 * temps de classement.
 */
export function calculerOffsetEstimeMs(reception: Date, horodatageAppareil: Date): number {
  return Math.round(reception.getTime() - horodatageAppareil.getTime());
}

/** Compte les statuts d'un lot pour la réponse (compteurs du lot). */
export function compterStatuts(resultats: ResultatEvenementSync[]): {
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

/** Construit un résultat par événement (statut fermé + motif optionnel). */
export function resultatEvenement(
  evenement: EvenementSyncTerrain,
  statut: StatutSyncTerrain,
  motif?: string,
): ResultatEvenementSync {
  return motif === undefined ? { cle: evenement.cle, statut } : { cle: evenement.cle, statut, motif };
}

/** Découpe un lot en tranches ≤ SYNC_TERRAIN_MAX_LOT (reprise séquentielle). */
export function decouperEnTranches<T>(evenements: T[], tailleMax: number): T[][] {
  if (tailleMax < 1) {
    throw new Error('decouperEnTranches : tailleMax doit être ≥ 1');
  }
  const tranches: T[][] = [];
  for (let index = 0; index < evenements.length; index += tailleMax) {
    tranches.push(evenements.slice(index, index + tailleMax));
  }
  return tranches;
}
