import {
  MOTIF_REJET_POSITION_INVALIDE,
  SYNC_POSITION_MAX_LOT,
  cleIdempotencePosition,
  estCorpsLotSyncPositionValide,
  estPositionValide,
  type PositionTerrain,
  type ReponseLotPosition,
} from '@azzel/shared';

import type { SessionRecord } from '@/modules/iam/store';

import {
  APPAREIL_CLIENT_MAX_LENGTH,
  compterStatutsPositions,
  resultatPosition,
  type AppareilCoureurAuth,
} from './domain';
import {
  AppareilClientInvalideError,
  CorpsSyncInvalideError,
  JetonAppareilInvalideError,
  AppareilRevokedError,
  LotTropGrandError,
  PositionInvalideError,
} from './errors';
import { getTrackingStore, hashJetonAppareil, type TrackingStore } from './store';

// Story 6.2 — service tracking : la couche qui décide. L'enregistrement d'un
// appareil exige une SESSION coureur (le coureur atteste son téléphone) ; la
// sync n'exige QUE le jeton (AD-5) — la outbox survit à une session révoquée
// (un login web ailleurs ne coupe JAMAIS la sync positions), jamais à une
// révocation d'appareil. Les clés d'idempotence du lot reçu sont RECALCULÉES
// ici : l'appareil propose, le serveur dispose.

export interface TrackingServiceDeps {
  store?: TrackingStore;
}

function estAppareilClientValide(appareilClient: unknown): appareilClient is string {
  return (
    typeof appareilClient === 'string' &&
    appareilClient.trim().length > 0 &&
    appareilClient.length <= APPAREIL_CLIENT_MAX_LENGTH
  );
}

/**
 * Enregistrement (session coureur) : find-or-create par (org, account,
 * appareil_client). Retourne le jeton BRUT une seule fois — seul le hash vit
 * en base. Un appareil RÉVOQUÉ est refusé : jamais de retour silencieux
 * (AD-5, assistance humaine).
 */
export async function enregistrerAppareilCoureur(
  session: SessionRecord,
  appareilClient: unknown,
  deps: TrackingServiceDeps = {},
): Promise<{ appareilId: string; jeton: string; rotation: boolean }> {
  if (!estAppareilClientValide(appareilClient)) {
    throw new AppareilClientInvalideError();
  }
  const store = deps.store ?? getTrackingStore();
  const enregistre = await store.enregistrerAppareilCoureur({
    organisationId: session.organisationId,
    accountId: session.accountId,
    appareilClient,
  });
  return { appareilId: enregistre.id, jeton: enregistre.jeton, rotation: enregistre.rotation };
}

/**
 * Garde du canal sync (Bearer appareil, SANS session) : hash lookup, refus
 * dédié si révoqué. Ne touche à RIEN d'autre — last_sync_at n'est rafraîchi
 * qu'après une ingestion RÉUSSIE (insererLotPositions).
 */
export async function verifierJetonAppareil(
  jeton: string,
  deps: TrackingServiceDeps = {},
): Promise<AppareilCoureurAuth> {
  const store = deps.store ?? getTrackingStore();
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
    accountId: appareil.accountId,
    appareilClient: appareil.appareilClient,
  };
}

/**
 * Ingestion d'un lot de positions : contrat validé PAR POSITION (shared,
 * clé RECALCULÉE par le serveur — une position hors contrat est rejetée
 * individuellement « position invalide », elle ne bloque JAMAIS la file),
 * insertions idempotentes (ON CONFLICT), réponse par position + compteurs.
 * L'horodatage de réception SERVEUR est capturé UNE fois par lot.
 */
export async function synchroniserLotPositions(
  appareil: AppareilCoureurAuth,
  corps: unknown,
  deps: TrackingServiceDeps = {},
): Promise<ReponseLotPosition> {
  if (!estCorpsLotSyncPositionValide(corps)) {
    throw new CorpsSyncInvalideError();
  }
  if (corps.positions.length > SYNC_POSITION_MAX_LOT) {
    throw new LotTropGrandError(SYNC_POSITION_MAX_LOT);
  }
  // Le serveur dispose : l'appareil du lot DOIT être celui du Bearer, sinon
  // les clés recalculées seraient forgées (position:v1:appareil:capteA avec
  // un appareilId étranger ne passe jamais).
  if (corps.appareilId !== appareil.appareilClient) {
    throw new PositionInvalideError();
  }
  const store = deps.store ?? getTrackingStore();
  const reception = new Date();

  // Tri par position : seules les positions de contrat partent en insertion
  // (les autres ne sont JAMAIS stockées), les statuts reviennent dans l'ordre
  // du lot d'origine.
  const valides: PositionTerrain[] = [];
  const rangs = new Map<number, number>();
  corps.positions.forEach((position, index) => {
    if (estPositionValide(position)) {
      rangs.set(index, valides.length);
      valides.push(position);
    }
  });

  const statutsValides = await store.insererLotPositions({
    organisationId: appareil.organisationId,
    appareilId: appareil.id,
    appareilClient: appareil.appareilClient,
    positions: valides,
    reception,
  });

  // Les positions valides ont été insérées DANS l'ordre du lot : la n-ième
  // valide correspond au n-ième statut retourné par le store.
  const resultats = corps.positions.map((position, index) => {
    const rangValide = rangs.get(index);
    if (rangValide === undefined) {
      return resultatPosition('', 'rejeté', MOTIF_REJET_POSITION_INVALIDE);
    }
    const statut = statutsValides[rangValide];
    if (statut === undefined) {
      throw new Error('synchroniserLotPositions : statut manquant pour une position du lot');
    }
    // La clé RÉPONDUE est celle du serveur : recalculée, la même que le
    // client a composée localement (même contrat shared).
    return resultatPosition(
      cleIdempotencePosition(appareil.appareilClient, position.capteA),
      statut,
    );
  });
  return {
    resultats,
    compteurs: compterStatutsPositions(resultats),
    recuA: reception.toISOString(),
  };
}
