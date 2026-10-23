import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, SESSION_TTL_SEC } from '@/modules/iam/constants';
import { EmailInvalidError, InvalidCodeError, toApiError } from '@/modules/iam/errors';
import { verifyLoginCode } from '@/modules/iam/service';

// Story 6.1 — client natif : le jeton de session (clair) est renvoyé UNE
// SEULE fois dans le corps de la réponse quand `client === "native"`. Il
// vivra ensuite dans expo-secure-store et voyagera en Authorization: Bearer.
// Le cookie httpOnly reste posé dans tous les cas (web inchangé ; sans effet
// pour l'app native). Le jeton n'est JAMAIS loggé.

export async function POST(request: NextRequest) {
  let email: unknown = null;
  let code: unknown = null;
  let client: unknown = null;
  try {
    const body: unknown = await request.json();
    email = (body as { email?: unknown } | null)?.email ?? null;
    code = (body as { code?: unknown } | null)?.code ?? null;
    client = (body as { client?: unknown } | null)?.client ?? null;
  } catch {
    email = null;
    code = null;
    client = null;
  }
  if (typeof email !== 'string') {
    const apiError = toApiError(new EmailInvalidError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  if (typeof code !== 'string') {
    const apiError = toApiError(new InvalidCodeError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  try {
    const session = await verifyLoginCode(email, code);
    const natif = client === 'native';
    // no-store : la réponse transporte le token natif (une seule fois) —
    // aucun intermédiaire ne doit la cacher.
    const response = NextResponse.json(
      natif
        ? { ok: true, email: session.email, token: session.token }
        : { ok: true, email: session.email },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SEC,
      path: '/',
    });
    return response;
  } catch (error) {
    const apiError = toApiError(error);
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
}
