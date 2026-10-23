// Story 4.3 (AD-2, AD-8, NFR-7) — contrat versionné de l'événement terrain
// « retrait du dossard ». Unique source de vérité inter-apps : la PWA scanneuse
// construit et append l'événement dans son outbox IndexedDB, la sync (4.5) le
// rejouera par lots idempotents — jamais réinventé localement. Le payload est
// MINIMAL (NFR-7) : le jeton opaque suffit, JAMAIS de nom de coureur en clair
// dans l'outbox. Le Passage (4.4) étend ce module sur le même gabarit.

import { estJetonEdossardValide } from './edossard';

export const RETRAIT_SCHEMA_VERSION = 1 as const;

export type RetraitSchemaVersion = typeof RETRAIT_SCHEMA_VERSION;

/** Littéral de type d'événement — le discriminant du contrat terrain. */
export const RETRAIT_TERRAIN_TYPE = 'retrait' as const;

/**
 * Événement « retrait du dossard » au guichet : marque le coureur présent au
 * départ. `horodatage` = heure de l'APPAREIL au scan (donnée brute, AD-3) ;
 * l'offset estimé et l'arbitrage serveur arrivent avec la sync (4.5).
 */
export interface RetraitTerrain {
  version: RetraitSchemaVersion;
  type: typeof RETRAIT_TERRAIN_TYPE;
  editionId: string;
  /** Jeton e-dossard du coureur — opaque, jamais le nom (NFR-7). */
  jeton: string;
  /** ISO 8601 UTC — heure appareil au moment du scan (AD-3). */
  horodatage: string;
  /** Identifiant stable de l'appareil scanneur (store dédié, AD-5). */
  appareilId: string;
}

// Contrat documenté : ISO 8601 UTC strict avec suffixe Z (même exigence que
// les horodatages 3.2 et l'annuaire 3.4) — la comparaison de fraîcheur et le
// rejeu 4.5 dépendent d'un référentiel unique.
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function estDateIsoUtc(valeur: string): boolean {
  return ISO_UTC_PATTERN.test(valeur) && !Number.isNaN(new Date(valeur).getTime());
}

function estTexteNonVide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.trim().length > 0;
}

/**
 * Garde de schéma défensive : seul un événement de la bonne forme entre dans
 * l'outbox (symétrie avec estAnnuaireValide) — version ET type exacts,
 * identifiants non vides, jeton e-dossard bien formé, horodatage ISO UTC.
 */
export function estRetraitValide(valeur: unknown): valeur is RetraitTerrain {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    candidat.version === RETRAIT_SCHEMA_VERSION &&
    candidat.type === RETRAIT_TERRAIN_TYPE &&
    estTexteNonVide(candidat.editionId) &&
    estJetonEdossardValide(candidat.jeton) &&
    typeof candidat.horodatage === 'string' &&
    estDateIsoUtc(candidat.horodatage) &&
    estTexteNonVide(candidat.appareilId)
  );
}

/**
 * Clé d'idempotence du retrait (AD-2) : appareil + édition + jeton coureur.
 * Générée ICI, jamais réinventée localement — elle sert de keyPath au store
 * outbox : l'append d'une clé existante est un no-op physique, 4.5 s'appuie
 * dessus pour le rejeu sans doublon. Le préfixe type+version espace le store
 * (le Passage 4.4 y vivra aussi) sans changer la clé naturelle.
 */
export function cleIdempotenceRetrait(
  appareilId: string,
  editionId: string,
  jeton: string,
): string {
  return `retrait:v${RETRAIT_SCHEMA_VERSION}:${appareilId}:${editionId}:${jeton}`;
}

// ---------------------------------------------------------------------------
// Story 4.4 (AD-6, AD-8) — contrat versionné de l'événement terrain « passage
// aux checkpoints ». Même gabarit que le retrait ; la clé NATURELLE du Passage
// est (édition, coureur, checkpoint). V1 documentée : le checkpoint EST la
// mission scan_checkpoint en cours (son id fait référence) — le jour où un
// référentiel checkpoints dédié existera, seul le fournisseur du checkpointId
// changera, jamais la clé.
// ---------------------------------------------------------------------------

export const PASSAGE_SCHEMA_VERSION = 1 as const;

export type PassageSchemaVersion = typeof PASSAGE_SCHEMA_VERSION;

/** Littéral de type d'événement — le discriminant « passage » du contrat terrain. */
export const PASSAGE_TERRAIN_TYPE = 'passage' as const;

/**
 * Événement « passage aux checkpoints » en zone blanche : e-dossard →
 * checkpoint, horodatage de l'APPAREIL au scan (donnée brute, AD-3 — jamais
 * un temps de classement ; l'arbitrage premier-reçu-fait-foi arrive en 4.5,
 * AD-3). Deux postes qui scannent le même coureur au même checkpoint
 * produisent deux événements distincts : la clé locale ajoute l'appareil à la
 * clé naturelle (AD-2), le serveur arbitrera.
 */
export interface PassageTerrain {
  version: PassageSchemaVersion;
  type: typeof PASSAGE_TERRAIN_TYPE;
  editionId: string;
  /** Jeton e-dossard du coureur — opaque, jamais le nom (NFR-7). */
  jeton: string;
  /** Checkpoint = id de la mission scan_checkpoint en cours (V1 documentée). */
  checkpointId: string;
  /** ISO 8601 UTC — heure appareil au moment du scan (AD-3). */
  horodatage: string;
  /** Identifiant stable de l'appareil scanneur (store dédié, AD-5). */
  appareilId: string;
}

/**
 * Garde de schéma défensive (gabarit retrait) : version ET type exacts,
 * identifiants non vides (checkpointId inclus), jeton e-dossard bien formé,
 * horodatage ISO UTC strict.
 */
export function estPassageValide(valeur: unknown): valeur is PassageTerrain {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  return (
    candidat.version === PASSAGE_SCHEMA_VERSION &&
    candidat.type === PASSAGE_TERRAIN_TYPE &&
    estTexteNonVide(candidat.editionId) &&
    estJetonEdossardValide(candidat.jeton) &&
    estTexteNonVide(candidat.checkpointId) &&
    typeof candidat.horodatage === 'string' &&
    estDateIsoUtc(candidat.horodatage) &&
    estTexteNonVide(candidat.appareilId)
  );
}

/**
 * Clé d'idempotence du passage (AD-2) : appareil + édition + jeton coureur +
 * checkpoint — la clé naturelle (édition, coureur, checkpoint, AD-6/AD-8)
 * augmentée de l'appareil. Générée ICI, jamais réinventée localement ;
 * préfixe type+version distinct du retrait : les deux contrats cohabitent
 * dans le MÊME store outbox sans jamais collisionner.
 */
export function cleIdempotencePassage(
  appareilId: string,
  editionId: string,
  jeton: string,
  checkpointId: string,
): string {
  return `passage:v${PASSAGE_SCHEMA_VERSION}:${appareilId}:${editionId}:${jeton}:${checkpointId}`;
}
