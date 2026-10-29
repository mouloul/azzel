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

/**
 * Réponse d'erreur commune des routes admin : n'expose QUE status + envelope.
 * Typage structurel (Pick) : les mappers des autres modules (chrono…) portent
 * leur propre `fields` — jamais lu ici, la signature reste compatible.
 */
export function adminErrorResponse(
  apiError: Pick<ApiError, 'status' | 'envelope'>,
): NextResponse {
  return NextResponse.json(apiError.envelope, { status: apiError.status });
}

function roleGuardResponse(failure: 'unauthenticated' | 'forbidden'): NextResponse {
  // 401/403 : namespace iam.* via le mapper unique de l'iam.
  const error =
    failure === 'unauthenticated' ? new UnauthenticatedError() : new ForbiddenError();
  return adminErrorResponse(toIamApiError(error));
}

/**
 * Lecture du jeton : COOKIE uniquement, à dessein. Seule la surface coureur
 * (app native) présente un `Authorization: Bearer` ; l'administration et
 * l'espace volontaire sont des surfaces web, où accepter le Bearer
 * élargirait l'authentification sans besoin. Divergence volontaire avec
 * `guardCoureur`, qui passe par `sessionTokenFromRequest`.
 */
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
