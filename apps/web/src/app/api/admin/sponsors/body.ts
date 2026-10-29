import { NextResponse, type NextRequest } from 'next/server';

import {
  BodyTooLargeError,
  InvalidBodyError,
  toSponsorsApiError,
  type ApiError,
} from '@/modules/sponsors/errors';

// `url` et `logoUrl` valent 2048 caractères chacune (MAX_SPONSOR_URL_LENGTH) :
// à 4096, un sponsor au maximum de ses deux adresses partait en body_too_large,
// sans erreur de champ exploitable. 8 Kio laissent la place au nom et au JSON.
export const MAX_BODY_BYTES = 8192;

export function errorResponse(apiError: ApiError): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, { status: apiError.status });
}

/** Garde de corps JSON partagée par les routes sponsors (longueur, lisibilité, objet). */
export async function readJsonBody(
  request: NextRequest,
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return { response: errorResponse(toSponsorsApiError(new InvalidBodyError())) };
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return { response: errorResponse(toSponsorsApiError(new BodyTooLargeError())) };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: errorResponse(toSponsorsApiError(new InvalidBodyError())) };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { response: errorResponse(toSponsorsApiError(new InvalidBodyError())) };
  }
  return { body: body as Record<string, unknown> };
}
