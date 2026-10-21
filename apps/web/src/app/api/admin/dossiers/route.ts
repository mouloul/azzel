import { NextResponse, type NextRequest } from 'next/server';

import { getDossiersState } from '@/modules/inscriptions/service';
import { toAdminApiError } from '@/modules/inscriptions/errors';

import { adminErrorResponse, guardAdmin } from '../guard';

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const search = request.nextUrl.searchParams.get('q');
    const state = await getDossiersState(guarded.session, search);
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
