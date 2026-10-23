import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { toCourseApiError } from '@/modules/chrono/errors';
import { getEtatCourse } from '@/modules/chrono/service';

// Story 5.1 — unique source « live » du PC course (AD-7 adapté : polling, pas
// de Supabase/WebSocket). Lecture seule, no-store : chaque hit sert l'instant
// calculé, jamais un cache intermédiaire.

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const etat = await getEtatCourse(guarded.session);
    return NextResponse.json(
      { ok: true, etat },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const apiError = toCourseApiError(error);
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
}
