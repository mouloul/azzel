import { NextResponse, type NextRequest } from 'next/server';

import { toApiError, UnauthenticatedError } from '@/modules/iam/errors';
import { getSession } from '@/modules/iam/service';
import { sessionTokenFromRequest } from '@/modules/iam/session';

// Story 6.1 — l'app native interroge sa session avec son Bearer (contrôle de
// validité au démarrage : 401 → écran de reconnexion, cache conservé).

export async function GET(request: NextRequest) {
  const token = sessionTokenFromRequest(request);
  if (!token) {
    const apiError = toApiError(new UnauthenticatedError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  try {
    const session = await getSession(token);
    if (!session) {
      const apiError = toApiError(new UnauthenticatedError());
      return NextResponse.json(apiError.envelope, { status: apiError.status });
    }
    return NextResponse.json({
      email: session.email,
      role: session.role,
      createdAt: session.createdAt.toISOString(),
    });
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
}
