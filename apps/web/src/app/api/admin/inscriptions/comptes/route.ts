import { NextResponse, type NextRequest } from 'next/server';

import { toAdminApiError } from '@/modules/inscriptions/errors';
import { updateComptesPaiementAdmin } from '@/modules/inscriptions/service';

import { adminErrorResponse, guardAdmin } from '../../guard';
import { readJsonBody } from '../../contenus/body';

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
    const etat = await updateComptesPaiementAdmin(guarded.session, lu.body);
    return NextResponse.json({ ok: true, etat });
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
