import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import {
  CorpsAnnulationInvalideError,
  CorpsAnnulationTropGrandError,
  toCourseApiError,
} from '@/modules/chrono/errors';
import { annulerPassage } from '@/modules/chrono/service';

// Story 5.4 — POST /api/admin/course/annulation : annulation AUDITABLE d'un
// passage au PC (evenementId + motif 1–500). Append-only, idempotente (UNIQUE
// evenement_id : un rejeu rend « déjà annulé », 200 — la première insertion
// rend 201) — no-store. L'événement terrain reste INTACT (AD-8).

/** Garde DoS AVANT request.json() : le motif est borné (≤ 500 car.). */
export const MAX_CORPS_ANNULATION_OCTETS = 16 * 1024;

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
    Number(contentLength) > MAX_CORPS_ANNULATION_OCTETS
  ) {
    return reponseErreur(
      toCourseApiError(new CorpsAnnulationTropGrandError(MAX_CORPS_ANNULATION_OCTETS)),
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reponseErreur(toCourseApiError(new CorpsAnnulationInvalideError()));
  }
  try {
    const annulation = await annulerPassage(guarded.session, body);
    return NextResponse.json(
      { ok: true, annulation },
      {
        status: annulation.dejaAnnule ? 200 : 201,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return reponseErreur(toCourseApiError(error));
  }
}
