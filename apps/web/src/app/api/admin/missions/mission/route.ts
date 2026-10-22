import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { toMissionsApiError } from '@/modules/missions/errors';
import { createMission } from '@/modules/missions/service';

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
    const mission = await createMission(guarded.session, lu.body);
    return NextResponse.json(
      { ok: true, mission },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}
