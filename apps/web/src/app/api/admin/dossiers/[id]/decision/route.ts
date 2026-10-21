import { NextResponse, type NextRequest } from 'next/server';

import {
  BodyTooLargeError,
  InvalidBodyError,
  toAdminApiError,
} from '@/modules/inscriptions/errors';
import { decideDossier } from '@/modules/inscriptions/service';

import { adminErrorResponse, guardAdmin } from '../../../guard';

const MAX_BODY_BYTES = 4096;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guarded = await guardAdmin(request);
  if ('response' in guarded) {
    return guarded.response;
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return adminErrorResponse(toAdminApiError(new InvalidBodyError()));
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return adminErrorResponse(toAdminApiError(new BodyTooLargeError()));
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminErrorResponse(toAdminApiError(new InvalidBodyError()));
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return adminErrorResponse(toAdminApiError(new InvalidBodyError()));
  }
  const { id } = await context.params;
  try {
    const coureur = await decideDossier(guarded.session, id, body);
    return NextResponse.json(
      { ok: true, coureur },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return adminErrorResponse(toAdminApiError(error));
  }
}
