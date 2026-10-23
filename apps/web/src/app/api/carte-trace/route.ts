import { NextResponse } from 'next/server';

import { toCartePubliqueApiError } from '@/modules/chrono/errors';
import { getTracesPubliques } from '@/modules/chrono/carte';

// Story 7.3 — canal public des tracés de la carte (AD-7) : GET anonyme,
// organisation par défaut. Le GPX est récupéré, parsé et réduit CÔTÉ SERVEUR
// (le client ne télécharge jamais le GPX brut) ; un GPX cassé n'entraîne que
// SA trace absente (échec isolé par épreuve). no-store : chaque hit sert
// l'instant calculé (le cache mémoire 1 h protège l'origine, pas le client).

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { traces } = await getTracesPubliques();
    return NextResponse.json(
      { ok: true, traces },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toCartePubliqueApiError(error);
    return NextResponse.json(apiError.envelope, {
      status: apiError.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
