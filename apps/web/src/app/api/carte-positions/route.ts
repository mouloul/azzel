import { NextResponse } from 'next/server';

import { toCartePubliqueApiError } from '@/modules/chrono/errors';
import { getPositionsPubliques } from '@/modules/chrono/carte';

// Story 7.3 — canal public des positions de la carte (AD-7 : servi par le
// backend, JAMAIS de realtime navigateur) : GET anonyme, organisation par
// défaut, micro-cache 5 s côté service. Anonymat strict : la réponse ne porte
// QUE dossard/épreuve/position horodatée (FR-19, NFR-7). no-store : chaque hit
// sert l'instant calculé (le micro-cache protège la base, pas le client).

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { positions, genereA } = await getPositionsPubliques();
    return NextResponse.json(
      { ok: true, positions, genereA },
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
