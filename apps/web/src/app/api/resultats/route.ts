import { NextResponse } from 'next/server';

import { toResultatsPublicApiError } from '@/modules/chrono/errors';
import { getResultatsPublic } from '@/modules/chrono/service';

// Story 7.2 — unique canal de rafraîchissement public (AD-7 : polling servi
// par le backend, JAMAIS de realtime navigateur) : GET anonyme, organisation
// par défaut, contrat ResultatsPublic TEL QUEL. no-store : chaque hit sert
// l'instant calculé. Cette route ne compte JAMAIS de visite — seul le
// chargement de PAGE avec ?partage=1 compte (aucun double comptage).

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const resultats = await getResultatsPublic();
    return NextResponse.json(
      { ok: true, resultats },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toResultatsPublicApiError(error);
    return NextResponse.json(apiError.envelope, {
      status: apiError.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
