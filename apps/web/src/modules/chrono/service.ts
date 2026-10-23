import {
  MOTIF_REJET_CONTRAT_INVALIDE,
  SYNC_TERRAIN_MAX_LOT,
  estCorpsLotSyncTerrainValide,
  estEvenementSyncTerrainValide,
  type EvenementSyncTerrain,
  type ReponseLotSync,
} from '@azzel/shared';

import type { SessionRecord } from '@/modules/iam/store';

import {
  APPAREIL_CLIENT_MAX_LENGTH,
  compterStatuts,
  resultatEvenement,
  type AbandonRecord,
  type AnnulationResultat,
  type AppareilAuth,
  type AppareilRecord,
  type AlerteHorsDelais,
  type CheckpointCourse,
  type EtatCourseRecord,
  type MotifAbandon,
  type TerrainEvenementRecord,
  hasAbandonFieldErrors,
  hasAnnulationFieldErrors,
  normaliserSaisieAbandon,
  normaliserSaisieAnnulation,
  validerSaisieAbandon,
  validerSaisieAnnulation,
} from './domain';
import {
  AppareilClientInvalideError,
  AppareilNotFoundError,
  AppareilRevokedError,
  CorpsSyncInvalideError,
  InvalidAbandonFieldsError,
  InvalidAnnulationFieldsError,
  JetonAppareilInvalideError,
  LotTropGrandError,
} from './errors';
import { hashJetonAppareil, type ChronoStore } from './store';
import { getChronoStore } from './store';

// Story 4.5 — service chrono : la couche qui décide. L'enregistrement d'un
// appareil exige une SESSION (le volontaire atteste l'appareil) ; la sync
// n'exige QUE le jeton (AD-5) — la boîte d'envoi survit à une session révoquée,
// jamais à une révocation d'appareil.

export interface ChronoServiceDeps {
  store?: ChronoStore;
}

function estAppareilClientValide(appareilClient: unknown): appareilClient is string {
  return (
    typeof appareilClient === 'string' &&
    appareilClient.trim().length > 0 &&
    appareilClient.length <= APPAREIL_CLIENT_MAX_LENGTH
  );
}

/**
 * Enregistrement (session volontaire) : find-or-create par appareil_client.
 * Retourne le jeton BRUT une seule fois — seul le hash vit en base. Un appareil
 * RÉVOQUÉ est refusé : jamais de retour silencieux (AD-5, assistance humaine).
 */
export async function enregistrerAppareil(
  session: SessionRecord,
  appareilClient: unknown,
  deps: ChronoServiceDeps = {},
): Promise<{ appareilId: string; jeton: string; rotation: boolean }> {
  if (!estAppareilClientValide(appareilClient)) {
    throw new AppareilClientInvalideError();
  }
  const store = deps.store ?? getChronoStore();
  const enregistre = await store.enregistrerAppareil({
    organisationId: session.organisationId,
    appareilClient,
  });
  return { appareilId: enregistre.id, jeton: enregistre.jeton, rotation: enregistre.rotation };
}

/**
 * Garde du canal sync (Bearer appareil, SANS session) : hash lookup, refus
 * dédié si révoqué. Ne touche à RIEN d'autre — last_sync_at n'est rafraîchi
 * qu'après une ingestion RÉUSSIE (synchroniserLot).
 */
export async function verifierJetonAppareil(
  jeton: string,
  deps: ChronoServiceDeps = {},
): Promise<AppareilAuth> {
  const store = deps.store ?? getChronoStore();
  const appareil = await store.trouverAppareilParHash(hashJetonAppareil(jeton));
  if (appareil === null) {
    throw new JetonAppareilInvalideError();
  }
  if (appareil.revokedAt !== null) {
    throw new AppareilRevokedError();
  }
  return {
    id: appareil.id,
    organisationId: appareil.organisationId,
    appareilClient: appareil.appareilClient,
  };
}

/**
 * Ingestion d'un lot : contrat validé PAR ÉVÉNEMENT (shared, clé recalculée —
 * un événement hors contrat est rejeté individuellement « contrat invalide »,
 * il ne bloque JAMAIS la file), jetons résolus org-scopé, insertions
 * idempotentes (ON CONFLICT), réponse par événement + compteurs. L'horodatage
 * de réception SERVEUR est capturé UNE fois par lot — c'est lui, jamais
 * l'heure appareil, qui fonde l'arbitrage (AD-3).
 */
