import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  CONNEXION_VOLONTAIRE_PATH,
  ROLE_VOLONTAIRE,
  SESSION_COOKIE_NAME,
  VOLONTAIRES_HOME_PATH,
  type AccountRole,
} from './constants';
import { DbUnavailableError } from './errors';
import { getSession } from './service';
import type { SessionRecord } from './store';

// Story 6.1 — l'app native ne peut pas porter de cookie httpOnly : elle
// présente le même jeton de session en `Authorization: Bearer <token>`.
// Même lookup hashé, même sémantique de session (TTL 30 j, révocation AD-5) ;
// le Bearer PRIME sur le cookie (un client natif n'en pose jamais).

/**
 * Extrait le jeton d'un en-tête `Authorization`. Schéma insensible à la casse
 * (RFC 7235), un seul argument non vide — tout le reste est ignoré (null).
 */
export function readBearerToken(authorization: string | null | undefined): string | null {
  if (typeof authorization !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match ? (match[1] as string) : null;
}

/** Jeton de session d'une requête API : Bearer d'abord, cookie ensuite. */
export function sessionTokenFromRequest(request: {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}): string | null {
  return (
    readBearerToken(request.headers.get('authorization')) ??
    request.cookies.get(SESSION_COOKIE_NAME)?.value ??
    null
  );
}

export type RequireSessionResult =
  | { status: 'authenticated'; session: SessionRecord }
  | { status: 'db-unavailable' };

export async function requireSession(): Promise<RequireSessionResult> {
  const bearer = readBearerToken((await headers()).get('authorization'));
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE_NAME)?.value;
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
  | { status: 'forbidden'; session: SessionRecord };

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
    // La session accompagne le refus : requireRolePage redirige un volontaire
    // vers SON espace au lieu de l'espace coureur (story 3.1).
    return { status: 'forbidden', session };
  }
  return { status: 'authenticated', session };
}

export async function requireRolePage(required: AccountRole): Promise<RequireSessionResult> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const result = await requireRole(required, token);
  if (result.status === 'unauthenticated') {
    redirect(required === ROLE_VOLONTAIRE ? CONNEXION_VOLONTAIRE_PATH : '/connexion');
  }
  if (result.status === 'forbidden') {
    redirect(result.session.role === ROLE_VOLONTAIRE ? VOLONTAIRES_HOME_PATH : '/espace-coureur');
  }
  return result;
}
