import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { toMissionsApiError } from '@/modules/missions/errors';
import { renvoyerInvitation } from '@/modules/missions/service';

export async function POST(
  request: NextRequest,
  contexte: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const { id } = await contexte.params;
  try {
    const resultat = await renvoyerInvitation(guarded.session, id);
    return NextResponse.json(
      { ok: true, email: resultat.email },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toMissionsApiError(error);
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
}
