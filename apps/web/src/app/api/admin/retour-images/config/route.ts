import { NextResponse, type NextRequest } from 'next/server';

import { toRetourImagesApiError } from '@/modules/retour-images/errors';
import { getRetourImagesAdminState, setTrailerUrl } from '@/modules/retour-images/service';

import { errorResponse, readJsonBody } from '../body';
import { guardAdmin } from '../../guard';

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const state = await getRetourImagesAdminState(guarded.session);
    return NextResponse.json(
      { trailerUrl: state.trailerUrl },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toRetourImagesApiError(error));
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
    const config = await setTrailerUrl(guarded.session, lu.body);
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toRetourImagesApiError(error));
  }
}
