import { NextResponse, type NextRequest } from 'next/server';

import { ROLE_COUREUR, SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import {
  DbUnavailableError,
  ForbiddenError,
  UnauthenticatedError,
  toApiError as toIamApiError,
} from '@/modules/iam/errors';
import { requireRole } from '@/modules/iam/session';
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

// Surface coureur : toute session d'un autre rôle (volontaire, organisateur)
// est refusée en 403 (enveloppe iam.forbidden) — rôle unique par compte, la
// connexion par code étant désormais commune à tous les rôles.
async function readSession(
  request: NextRequest,
): Promise<{ session: SessionRecord } | { response: NextResponse }> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let result: Awaited<ReturnType<typeof requireRole>>;
  try {
    result = await requireRole(ROLE_COUREUR, token);
  } catch (error) {
    return { response: errorResponse(toAcceptancesApiError(error)) };
  }
  switch (result.status) {
    case 'authenticated':
      return { session: result.session };
    case 'unauthenticated':
      return { response: errorResponse(toAcceptancesApiError(new UnauthenticatedError())) };
    case 'db-unavailable':
      return { response: errorResponse(toAcceptancesApiError(new DbUnavailableError())) };
    case 'forbidden':
      return { response: errorResponse(toIamApiError(new ForbiddenError())) };
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
