import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { errorResponse, readJsonBody } from '@/app/api/admin/missions/body';
import { toMissionsApiError } from '@/modules/missions/errors';
import { deleteVolontaire, updateVolontaire } from '@/modules/missions/service';

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
    const resultat = await updateVolontaire(guarded.session, id, lu.body);
    // L'email de retour est celui ENREGISTRÉ (normalisé) : la liste doit
    // afficher l'adresse qui recevra l'invitation, pas la saisie brute.
    return NextResponse.json(
      {
        ok: true,
        invitationRenvoyee: resultat.invitationRenvoyee,
        email: resultat.volontaire.email,
      },
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
    const resultat = await deleteVolontaire(guarded.session, id);
    return NextResponse.json(resultat, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toMissionsApiError(error));
  }
}