export async function synchroniserLot(
  appareil: AppareilAuth,
  corps: unknown,
  deps: ChronoServiceDeps = {},
): Promise<ReponseLotSync> {
  if (!estCorpsLotSyncTerrainValide(corps)) {
    throw new CorpsSyncInvalideError();
  }
  if (corps.evenements.length > SYNC_TERRAIN_MAX_LOT) {
    throw new LotTropGrandError(SYNC_TERRAIN_MAX_LOT);
  }
  const store = deps.store ?? getChronoStore();
  const reception = new Date();

  // Tri par événement : seuls les événements de contrat partent en insertion
  // (les autres ne sont JAMAIS stockés), les statuts reviennent dans l'ordre
  // du lot d'origine.
  const valides: EvenementSyncTerrain[] = [];
  const horsContrat = new Map<number, string>();
  corps.evenements.forEach((evenement, index) => {
    if (estEvenementSyncTerrainValide(evenement)) {
      valides.push(evenement);
    } else {
      const cle = (evenement as { cle?: unknown })?.cle;
      horsContrat.set(index, typeof cle === 'string' ? cle : '');
    }
  });

  const statutsValides = await store.insererLot({
    organisationId: appareil.organisationId,
    evenements: valides,
    reception,
  });

  // last_sync_at rafraîchi APRÈS l'ingestion réussie : une tentative refusée
  // (révoqué, base indisponible) ne rajeunit pas l'appareil.
  await store.rafraichirLastSync({
    organisationId: appareil.organisationId,
    appareilId: appareil.id,
    maintenant: reception,
  });

  const resultats: ReponseLotSync['resultats'] = corps.evenements.map(
    (evenement, index) => {
      const horsContratCle = horsContrat.get(index);
      if (horsContratCle !== undefined) {
        return { cle: horsContratCle, statut: 'rejeté', motif: MOTIF_REJET_CONTRAT_INVALIDE };
      }
      // Les événements valides ont été insérés DANS l'ordre du lot : le n-ième
      // valide (hors contrats) correspond au n-ième statut retourné.
      const rangValide = index - [...horsContrat.keys()].filter((cle) => cle < index).length;
      const statut = statutsValides[rangValide];
      if (!estEvenementSyncTerrainValide(evenement) || statut === undefined) {
        throw new Error('synchroniserLot : statut manquant pour un événement du lot');
      }
      return typeof statut === 'string'
        ? resultatEvenement(evenement, statut)
        : resultatEvenement(evenement, 'rejeté', statut.rejeté);
    },
  );
  return {
    resultats,
    compteurs: compterStatuts(resultats),
    recuA: reception.toISOString(),
  };
}

/**
 * Arbitrage AD-3 (pour les épopées 5/7) : le PREMIER événement reçu côté
 * serveur pour la clé naturelle (édition, coureur, checkpoint — NULL pour un
 * retrait). Lecture seule : jamais l'ingestion n'est modifiée.
 */
export async function premierRecu(
  session: SessionRecord,
  input: { editionId: string; jeton: string; checkpointId: string | null },
  deps: ChronoServiceDeps = {},
): Promise<TerrainEvenementRecord | null> {
  const store = deps.store ?? getChronoStore();
  return store.premierRecu({
    organisationId: session.organisationId,
    editionId: input.editionId,
    jeton: input.jeton,
    checkpointId: input.checkpointId,
  });
}

export async function listerAppareils(
  session: SessionRecord,
  deps: ChronoServiceDeps = {},
): Promise<AppareilRecord[]> {
  const store = deps.store ?? getChronoStore();
  return store.listerAppareils(session.organisationId);
}

/** Révocation (admin) : idempotente, la première date d'audit est conservée. */
export async function revoquerAppareil(
  session: SessionRecord,
  appareilId: string,
  deps: ChronoServiceDeps = {},
): Promise<AppareilRecord> {
  const store = deps.store ?? getChronoStore();
  const appareil = await store.revoquerAppareil({
    organisationId: session.organisationId,
    appareilId,
    maintenant: new Date(),
  });
  if (appareil === null) {
    throw new AppareilNotFoundError();
  }
  return appareil;
}

// ---------------------------------------------------------------------------
// Story 5.1 — tableau de bord live du PC course. Contrat sérialisé (API/page) :
// horodatages ISO 8601 UTC, genereA = instant serveur (horloge de calcul de la
// fraîcheur côté client). Le type est DÉRIVÉ d'EtatCourseRecord (Omit +
// extensions) : toute colonne ajoutée au record remonte automatiquement ici,
// la sérialisation ne duplique rien de non lié. Story 5.3 : abandones vit dans
// le record (abandons de l'édition), la carte PC l'affiche telle quelle.
// ---------------------------------------------------------------------------

/** Passage board sérialisé : même forme que le record, horodatage en ISO. */
export interface PassageCourseSerde {
  evenementId: string;
  dossard: number;
  horodatageReception: string;
}

/** Checkpoint board sérialisé : même forme que le record, passages en ISO. */
export interface CheckpointCourseSerde
  extends Omit<CheckpointCourse, 'passages'> {
  passages: PassageCourseSerde[];
}

/** Alerte hors-délais sérialisée (story 5.2) : barrière en ISO, reste à l'identique. */
export interface AlerteCourseSerde
  extends Omit<AlerteHorsDelais, 'barriereLe'> {
  barriereLe: string;
}

