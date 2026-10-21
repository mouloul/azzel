import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, SESSION_TTL_SEC } from '@/modules/iam/constants';
import { EmailInvalidError, InvalidCodeError, toApiError } from '@/modules/iam/errors';
import { verifyLoginCode } from '@/modules/iam/service';

export async function POST(request: NextRequest) {
  let email: unknown = null;
  let code: unknown = null;
  try {
    const body: unknown = await request.json();
    email = (body as { email?: unknown } | null)?.email ?? null;
    code = (body as { code?: unknown } | null)?.code ?? null;
  } catch {
    email = null;
    code = null;
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
