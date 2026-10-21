import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE_NAME, type AccountRole } from './constants';
import { DbUnavailableError } from './errors';
import { getSession } from './service';
import type { SessionRecord } from './store';

export type RequireSessionResult =
  | { status: 'authenticated'; session: SessionRecord }
  | { status: 'db-unavailable' };

export async function requireSession(): Promise<RequireSessionResult> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  let session: SessionRecord | null = null;
  if (token) {
    try {
      session = await getSession(token);
    } catch (error) {
      if (error instanceof DbUnavailableError) {
        return { status: 'db-unavailable' };
      }
      throw error;
    }
  }
  if (!session) {
    redirect('/connexion');
  }
  return { status: 'authenticated', session };
}

export type RequireRoleResult =
  | { status: 'authenticated'; session: SessionRecord }
  | { status: 'db-unavailable' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' };

export async function requireRole(
  required: AccountRole,
  token: string | null | undefined,
): Promise<RequireRoleResult> {
  if (!token) {
    return { status: 'unauthenticated' };
  }
  let session: SessionRecord | null = null;
  try {
    session = await getSession(token);
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      return { status: 'db-unavailable' };
    }
    throw error;
  }
  if (!session) {
    return { status: 'unauthenticated' };
  }
  if (session.role !== required) {
    return { status: 'forbidden' };
  }
  return { status: 'authenticated', session };
}

export async function requireRolePage(required: AccountRole): Promise<RequireSessionResult> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const result = await requireRole(required, token);
  if (result.status === 'unauthenticated') {
    redirect('/connexion');
  }
  if (result.status === 'forbidden') {
    redirect('/espace-coureur');
  }
  return result;
}
