import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/modules/iam/constants';
import { toApiError, UnauthenticatedError } from '@/modules/iam/errors';
import { getSession } from '@/modules/iam/service';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
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
