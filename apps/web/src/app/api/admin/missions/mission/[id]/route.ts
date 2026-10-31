import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { toMissionsApiError } from '@/modules/missions/errors';
import { deleteMission, updateMission } from '@/modules/missions/service';

import { errorResponse, readJsonBody } from '../../body';

export async function PUT(
  request: NextRequest,
  contexte: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const lu = await readJsonBody(request);
  if ('response' in lu) {
    return lu.response;
  }
  const { id } = await contexte.params;
  try {
    const { avertissement } = await updateMission(guarded.session, id, lu.body);
    // Réponse minimale : le client router.refresh() relit l'état complet —
    // pas de résumé factice (affectations/couverture) qui mentirait. Seul
    // l'avertissement de chevauchement (D2, jamais bloquant) l'accompagne.
    return NextResponse.json(
      { ok: true, avertissement },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}

export async function DELETE(
  request: NextRequest,
  contexte: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const { id } = await contexte.params;
  try {
    const resultat = await deleteMission(guarded.session, id);
    return NextResponse.json(resultat, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}
