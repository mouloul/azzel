import { NextResponse, type NextRequest } from 'next/server';

import { toAdminApiError } from '@/modules/inscriptions/errors';
import { attribuerDossards } from '@/modules/inscriptions/service';

import { adminErrorResponse, guardAdmin } from '../../guard';

// Story 3.4 — attribution des dossards par lot : action admin SANS paramètre
// (numérotation séquentielle des validés sans dossard, suite du max, jamais
// renumérotée). no-store : le résultat change avec les validations.

export async function POST(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  try {
    const resultat = await attribuerDossards(guarded.session);
    return NextResponse.json(
      { ok: true, ...resultat },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