export interface EtatCourse
  extends Omit<EtatCourseRecord, 'checkpoints' | 'alertes' | 'fraicheur'> {
  checkpoints: CheckpointCourseSerde[];
  /** Recalculées à chaque état : le polling 5 s les émet et les retire. */
  alertes: AlerteCourseSerde[];
  /** max(horodatage_reception) ISO — null = aucune donnée reçue. */
  fraicheur: string | null;
  /** Instant de génération SERVEUR (ISO), rafraîchi à chaque polling. */
  genereA: string;
}

function versEtatCourse(record: EtatCourseRecord, genereA: Date): EtatCourse {
  return {
    ...record,
    checkpoints: record.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      passages: checkpoint.passages.map((passage) => ({
        evenementId: passage.evenementId,
        dossard: passage.dossard,
        horodatageReception: passage.horodatageReception.toISOString(),
      })),
    })),
    alertes: record.alertes.map((alerte) => ({
      ...alerte,
      barriereLe: alerte.barriereLe.toISOString(),
    })),
    fraicheur: record.fraicheur !== null ? record.fraicheur.toISOString() : null,
    genereA: genereA.toISOString(),
  };
}

/**
 * Agrégats du PC course pour la session organisateur : partants par épreuve,
 * retraits/passages arbitrés (AD-3), arrivés, en course, fraîcheur — tout
 * org-scopé (withOrg + RLS). Sans édition : état ZÉRO cohérent (jamais une
 * erreur — le PC affiche des cartes vides, pas un écran d'échec).
 */
export async function getEtatCourse(
  session: SessionRecord,
  deps: ChronoServiceDeps = {},
): Promise<EtatCourse> {
  const store = deps.store ?? getChronoStore();
  const record = await store.etatCourse(session.organisationId);
  return versEtatCourse(record, new Date());
}

// ---------------------------------------------------------------------------
// Story 5.3 — saisie d'un abandon (FR-17). Le service valide la FORME (champs,
// heure ISO passée — l'heure locale→ISO est convertie côté client), trace
// l'auteur (email de la session organisateur) et délègue la décision de course
// au store : dossard résolu, coureur parti, pas arrivé, pas déjà abandonné —
// tout dans la transaction d'insertion (AD-3 : premier reçu gagne).
// ---------------------------------------------------------------------------

/** Abandon enregistré, sérialisé pour la route (heure saisie en ISO). */
export interface AbandonEnregistre {
  dossard: number;
  lieu: string;
  motif: MotifAbandon;
  heure: string;
}

export async function saisirAbandon(
  session: SessionRecord,
  rawInput: unknown,
  deps: ChronoServiceDeps = {},
): Promise<AbandonEnregistre> {
  const store = deps.store ?? getChronoStore();
  const input = normaliserSaisieAbandon(rawInput);
  // UN SEUL instant serveur fonde la validation ET l'horodatage de réception :
  // une heure exactement égale à « maintenant » reste valide (bornes incluses).
  const maintenant = new Date();
  const errors = validerSaisieAbandon(input, maintenant);
  if (hasAbandonFieldErrors(errors)) {
    throw new InvalidAbandonFieldsError(errors);
  }
  const record: AbandonRecord = await store.saisirAbandon({
    organisationId: session.organisationId,
    dossard: input.dossard as number,
    lieu: input.lieu,
    motif: input.motif as MotifAbandon,
    horodatage: new Date(input.heure as string),
    auteurEmail: session.email,
    maintenant,
  });
  return {
    dossard: input.dossard as number,
    lieu: record.lieu,
    motif: record.motif,
    heure: record.horodatage.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Story 5.4 — annulation auditable d'un passage (AD-8). Le service valide la
// FORME (evenementId requis, motif 1–500), trace l'auteur (email de la
// session organisateur) et délègue la décision au store : cible résolue dans
// l'org/édition courante (retrait → 409 dédié), insertion idempotente (UNIQUE
// evenement_id). L'événement terrain reste INTACT — les lectures arbitrées
// (etatCourse/premierRecu) l'excluent, le ré-arbitrage « second fait foi »
// est automatique.
// ---------------------------------------------------------------------------

/** Annulation rendue à la route : message PC (dossard, checkpoint) + drapeau idempotent. */
export type AnnulationSerde = AnnulationResultat;

export async function annulerPassage(
  session: SessionRecord,
  rawInput: unknown,
  deps: ChronoServiceDeps = {},
): Promise<AnnulationSerde> {
  const store = deps.store ?? getChronoStore();
  const input = normaliserSaisieAnnulation(rawInput);
  const errors = validerSaisieAnnulation(input);
  if (hasAnnulationFieldErrors(errors)) {
    throw new InvalidAnnulationFieldsError(errors);
  }
  return store.annulerPassage({
    organisationId: session.organisationId,
    evenementId: input.evenementId as string,
    motif: input.motif,
    auteurEmail: session.email,
  });
}
