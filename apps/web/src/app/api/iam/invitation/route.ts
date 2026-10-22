import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, SESSION_TTL_SEC } from '@/modules/iam/constants';
import { InvitationInvalidError, PasswordInvalidError, toApiError } from '@/modules/iam/errors';
import { activerVolontaire } from '@/modules/iam/service';

/**
 * Story 3.1 — activation volontaire (publique) : consomme l'invitation, pose
 * le mot de passe scrypt et ouvre la session unique. La page /invitation ne
 * révèle rien au-delà de la validité du jeton : erreurs génériques, jamais de
 * distinction « compte inconnu / déjà utilisé » côté client.
 */
export async function POST(request: NextRequest) {
  let jeton: unknown = null;
  let motDePasse: unknown = null;
  try {
    const body: unknown = await request.json();
    jeton = (body as { jeton?: unknown } | null)?.jeton ?? null;
    motDePasse = (body as { motDePasse?: unknown } | null)?.motDePasse ?? null;
  } catch {
    jeton = null;
    motDePasse = null;
  }
  if (typeof jeton !== 'string') {
    const apiError = toApiError(new InvitationInvalidError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  if (typeof motDePasse !== 'string') {
    const apiError = toApiError(new PasswordInvalidError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  try {
    const session = await activerVolontaire(jeton, motDePasse);
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
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
}
