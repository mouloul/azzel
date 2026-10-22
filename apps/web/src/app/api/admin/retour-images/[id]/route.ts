import { NextResponse, type NextRequest } from 'next/server';

import {
  TemoignageNotFoundError,
  toRetourImagesApiError,
} from '@/modules/retour-images/errors';
import { deleteTemoignage, updateTemoignage } from '@/modules/retour-images/service';

import { errorResponse, readJsonBody } from '../body';
import { guardAdmin } from '../../guard';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** id non-UUID : refus 404 propre avant SQL (un 22P02 serait un 500 interne). */
function idInvalide(id: string): boolean {
  return !UUID_PATTERN.test(id);
}

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
