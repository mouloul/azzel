import { NextResponse, type NextRequest } from 'next/server';

import { adminErrorResponse, guardAdmin } from '@/app/api/admin/guard';
import { toChronoAdminApiError } from '@/modules/chrono/errors';
import { listerAppareils } from '@/modules/chrono/service';

// Story 4.5 (AD-5) — GET /api/admin/appareils : la liste des appareils
// scanneurs de l'organisation (état de révocation, dernière sync) pour le PC.
// no-store : l'état change à chaque sync/révocation.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    guarded.response.headers.set('Cache-Control', 'no-store');
    return guarded.response;
  }
  try {
    const appareils = await listerAppareils(guarded.session);
    return NextResponse.json(
      {
        appareils: appareils.map((appareil) => ({
          id: appareil.id,
          appareilClient: appareil.appareilClient,
          revokedAt: appareil.revokedAt !== null ? appareil.revokedAt.toISOString() : null,
          lastSyncAt: appareil.lastSyncAt !== null ? appareil.lastSyncAt.toISOString() : null,
          createdAt: appareil.createdAt.toISOString(),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return adminErrorResponse(toChronoAdminApiError(error));
  }
}
