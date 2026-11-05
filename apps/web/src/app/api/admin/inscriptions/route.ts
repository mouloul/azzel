import { NextResponse, type NextRequest } from 'next/server';

import { toAdminApiError } from '@/modules/inscriptions/errors';
import {
  attribuerPlaceAdmin,
  getReglagesAdmin,
  updateReglagesAdmin,
} from '@/modules/inscriptions/service';

import { revaliderAccueil } from '../revalidation';
import { adminErrorResponse, guardAdmin } from '../guard';
import { readJsonBody } from '../contenus/body';

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const etat = await getReglagesAdmin(guarded.session);
    return NextResponse.json(
      { ok: true, etat },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}

export async function PUT(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  try {
    const etat = await updateReglagesAdmin(guarded.session, lu.body);
    // L'accueil est servi depuis le cache (60 s) : sans invalidation, la date
    // exacte, le compteur de places ou la capacité changés ici mettraient une
    // minute à se voir côté public — et la date, elle, ne doit pas traîner.
    revaliderAccueil();
    return NextResponse.json({ ok: true, etat });
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}

/**
 * Attribution d'une place à un coureur en attente. POST et non PUT : ce n'est
 * pas la mise à jour d'une ressource mais une décision, et la rejouer sur un
 * coureur déjà servi doit répondre « introuvable », pas refaire l'opération.
 */
export async function POST(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  const body = lu.body as { coureurId?: unknown } | null;
  try {
    const { resultat, etat } = await attribuerPlaceAdmin(guarded.session, body?.coureurId);
    return NextResponse.json({ ok: true, resultat, etat });
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
