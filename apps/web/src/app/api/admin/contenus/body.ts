import { NextResponse, type NextRequest } from 'next/server';

import {
  BodyTooLargeError,
  InvalidBodyError,
  toContenusApiError,
  type ApiError,
} from '@/modules/contenus/errors';

// Corps de bloc jusqu'à 20 000 caractères : UTF-8 jusqu'à 4 octets/caractère
// (80 Kio) + JSON (titre, échappements) — 96 Kio couvre sans couper un corps
// légitime écrit en français ou en kabyle latin.
export const MAX_BODY_BYTES = 96 * 1024;

export function errorResponse(apiError: ApiError): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, { status: apiError.status });
}

/** Garde de corps JSON partagée par les routes contenus (longueur, lisibilité, objet). */
export async function readJsonBody(
  request: NextRequest,
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return { response: errorResponse(toContenusApiError(new InvalidBodyError())) };
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return { response: errorResponse(toContenusApiError(new BodyTooLargeError())) };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: errorResponse(toContenusApiError(new InvalidBodyError())) };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { response: errorResponse(toContenusApiError(new InvalidBodyError())) };
  }
  return { body: body as Record<string, unknown> };
}
