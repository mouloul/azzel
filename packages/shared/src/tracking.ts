// Story 6.2 (FR-18, AD-2, AD-5, SM-C2) — contrat versionné du suivi GPS
// opt-in de l'app coureurs. Unique source de vérité inter-apps : l'app native
// construit la position et l'append dans son outbox SQLite, la sync la rejoue
// par lots idempotents vers le module tracking du backend — jamais réinventé
// localement. La clé d'idempotence NATURELLE est (appareil, instant de
// capture) : l'appareil propose, le serveur RECALCULE (jamais confiance au
// client). L'intervalle est FIXE (SM-C2) : jamais adaptatif, jamais
// paramétrable, la constante vit ICI et nulle part ailleurs.

import { estHorodatageValide } from './datetime';

export const POSITION_SCHEMA_VERSION = 1 as const;

export type PositionSchemaVersion = typeof POSITION_SCHEMA_VERSION;

/**
 * Intervalle de capture FIXE : 7 minutes (SM-C2 — milieu de la fourchette
 * 5–10 min, batterie d'abord). La fréquence ne doit JAMAIS être augmentée
 * pour embellir la carte au prix de la batterie des coureurs : aucune
 * configuration, aucun override, aucune adaptation.
 */
export const INTERVALLE_POSITION_MS = 7 * 60_000;

/** Taille maximale d'un lot sync positions (au-delà : 413, découpe client). */
export const SYNC_POSITION_MAX_LOT = 200;

/** Journal sync côté app : borné, lecture seule (lots, rejets, offsets). */
export const JOURNAL_SUIVI_MAX_ENTREES = 100;

/**
 * Une position GPS capturée : latitude/longitude décimales + `capteA`
 * (ISO 8601 UTC STRICT, suffixe Z — l'heure APPAREIL au moment de la
 * capture, donnée brute ; l'offset estimé et l'arbitrage serveur arrivent
 * avec la sync). Le payload est MINIMAL : jamais de nom ni d'identité.
 */
export interface PositionTerrain {
  version: PositionSchemaVersion;
  lat: number;
  lon: number;
  capteA: string;
}

/**
 * Garde de schéma défensive : seule une position de la bonne forme entre dans
 * l'outbox (symétrie avec estRetraitValide) — lat [-90, 90], lon [-180, 180],
 * nombres finis (NaN/Infinity refusés), `capteA` ISO UTC strict. Une position
 * invalide reste HORS outbox : elle n'existe ni côté app ni côté serveur.
 */
export function estPositionValide(valeur: unknown): valeur is PositionTerrain {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    candidat.version === POSITION_SCHEMA_VERSION &&
    typeof candidat.lat === 'number' &&
    Number.isFinite(candidat.lat) &&
    candidat.lat >= -90 &&
    candidat.lat <= 90 &&
    typeof candidat.lon === 'number' &&
    Number.isFinite(candidat.lon) &&
    candidat.lon >= -180 &&
    candidat.lon <= 180 &&
    typeof candidat.capteA === 'string' &&
    estHorodatageValide(candidat.capteA)
  );
}

/**
 * Clé d'idempotence d'une position (AD-2) : appareil + instant de capture.
 * Générée ICI, jamais réinventée localement — elle sert de PRIMARY KEY à
 * l'outbox SQLite (l'append d'une clé existante est un no-op physique :
 * INSERT OR IGNORE) et de clé UNIQUE à la table serveur `position` (le rejeu
 * d'un lot entier est « déjà-connu », JAMAIS un doublon). Le serveur
 * RECALCULE la clé du lot reçu : une clé transportée qui ne correspond pas
 * n'est jamais crue.
 */
export function cleIdempotencePosition(appareilId: string, capteA: string): string {
  return `position:v${POSITION_SCHEMA_VERSION}:${appareilId}:${capteA}`;
}

// ---------------------------------------------------------------------------
// Canal sync — lot idempotent par Bearer jeton d'appareil (indépendant des
// sessions, AD-5). Le client compose les lots (outbox − envoyées), le serveur
// valide par la garde CI-DESSUS (jamais réinventée) et RECALCULE les clés.
// ---------------------------------------------------------------------------

/** Corps de POST /api/coureur/tracking/sync : appareil propose, serveur dispose. */
export interface LotSyncPosition {
  /** Identifiant client stable de l'installation (UUID AsyncStorage). */
  appareilId: string;
  positions: PositionTerrain[];
}

export const MOTIF_REJET_POSITION_INVALIDE = 'position invalide';

export const STATUTS_SYNC_POSITION = ['accepté', 'déjà-connu', 'rejeté'] as const;

export type StatutSyncPosition = (typeof STATUTS_SYNC_POSITION)[number];

/** Réponse par position : ce que le serveur a fait de CHAQUE clé. */
export interface ResultatPositionSync {
  cle: string;
  statut: StatutSyncPosition;
  motif?: string;
}

export interface CompteursLotPosition {
  acceptes: number;
  dejaConnus: number;
  rejetes: number;
}

/** Réponse 200 du lot : détail par position + compteurs + référence serveur. */
export interface ReponseLotPosition {
  resultats: ResultatPositionSync[];
  compteurs: CompteursLotPosition;
  /** ISO UTC serveur à la réception du lot — base de l'offset client. */
  recuA: string;
}

/**
 * Garde du corps de POST sync : objet avec `appareilId` texte non vide et
 * `positions` TABLEAU (vide permis — no-op utile au client). Les positions
 * HORS contrat ne rendent PAS le lot illisible : chacune est rejetée
 * individuellement (« position invalide ») dans la réponse — une position
 * corrompue ne doit JAMAIS bloquer la file d'un coureur en zone blanche.
 */
export function estCorpsLotSyncPositionValide(valeur: unknown): valeur is LotSyncPosition {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as { appareilId?: unknown; positions?: unknown };
  return (
    typeof candidat.appareilId === 'string' &&
    candidat.appareilId.trim().length > 0 &&
    candidat.appareilId.length <= 120 &&
    Array.isArray(candidat.positions)
  );
}
