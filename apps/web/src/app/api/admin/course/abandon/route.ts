import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import { CorpsAbandonInvalideError, CorpsAbandonTropGrandError, toCourseApiError } from '@/modules/chrono/errors';
import { saisirAbandon } from '@/modules/chrono/service';

// Story 5.3 — POST /api/admin/course/abandon : saisie d'un abandon au PC
// (dossard, lieu, motif fermé, heure locale convertie ISO par le client).
// Append-only, arbitré serveur (AD-3 : premier reçu gagne) — no-store.

/** Garde DoS AVANT request.json() : la saisie est minuscule (lieu ≤ 200 car.). */
export const MAX_CORPS_ABANDON_OCTETS = 16 * 1024;

function reponseErreur(apiError: ReturnType<typeof toCourseApiError>): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, {
    status: apiError.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  // Garde taille : ne s'applique qu'au content-length DÉCLARÉ. Un corps
  // chunked (sans content-length) est légitime — la validation du corps
  // (JSON + champs service) reste la défense réelle.
  const contentLength = request.headers.get('content-length');
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_CORPS_ABANDON_OCTETS
  ) {
    return reponseErreur(
      toCourseApiError(new CorpsAbandonTropGrandError(MAX_CORPS_ABANDON_OCTETS)),
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reponseErreur(toCourseApiError(new CorpsAbandonInvalideError()));
  }
  try {
    const abandon = await saisirAbandon(guarded.session, body);
    return NextResponse.json(
      { ok: true, abandon },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return reponseErreur(toCourseApiError(error));
  }
}
