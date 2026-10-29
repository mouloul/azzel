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
  toPreuveApiError,
  type ApiError,
} from '@/modules/inscriptions/errors';
import { MAX_UPLOAD_BYTES } from '@/modules/inscriptions/proof-format';
import { getPreuveState, uploadPreuve } from '@/modules/inscriptions/proof-service';

const PROOF_FIELD = 'fichier';

function errorResponse(apiError: ApiError): NextResponse {
  return NextResponse.json(apiError.envelope, { status: apiError.status });
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
    return { response: errorResponse(toPreuveApiError(error)) };
  }
  switch (result.status) {
    case 'authenticated':
      return { session: result.session };
    case 'unauthenticated':
      return { response: errorResponse(toPreuveApiError(new UnauthenticatedError())) };
    case 'db-unavailable':
      return { response: errorResponse(toPreuveApiError(new DbUnavailableError())) };
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
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return errorResponse(toPreuveApiError(new InvalidBodyError()));
  }
  if (Number(contentLength) > MAX_UPLOAD_BYTES) {
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
