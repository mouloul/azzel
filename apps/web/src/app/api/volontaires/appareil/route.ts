import { NextResponse, type NextRequest } from 'next/server';

import { guardVolontaire, volontaireErrorResponse } from '@/app/api/volontaires/guard';
import { toChronoApiError } from '@/modules/chrono/errors';
import { enregistrerAppareil } from '@/modules/chrono/service';

// Story 4.5 (AD-5) — POST /api/volontaires/appareil : enregistrement de
// l'appareil scanneur auprès du canal sync, authentifié par SESSION
// volontaire (c'est le volontaire qui atteste l'appareil). Le jeton BRUT
// n'est retourné qu'ici, une fois — ensuite, seule la sync (Bearer) l'utilise,
// et la base n'en garde que le hash. no-store partout.

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const guarded = await guardVolontaire(request);
  if ('response' in guarded) {
    guarded.response.headers.set('Cache-Control', 'no-store');
    return guarded.response;
  }
  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    corps = null;
  }
  const appareilClient =
    typeof corps === 'object' && corps !== null && !Array.isArray(corps)
      ? (corps as { appareilId?: unknown }).appareilId
      : undefined;
  try {
    const resultat = await enregistrerAppareil(guarded.session, appareilClient);
    return NextResponse.json(
      { appareilId: resultat.appareilId, jeton: resultat.jeton },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toChronoApiError(error);
    return volontaireErrorResponse({
      status: apiError.status,
      envelope: apiError.envelope,
    });
  }
}
