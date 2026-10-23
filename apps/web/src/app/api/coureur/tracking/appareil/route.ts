import { NextResponse, type NextRequest } from 'next/server';

import { guardCoureur, coureurErrorResponse } from '@/app/api/coureur/guard';
import {
  CorpsSyncTropGrandError,
  toTrackingApiError,
} from '@/modules/tracking/errors';
import { enregistrerAppareilCoureur } from '@/modules/tracking/service';

// Story 6.2 (AD-5) — POST /api/coureur/tracking/appareil : enregistrement du
// téléphone du coureur auprès du canal sync positions, authentifié par
// SESSION coureur (c'est le coureur qui atteste son téléphone). Le jeton BRUT
// n'est retourné qu'ici, une fois — ensuite, seule la sync (Bearer appareil)
// l'utilise, et la base n'en garde que le hash. Ce jeton est INDÉPENDANT des
// sessions : il survit à un login web ailleurs (AD-5). Garde taille de corps
// AVANT request.json() (content-length EXIGÉE — un corps chunké ne contourne
// pas la borne). no-store partout. Réponse : { appareilServeurId, jeton } —
// l'id SERVEUR porte un nom distinct de l'appareilId CLIENT du corps sync.

export const dynamic = 'force-dynamic';

/** { appareilClient } tient en quelques octets — 64 Ko laisse une large marge. */
export const MAX_CORPS_APPAREIL_OCTETS = 65_536;

export async function POST(request: NextRequest) {
  const guarded = await guardCoureur(request);
  if ('response' in guarded) {
    guarded.response.headers.set('Cache-Control', 'no-store');
    return guarded.response;
  }
  // Taille AVANT request.json() — même garde DoS que la sync : content-length
  // absente (chunked) ou dépassée → 413, le corps n'est jamais parsé.
  const contentLength = request.headers.get('content-length');
  if (
    contentLength === null ||
    !/^\d+$/.test(contentLength) ||
    Number(contentLength) > MAX_CORPS_APPAREIL_OCTETS
  ) {
    const apiError = toTrackingApiError(new CorpsSyncTropGrandError(MAX_CORPS_APPAREIL_OCTETS));
    return coureurErrorResponse(apiError);
  }
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    corps = null;
  }
  const appareilClient =
    typeof corps === 'object' && corps !== null && !Array.isArray(corps)
      ? (corps as { appareilClient?: unknown }).appareilClient
      : undefined;
  try {
    const resultat = await enregistrerAppareilCoureur(guarded.session, appareilClient);
    return NextResponse.json(
      { appareilServeurId: resultat.appareilId, jeton: resultat.jeton },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toTrackingApiError(error);
    return coureurErrorResponse(apiError);
  }
}
