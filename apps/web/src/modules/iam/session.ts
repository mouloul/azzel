import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE_NAME } from './constants';
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
