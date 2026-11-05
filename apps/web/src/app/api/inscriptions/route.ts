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
  toApiError,
  type ApiError,
} from '@/modules/inscriptions/errors';
import {
  getChecklistState,
  getInscriptionState,
  submitInscription,
} from '@/modules/inscriptions/service';
import { prochaineEtapeCoureur } from '@/modules/inscriptions/prochaine-etape';

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
    return { response: errorResponse(toApiError(error)) };
  }
  switch (result.status) {
    case 'authenticated':
      return { session: result.session };
    case 'unauthenticated':
      return { response: errorResponse(toApiError(new UnauthenticatedError())) };
    case 'db-unavailable':
      return { response: errorResponse(toApiError(new DbUnavailableError())) };
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
    const state = await getInscriptionState(authenticated.session);
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(toApiError(error));
  }
}

export async function POST(request: NextRequest) {
  const authenticated = await readSession(request);
  if ('response' in authenticated) {
    return authenticated.response;
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength === null || !/^\d+$/.test(contentLength)) {
    return errorResponse(toApiError(new InvalidBodyError()));
  }
  if (Number(contentLength) > MAX_BODY_BYTES) {
    return errorResponse(toApiError(new BodyTooLargeError()));
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(toApiError(new InvalidBodyError()));
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return errorResponse(toApiError(new InvalidBodyError()));
  }
  let coureur: Awaited<ReturnType<typeof submitInscription>>;
  try {
    coureur = await submitInscription(authenticated.session, body);
  } catch (error) {
    return errorResponse(toApiError(error));
  }
  // Où envoyer le coureur ensuite : la première pièce non faite de son
  // dossier, calculée par la MÊME fonction que la redirection de connexion.
  // Sans cela, « Valider mon inscription » renvoyait au tableau de bord, à
  // charge de retrouver l'étape suivante tout seul.
  //
  // Le dossier est déjà écrit à ce stade : une panne de lecture de la
  // checklist ne doit pas faire croire à un échec d'enregistrement. On replie
  // alors sur l'espace coureur, qui affiche lui-même l'état du dossier.
  let prochaineEtape = '/espace-coureur';
  try {
    const etat = await getChecklistState(authenticated.session);
    prochaineEtape = prochaineEtapeCoureur(etat?.pieces ?? []);
  } catch (error) {
    console.warn(
      '[inscriptions] étape suivante indéterminée après inscription :',
      error instanceof Error ? error.message : error,
    );
  }
  return NextResponse.json({ ok: true, coureur, prochaineEtape });
}
