import { NextResponse, type NextRequest } from 'next/server';

import {
  BodyTooLargeError,
  InvalidBodyError,
  toRetourImagesApiError,
  type ApiError,
} from '@/modules/retour-images/errors';

export const MAX_BODY_BYTES = 4096;

export function errorResponse(apiError: ApiError): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, { status: apiError.status });
}

/** Garde de corps JSON partagée par les routes retour-images (longueur, lisibilité, objet). */
export async function readJsonBody(
  request: NextRequest,
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return { response: errorResponse(toRetourImagesApiError(new InvalidBodyError())) };
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return { response: errorResponse(toRetourImagesApiError(new BodyTooLargeError())) };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: errorResponse(toRetourImagesApiError(new InvalidBodyError())) };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { response: errorResponse(toRetourImagesApiError(new InvalidBodyError())) };
  }
  return { body: body as Record<string, unknown> };
}
