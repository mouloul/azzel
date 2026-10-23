import { NextResponse, type NextRequest } from 'next/server';

import { guardAdmin } from '@/app/api/admin/guard';
import {
  CorpsHeuresDepartInvalideError,
  CorpsHeuresDepartTropGrandError,
  toCourseApiError,
} from '@/modules/chrono/errors';
import { enregistrerHeuresDepart } from '@/modules/chrono/service';

// Story 7.1 — PUT /api/admin/course/heures-depart : configuration des heures
// de départ officielles par épreuve (départs échelonnés). Organisateur seul
// (garde admin — un volontaire ne configure JAMAIS la référence horaire des
// classements), corps {heures: [{epreuveId, heureDepart: ISO|null}]}, écriture
// sous GUC, réponse = état serveur complet, no-store.

/** Garde DoS AVANT request.json() : quelques épreuves × un ISO court. */
export const MAX_CORPS_HEURES_DEPART_OCTETS = 16 * 1024;

function reponseErreur(apiError: ReturnType<typeof toCourseApiError>): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, {
    status: apiError.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PUT(request: NextRequest) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  // Garde taille AVANT request.json() : la borne doit être VÉRIFIABLE — un
  // content-length ABSENT (corps chunké) ou non numérique est refusé pareil
  // (calque sync tracking 6.2), le corps n'est jamais lu sans borne.
  const contentLength = request.headers.get('content-length');
  if (
    contentLength === null ||
    !/^\d+$/.test(contentLength) ||
    Number(contentLength) > MAX_CORPS_HEURES_DEPART_OCTETS
  ) {
    return reponseErreur(
      toCourseApiError(new CorpsHeuresDepartTropGrandError(MAX_CORPS_HEURES_DEPART_OCTETS)),
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reponseErreur(toCourseApiError(new CorpsHeuresDepartInvalideError()));
  }
  try {
    const epreuves = await enregistrerHeuresDepart(guarded.session, body);
    return NextResponse.json(
      { ok: true, heures: { epreuves } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return reponseErreur(toCourseApiError(error));
  }
}
