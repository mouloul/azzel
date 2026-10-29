import { NextResponse, type NextRequest } from 'next/server';

import {
  TemoignageNotFoundError,
  toRetourImagesApiError,
} from '@/modules/retour-images/errors';
import { deleteTemoignage, updateTemoignage } from '@/modules/retour-images/service';

import { errorResponse, readJsonBody } from '../body';
import { guardAdmin } from '../../guard';
import { idInvalide } from '../../id';

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
  if (idInvalide(id)) {
    return errorResponse(toRetourImagesApiError(new TemoignageNotFoundError()));
  }
  try {
    const temoignage = await updateTemoignage(guarded.session, id, lu.body);
    return NextResponse.json(
      { ok: true, temoignage },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toRetourImagesApiError(error));
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
  if (idInvalide(id)) {
    return errorResponse(toRetourImagesApiError(new TemoignageNotFoundError()));
  }
  try {
    const result = await deleteTemoignage(guarded.session, id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toRetourImagesApiError(error));
  }
}
