import { NextResponse, type NextRequest } from 'next/server';

import { ROLE_ORGANISATEUR, SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import {
  DbUnavailableError,
  ForbiddenError,
  UnauthenticatedError,
  toApiError as toIamApiError,
} from '@/modules/iam/errors';
import { requireRole } from '@/modules/iam/session';
import type { SessionRecord } from '@/modules/iam/store';

import { toAdminApiError, type ApiError } from '@/modules/inscriptions/errors';

export function adminErrorResponse(apiError: ApiError): NextResponse {
  return NextResponse.json(apiError.envelope, { status: apiError.status });
}

function roleGuardResponse(failure: 'unauthenticated' | 'forbidden'): NextResponse {
  // 401/403 : namespace iam.* via le mapper unique de l'iam.
  const error =
    failure === 'unauthenticated' ? new UnauthenticatedError() : new ForbiddenError();
  return adminErrorResponse(toIamApiError(error));
}

export async function guardAdmin(
  request: NextRequest,
): Promise<{ session: SessionRecord } | { response: NextResponse }> {
  let result: Awaited<ReturnType<typeof requireRole>>;
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    result = await requireRole(ROLE_ORGANISATEUR, token);
  } catch (error) {
    // Erreur non prévue : enveloppe plutôt qu’un 500 brut.
    return { response: adminErrorResponse(toAdminApiError(error)) };
  }
  switch (result.status) {
    case 'authenticated':
      return { session: result.session };
    case 'unauthenticated':
    case 'forbidden':
      return { response: roleGuardResponse(result.status) };
    case 'db-unavailable':
      return {
        response: adminErrorResponse(toAdminApiError(new DbUnavailableError())),
      };
  }
}
