import { NextResponse, type NextRequest } from 'next/server';

import { getSponsorsAdminState, setSponsorMode } from '@/modules/sponsors/service';
import { toSponsorsApiError } from '@/modules/sponsors/errors';

import { errorResponse, readJsonBody } from '../body';
import { guardAdmin } from '../../guard';

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const state = await getSponsorsAdminState(guarded.session);
    return NextResponse.json(
      { mode: state.mode },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toSponsorsApiError(error));
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
    const config = await setSponsorMode(guarded.session, lu.body);
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toSponsorsApiError(error));
  }
}
