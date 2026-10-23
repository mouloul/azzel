import { NextResponse, type NextRequest } from 'next/server';

import { adminErrorResponse, guardAdmin } from '@/app/api/admin/guard';
import { toChronoAdminApiError } from '@/modules/chrono/errors';
import { revoquerAppareil } from '@/modules/chrono/service';

// Story 4.5 (AD-5) — POST /api/admin/appareils/[id]/revoquer : révocation du
// jeton d'appareil par le PC, SANS toucher aux sessions. L'appareil révoqué
// recevra un 401 dédié sur /api/volontaires/sync et affichera « Appelle le
// PC » — jamais de réenregistrement silencieux. Idempotente (la première
// date de révocation est conservée). no-store.

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    guarded.response.headers.set('Cache-Control', 'no-store');
    return guarded.response;
  }
  const { id } = await context.params;
  try {
    const appareil = await revoquerAppareil(guarded.session, id);
    return NextResponse.json(
      {
        appareil: {
          id: appareil.id,
          appareilClient: appareil.appareilClient,
          revokedAt: appareil.revokedAt !== null ? appareil.revokedAt.toISOString() : null,
          lastSyncAt: appareil.lastSyncAt !== null ? appareil.lastSyncAt.toISOString() : null,
          createdAt: appareil.createdAt.toISOString(),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return adminErrorResponse(toChronoAdminApiError(error));
  }
}
