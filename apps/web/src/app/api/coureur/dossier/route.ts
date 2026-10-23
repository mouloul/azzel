import { NextResponse, type NextRequest } from 'next/server';

import { guardCoureur, coureurErrorResponse, toCoureurApiError } from '../guard';
import { getChecklistState } from '@/modules/inscriptions/service';

// Story 6.1 — checklist du dossier en JSON pour l'app native
// (GET /api/coureur/dossier). Même service que la page /espace-coureur,
// servi derrière le guard coureur (Bearer natif ou cookie web), no-store :
// l'état du dossier change avec les décisions de l'organisation.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guarded = await guardCoureur(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const checklist = await getChecklistState(guarded.session);
    return NextResponse.json(checklist, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return coureurErrorResponse(toCoureurApiError(error));
  }
}
