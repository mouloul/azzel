import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, SESSION_TTL_SEC } from '@/modules/iam/constants';
import { InvalidCredentialsError, toApiError } from '@/modules/iam/errors';
import { connecterVolontaire } from '@/modules/iam/service';

/**
 * Story 3.1 — connexion volontaire (publique) : email + mot de passe scrypt.
 * Erreur générique sur identifiants erronés (aucune énumération de comptes).
 */
/**
 * IP de l'appelant pour le quota anti-brute-force (pattern auth/code 1.2) :
 * derrière un proxy, x-forwarded-for porte l'IP d'origine en premier.
 */
function readClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) {
    return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

export async function POST(request: NextRequest) {
  let email: unknown = null;
  let motDePasse: unknown = null;
  try {
    const body: unknown = await request.json();
    email = (body as { email?: unknown } | null)?.email ?? null;
    motDePasse = (body as { motDePasse?: unknown } | null)?.motDePasse ?? null;
  } catch {
    email = null;
    motDePasse = null;
  }
  if (typeof email !== 'string' || typeof motDePasse !== 'string') {
    const apiError = toApiError(new InvalidCredentialsError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  try {
    const session = await connecterVolontaire(email, motDePasse, {}, {
      clientIp: readClientIp(request),
    });
    const response = NextResponse.json({ ok: true, email: session.email });
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
    const response = NextResponse.json(apiError.envelope, { status: apiError.status });
    if (apiError.retryAfterSec !== undefined) {
      response.headers.set('Retry-After', String(apiError.retryAfterSec));
    }
    return response;
  }
}
