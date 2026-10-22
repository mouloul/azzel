import { NextResponse, type NextRequest } from 'next/server';
import { createErrorEnvelope } from '@azzel/shared';

import { ROLE_VOLONTAIRE, SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import {
  DbUnavailableError,
  ForbiddenError,
  UnauthenticatedError,
  toApiError as toIamApiError,
} from '@/modules/iam/errors';
import { requireRole } from '@/modules/iam/session';
import type { SessionRecord } from '@/modules/iam/store';

import { toMissionsApiError, type ApiError } from '@/modules/missions/errors';

// Story 3.3 — garde d'API de la surface volontaires : déclinaison du pattern
// guardAdmin pour le rôle volontaire (route publique d'état, enveloppes
// iam.* pour 401/403 — mapper unique de l'iam). La base indisponible y a sa
// PROPRE enveloppe terrain (volontaires.*, tutoiement) : un volontaire ne
// reçoit jamais un code admin.*.

export function volontaireErrorResponse(apiError: ApiError): NextResponse {
  return NextResponse.json(apiError.envelope, { status: apiError.status });
}

/** Mapper de la surface volontaires : terrain, tutoiement, jamais admin.*. */
export function toVolontairesApiError(error: unknown): ApiError {
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'volontaires.db_unavailable',
        message: 'Connexion indisponible.',
        action:
          'Réessaie dans un instant — ta fiche reste lisible hors-ligne si tu l’avais déjà ouverte en ligne.',
      }),
    };
  }
  return toMissionsApiError(error);
}

function roleGuardResponse(failure: 'unauthenticated' | 'forbidden'): NextResponse {
  const error = failure === 'unauthenticated' ? new UnauthenticatedError() : new ForbiddenError();
  return volontaireErrorResponse(toIamApiError(error));
}

export async function guardVolontaire(
  request: NextRequest,
): Promise<{ session: SessionRecord } | { response: NextResponse }> {
  let result: Awaited<ReturnType<typeof requireRole>>;
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    result = await requireRole(ROLE_VOLONTAIRE, token);
  } catch (error) {
    return { response: volontaireErrorResponse(toVolontairesApiError(error)) };
  }
  switch (result.status) {
    case 'authenticated':
      return { session: result.session };
    case 'unauthenticated':
    case 'forbidden':
      return { response: roleGuardResponse(result.status) };
    case 'db-unavailable':
      return {
        response: volontaireErrorResponse(toVolontairesApiError(new DbUnavailableError())),
      };
  }
}
