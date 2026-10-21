import { NextResponse, type NextRequest } from 'next/server';

import { EmailInvalidError, toApiError } from '@/modules/iam/errors';
import { requestLoginCode } from '@/modules/iam/service';

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
    await requestLoginCode(email);
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
