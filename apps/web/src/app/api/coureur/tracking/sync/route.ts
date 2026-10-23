import { NextResponse, type NextRequest } from 'next/server';
import { SYNC_POSITION_MAX_LOT, estCorpsLotSyncPositionValide } from '@azzel/shared';

import { coureurErrorResponse } from '@/app/api/coureur/guard';
import {
  CorpsSyncInvalideError,
  CorpsSyncTropGrandError,
  JetonAppareilInvalideError,
  LotTropGrandError,
  toTrackingApiError,
} from '@/modules/tracking/errors';
import { synchroniserLotPositions, verifierJetonAppareil } from '@/modules/tracking/service';

// Story 6.2 — POST /api/coureur/tracking/sync : ingestion du lot de positions
// GPS. Garde DÉDIÉE par Bearer jeton d'appareil : AUCUNE session ici (AD-5 —
// la outbox survit aux sessions révoquées ; un login web ailleurs ne coupe
// JAMAIS la sync positions). Le Bearer est VÉRIFIÉ (401) AVANT tout travail
// sur le corps ; la garde taille (content-length) doit être PRÉSENTE — un
// corps chunked sans content-length ne contourne jamais la borne 1 Mo.
// Lot ≤ SYNC_POSITION_MAX_LOT positions (413 au-delà), réponse par position
// (accepté/déjà-connu/rejeté+motif) + compteurs, no-store systématique. Les
// clés d'idempotence sont RECALCULÉES par le serveur : l'appareil propose,
// le serveur dispose.

export const dynamic = 'force-dynamic';

/** Garde DoS : le corps est lu seulement sous cette borne (200 positions
 *  bien formées tiennent en ~50 Ko — 1 Mo laisse une large marge). */
export const MAX_CORPS_SYNC_OCTETS = 1_048_576;

function extraireBearer(request: NextRequest): string | null {
  const entete = request.headers.get('authorization');
  if (typeof entete !== 'string' || !entete.startsWith('Bearer ')) {
    return null;
  }
  const jeton = entete.slice('Bearer '.length).trim();
  return jeton.length > 0 ? jeton : null;
}

export async function POST(request: NextRequest) {
  const jeton = extraireBearer(request);
  if (jeton === null) {
    const apiError = toTrackingApiError(new JetonAppareilInvalideError());
    return coureurErrorResponse(apiError);
  }
  // Taille AVANT request.json() : un corps géant ne transite jamais par le
  // parseur (défense DoS), le client découpe de toute façon. Content-length
  // ABSENT (corps chunké) : refusé pareil — la garde ne se contourne pas.
  const contentLength = request.headers.get('content-length');
  if (
    contentLength === null ||
    !/^\d+$/.test(contentLength) ||
    Number(contentLength) > MAX_CORPS_SYNC_OCTETS
  ) {
    const apiError = toTrackingApiError(new CorpsSyncTropGrandError(MAX_CORPS_SYNC_OCTETS));
    return coureurErrorResponse(apiError);
  }
  // Bearer VÉRIFIÉ avant tout travail sur le corps : un jeton inconnu/révoqué
  // est refusé (401) même si le corps est illisible — l'ordre des refus est
  // la garantie (jamais un 400/413 qui masque un 401).
  let appareil;
  try {
    appareil = await verifierJetonAppareil(jeton);
  } catch (error) {
    const apiError = toTrackingApiError(error);
    return coureurErrorResponse(apiError);
  }
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    corps = null;
  }
  // Corps = { appareilId, positions: [...] } — les positions HORS contrat ne
  // rendent pas le lot illisible : chacune est rejetée individuellement par le
  // service (« position invalide »), la file d'un coureur en zone blanche ne
  // se bloque jamais.
  if (!estCorpsLotSyncPositionValide(corps)) {
    const apiError = toTrackingApiError(new CorpsSyncInvalideError());
    return coureurErrorResponse(apiError);
  }
  if (corps.positions.length > SYNC_POSITION_MAX_LOT) {
    const apiError = toTrackingApiError(new LotTropGrandError(SYNC_POSITION_MAX_LOT));
    return coureurErrorResponse(apiError);
  }
  try {
    const reponse = await synchroniserLotPositions(appareil, corps);
    return NextResponse.json(reponse, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const apiError = toTrackingApiError(error);
    return coureurErrorResponse(apiError);
  }
}
