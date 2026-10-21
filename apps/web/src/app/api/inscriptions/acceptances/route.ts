import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import { UnauthenticatedError } from '@/modules/iam/errors';
import { getSession } from '@/modules/iam/service';
import type { SessionRecord } from '@/modules/iam/store';

import {
  BodyTooLargeError,
  InvalidBodyError,
  toAcceptancesApiError,
  type ApiError,
} from '@/modules/inscriptions/errors';
import { acceptDocuments, getAcceptancesState } from '@/modules/inscriptions/service';

const MAX_BODY_BYTES = 32_768;

function errorResponse(apiError: ApiError): NextResponse {
  const body = apiError.fields
    ? { ...apiError.envelope, fields: apiError.fields }
    : apiError.envelope;
  return NextResponse.json(body, { status: apiError.status });
}

async function readSession(
  request: NextRequest,
): Promise<{ session: SessionRecord } | { response: NextResponse }> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return { response: errorResponse(toAcceptancesApiError(new UnauthenticatedError())) };
  }
  try {
    const session = await getSession(token);
    if (!session) {
      return { response: errorResponse(toAcceptancesApiError(new UnauthenticatedError())) };
    }
    return { session };
  } catch (error) {
    return { response: errorResponse(toAcceptancesApiError(error)) };
  }
}

export async function GET(request: NextRequest) {
  const authenticated = await readSession(request);
  if ('response' in authenticated) {
    return authenticated.response;
  }
  try {
    const state = await getAcceptancesState(authenticated.session);
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(toAcceptancesApiError(error));
  }
}

export async function POST(request: NextRequest) {
  const authenticated = await readSession(request);
  if ('response' in authenticated) {
    return authenticated.response;
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return errorResponse(toAcceptancesApiError(new InvalidBodyError()));
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return errorResponse(toAcceptancesApiError(new BodyTooLargeError()));
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(toAcceptancesApiError(new InvalidBodyError()));
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return errorResponse(toAcceptancesApiError(new InvalidBodyError()));
  }
  try {
    const acceptances = await acceptDocuments(authenticated.session, body);
    return NextResponse.json({ ok: true, acceptances });
  } catch (error) {
    return errorResponse(toAcceptancesApiError(error));
  }
}
