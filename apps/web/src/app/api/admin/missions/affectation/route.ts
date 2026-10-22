import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { toMissionsApiError } from '@/modules/missions/errors';
import { affecterVolontaire, desaffecterVolontaire } from '@/modules/missions/service';

import { errorResponse, readJsonBody } from '../body';

export async function POST(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  try {
    // L'avertissement de chevauchement vit dans la RÉPONSE (jamais bloquant) :
    // affectation créée + { avertissement: { missions: […] } } si conflit.
    const resultat = await affecterVolontaire(guarded.session, lu.body);
    return NextResponse.json(resultat, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}

/** Désaffectation par corps (missionId + volontaireId) — idempotente. */
export async function DELETE(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  try {
    const resultat = await desaffecterVolontaire(guarded.session, lu.body);
    return NextResponse.json(resultat, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}
