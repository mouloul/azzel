import { NextResponse, type NextRequest } from 'next/server';

import { EmailInvalidError, toApiError } from '@/modules/iam/errors';
import { requestLoginCode } from '@/modules/iam/service';

/**
 * IP de l'appelant pour le quota anti-abus. Derrière un proxy (déploiement
 * cible), x-forwarded-for porte l'IP d'origine en premier. Absente (appel
 * direct, dev) → pas de quota par IP : la limite par email reste en vigueur.
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
  try {
    const body: unknown = await request.json();
    email = (body as { email?: unknown } | null)?.email ?? null;
  } catch {
    email = null;
  }
  if (typeof email !== 'string') {
    const apiError = toApiError(new EmailInvalidError());
    return NextResponse.json(apiError.envelope, { status: apiError.status });
  }
  try {
    await requestLoginCode(email, {}, { clientIp: readClientIp(request) });
    return NextResponse.json({ sent: true });
  } catch (error) {
    const apiError = toApiError(error);
    const response = NextResponse.json(apiError.envelope, { status: apiError.status });
    if (apiError.retryAfterSec !== undefined) {
      response.headers.set('Retry-After', String(apiError.retryAfterSec));
    }
    return response;
  }
}
