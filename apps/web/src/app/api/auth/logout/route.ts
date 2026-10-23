import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import { logout } from '@/modules/iam/service';
import { sessionTokenFromRequest } from '@/modules/iam/session';

// Story 6.1 — l'app native se déconnecte avec son Bearer : la session est
// révoquée côté serveur (le jeton local est purgé par l'app elle-même, cache
// compris — voir auth-store).

export async function POST(request: NextRequest) {
  const token = sessionTokenFromRequest(request);
  if (token) {
    try {
      await logout(token);
    } catch {}
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  return response;
}
