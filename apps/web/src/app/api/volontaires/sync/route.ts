import { NextResponse, type NextRequest } from 'next/server';
import { SYNC_TERRAIN_MAX_LOT, estCorpsLotSyncTerrainValide } from '@azzel/shared';

import { volontaireErrorResponse } from '@/app/api/volontaires/guard';
import {
  CorpsSyncInvalideError,
  CorpsSyncTropGrandError,
  JetonAppareilInvalideError,
  LotTropGrandError,
  toChronoApiError,
} from '@/modules/chrono/errors';
import { synchroniserLot, verifierJetonAppareil } from '@/modules/chrono/service';

// Story 4.5 — POST /api/volontaires/sync : ingestion du lot terrain.
// Garde DÉDIÉE par Bearer jeton d'appareil : AUCUNE session ici (AD-5 — la
// boîte d'envoi survit aux sessions révoquées ; un cookie de session ne vaut
// RIEN sur cette route, un Bearer ne vaut rien sur les routes session).
// Lot ≤ SYNC_TERRAIN_MAX_LOT événements (413 au-delà), réponse par événement
// (accepté/déjà-connu/rejeté+motif) + compteurs, no-store systématique.

export const dynamic = 'force-dynamic';

/** Garde DoS : le corps est lu seulement sous cette borne (200 événements
 *  bien formés tiennent en ~100 Ko — 1 Mo laisse une large marge). */
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
    const apiError = toChronoApiError(new JetonAppareilInvalideError());
    return volontaireErrorResponse(apiError);
  }
  // Taille AVANT request.json() : un corps géant ne transite jamais par le
  // parseur (défense DoS), le client découpe de toute façon.
  const contentLength = request.headers.get('content-length');
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_CORPS_SYNC_OCTETS
  ) {
    const apiError = toChronoApiError(new CorpsSyncTropGrandError(MAX_CORPS_SYNC_OCTETS));
    return volontaireErrorResponse(apiError);
  }
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    corps = null;
  }
  // Corps = { evenements: [...] } — les événements HORS contrat ne rendent pas
  // le lot illisible : chacun est rejeté individuellement par le service
  // (« contrat invalide »), la file d'un appareil de terrain ne se bloque jamais.
  if (!estCorpsLotSyncTerrainValide(corps)) {
    const apiError = toChronoApiError(new CorpsSyncInvalideError());
    return volontaireErrorResponse(apiError);
  }
  if (corps.evenements.length > SYNC_TERRAIN_MAX_LOT) {
    const apiError = toChronoApiError(new LotTropGrandError(SYNC_TERRAIN_MAX_LOT));
    return volontaireErrorResponse(apiError);
  }
  try {
    const appareil = await verifierJetonAppareil(jeton);
    const reponse = await synchroniserLot(appareil, corps);
    return NextResponse.json(reponse, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const apiError = toChronoApiError(error);
    return volontaireErrorResponse(apiError);
  }
}
