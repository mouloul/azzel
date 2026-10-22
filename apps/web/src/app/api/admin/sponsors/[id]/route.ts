import { NextResponse, type NextRequest } from 'next/server';

import { deleteSponsor, updateSponsor } from '@/modules/sponsors/service';
import { toSponsorsApiError } from '@/modules/sponsors/errors';

import { errorResponse, readJsonBody } from '../body';
import { guardAdmin } from '../../guard';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  const { id } = await context.params;
  try {
    const sponsor = await updateSponsor(guarded.session, id, lu.body);
    return NextResponse.json(
      { ok: true, sponsor },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toSponsorsApiError(error));
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const { id } = await context.params;
  try {
    const result = await deleteSponsor(guarded.session, id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toSponsorsApiError(error));
  }
}
