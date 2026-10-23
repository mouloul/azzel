import { NextResponse, type NextRequest } from 'next/server';
import { createErrorEnvelope } from '@azzel/shared';

import { ROLE_COUREUR } from '@/modules/iam/constants';
import {
  DbUnavailableError,
  ForbiddenError,
  UnauthenticatedError,
  toApiError as toIamApiError,
} from '@/modules/iam/errors';
import { requireRole, sessionTokenFromRequest } from '@/modules/iam/session';
import type { SessionRecord } from '@/modules/iam/store';

import { NoEditionError, toApiError as toInscriptionsApiError, type ApiError } from '@/modules/inscriptions/errors';

// Story 6.1 — garde d'API de la surface coureur native : déclinaison du
// pattern guardVolontaire (enveloppes iam.* pour 401/403, no-store sur toute
// réponse). Le jeton vient du Bearer (app native) OU du cookie (navigateur) —
// même lookup hashé, même session unique AD-5. L'app native affiche
// message + action de l'enveloppe avec le bouton « Appeler l'équipe ».

export function coureurErrorResponse(apiError: ApiError): NextResponse {
  return NextResponse.json(apiError.envelope, {
    status: apiError.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Mapper de la surface coureur : tutoiement, jamais admin.* ni volontaires.*. */
export function toCoureurApiError(error: unknown): ApiError {
  if (error instanceof NoEditionError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'coureur.no_edition',
        message: 'Aucune édition n’est configurée pour le moment.',
        action: 'Réessaie plus tard — ou appelle l’équipe si tu y es déjà à J-1.',
      }),
    };
  }
  return toInscriptionsApiError(error);
}

function roleGuardResponse(failure: 'unauthenticated' | 'forbidden'): NextResponse {
  const error = failure === 'unauthenticated' ? new UnauthenticatedError() : new ForbiddenError();
  return coureurErrorResponse(toIamApiError(error));
}

export async function guardCoureur(
  request: NextRequest,
): Promise<{ session: SessionRecord } | { response: NextResponse }> {
  let result: Awaited<ReturnType<typeof requireRole>>;
  try {
    const token = sessionTokenFromRequest(request);
    result = await requireRole(ROLE_COUREUR, token);
  } catch (error) {
    return { response: coureurErrorResponse(toCoureurApiError(error)) };
  }
  switch (result.status) {
    case 'authenticated':
      return { session: result.session };
    case 'unauthenticated':
    case 'forbidden':
      return { response: roleGuardResponse(result.status) };
    case 'db-unavailable':
      return {
        response: coureurErrorResponse(toCoureurApiError(new DbUnavailableError())),
      };
  }
}
