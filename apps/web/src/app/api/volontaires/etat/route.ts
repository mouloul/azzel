import { NextResponse, type NextRequest } from 'next/server';
import { nowIsoUtc } from '@azzel/shared';

import { guardVolontaire, toVolontairesApiError } from '@/app/api/volontaires/guard';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { getMissionsVolontaireState } from '@/modules/missions/service';

// Story 3.3 — état volontaire pour la PWA : rappelé à CHAQUE ouverture en
// ligne puis persisté en IndexedDB côté client (« à jour dès l'affectation »).
// no-store : cet état change avec les affectations, jamais de cache HTTP.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guarded = await guardVolontaire(request);
  if ('response' in guarded) {
    // Aucune réponse d'erreur ne part sans no-store : un intermédiaire ne
    // doit pas cacher une 401/503 périmée.
    guarded.response.headers.set('Cache-Control', 'no-store');
    return guarded.response;
  }
  try {
    const state = await getMissionsVolontaireState(guarded.session);
    return NextResponse.json(
      {
        editionNom: state.editionNom,
        assistancePhone: readAssistancePhone(),
        mesMissions: state.mesMissions,
        missions: state.missions,
        generéA: nowIsoUtc(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toVolontairesApiError(error);
    return NextResponse.json(apiError.envelope, {
      status: apiError.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
