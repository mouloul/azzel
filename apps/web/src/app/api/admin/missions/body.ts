import { NextResponse, type NextRequest } from 'next/server';

import {
  InvalidMissionsBodyError,
  MissionsBodyTooLargeError,
  toMissionsApiError,
  type ApiError,
} from '@/modules/missions/errors';

export const MAX_BODY_BYTES = 16 * 1024;

export function errorResponse(apiError: ApiError): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, { status: apiError.status });
}

/** Garde de corps JSON partagée par les routes missions (pattern sponsors). */
export async function readJsonBody(
  request: NextRequest,
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return { response: errorResponse(toMissionsApiError(new InvalidMissionsBodyError())) };
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return {
      response: errorResponse(toMissionsApiError(new MissionsBodyTooLargeError(MAX_BODY_BYTES))),
    };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: errorResponse(toMissionsApiError(new InvalidMissionsBodyError())) };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { response: errorResponse(toMissionsApiError(new InvalidMissionsBodyError())) };
  }
  return { body: body as Record<string, unknown> };
}
