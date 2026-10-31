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

import { AucuneEditionError, type ApiError } from '@/modules/missions/errors';

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
  // Story 3.4 — l'annuaire exige une édition : un volontaire sans édition
  // reçoit une enveloppe terrain, pas un code admin.missions.*.
  if (error instanceof AucuneEditionError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'volontaires.annuaire_sans_edition',
        message: 'L’annuaire des coureurs n’est pas encore publié pour ton organisation.',
        action: 'Réessaie plus tard — ou appelle l’équipe si tu y es déjà à J-1.',
      }),
    };
  }
  // Revue 3.3 — session morte en cours de service : enveloppes iam.* (même
  // mapper que la garde) ; toute autre erreur reste une enveloppe terrain,
  // jamais le repli admin.* du mapper missions.
  if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
    return toIamApiError(error);
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'volontaires.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant — ou appelle l’équipe si ça dure.',
    }),
  };
}

function roleGuardResponse(failure: 'unauthenticated' | 'forbidden'): NextResponse {
  const error = failure === 'unauthenticated' ? new UnauthenticatedError() : new ForbiddenError();
  return volontaireErrorResponse(toIamApiError(error));
}

/**
 * Lecture du jeton : COOKIE uniquement, à dessein. Seule la surface coureur
 * (app native) présente un `Authorization: Bearer` ; l'administration et
 * l'espace volontaire sont des surfaces web, où accepter le Bearer
 * élargirait l'authentification sans besoin. Divergence volontaire avec
 * `guardCoureur`, qui passe par `sessionTokenFromRequest`.
 */
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
