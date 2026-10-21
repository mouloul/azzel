import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import { UnauthenticatedError } from '@/modules/iam/errors';
import { getSession } from '@/modules/iam/service';
import type { SessionRecord } from '@/modules/iam/store';

import {
  BodyTooLargeError,
  InvalidBodyError,
  toPreuveApiError,
  type ApiError,
} from '@/modules/inscriptions/errors';
import { MAX_UPLOAD_BYTES } from '@/modules/inscriptions/proof-format';
import { getPreuveState, uploadPreuve } from '@/modules/inscriptions/proof-service';

const PROOF_FIELD = 'fichier';

function errorResponse(apiError: ApiError): NextResponse {
  return NextResponse.json(apiError.envelope, { status: apiError.status });
}

async function readSession(
  request: NextRequest,
): Promise<{ session: SessionRecord } | { response: NextResponse }> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { response: errorResponse(toPreuveApiError(new UnauthenticatedError())) };
  }
  try {
    const session = await getSession(token);
    if (!session) {
      return { response: errorResponse(toPreuveApiError(new UnauthenticatedError())) };
    }
    return { session };
  } catch (error) {
    return { response: errorResponse(toPreuveApiError(error)) };
  }
}

export async function GET(request: NextRequest) {
  const authenticated = await readSession(request);
  if ('response' in authenticated) {
    return authenticated.response;
  }
  try {
    const state = await getPreuveState(authenticated.session);
    return NextResponse.json({ preuve: state.preuve }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toPreuveApiError(error));
  }
}

export async function POST(request: NextRequest) {
  const authenticated = await readSession(request);
  if ('response' in authenticated) {
    return authenticated.response;
  }
  const contentLength = request.headers.get('content-length');
  if (
    contentLength === null ||
    !/^\d+$/.test(contentLength) ||
    Number(contentLength) > MAX_UPLOAD_BYTES
  ) {
    return errorResponse(toPreuveApiError(new BodyTooLargeError()));
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return errorResponse(toPreuveApiError(new InvalidBodyError()));
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(toPreuveApiError(new InvalidBodyError()));
  }
  const candidate = form.get(PROOF_FIELD);
  if (candidate === null || typeof candidate === 'string') {
    return errorResponse(toPreuveApiError(new InvalidBodyError()));
  }
  const file = candidate as File;
  if (file.size === 0) {
    return errorResponse(toPreuveApiError(new InvalidBodyError()));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(toPreuveApiError(new BodyTooLargeError()));
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const preuve = await uploadPreuve(authenticated.session, bytes);
    return NextResponse.json({ preuve }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toPreuveApiError(error));
  }
}
