import { createHash, randomBytes, randomInt } from 'node:crypto';

import {
  CODE_REQUEST_GLOBAL_WINDOW_MS,
  CODE_REQUEST_WINDOW_MS,
  CODE_TTL_MS,
  SESSION_TTL_SEC,
} from './constants';
import { sendLoginCodeEmail } from './email';
import { CodeExhaustedError, EmailInvalidError, InvalidCodeError } from './errors';
import { getIamStore, type IamStore, type SessionRecord } from './store';

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeLoginCode(rawCode: string): string | null {
  const digits = rawCode.replace(/\D+/g, '');
  return digits.length === 6 ? digits : null;
}

export type SendCodeFn = (email: string, code: string) => Promise<void>;

export interface IamServiceDeps {
  store?: IamStore;
  sendCode?: SendCodeFn;
}

export async function requestLoginCode(
  rawEmail: string,
  deps: IamServiceDeps = {},
): Promise<void> {
  const store = deps.store ?? getIamStore();
  const sendCode = deps.sendCode ?? sendLoginCodeEmail;
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new EmailInvalidError();
  }
  const organisationId = await store.getDefaultOrganisationId();
  const code = generateLoginCode();
  const now = Date.now();
  await store.insertLoginCode({
    organisationId,
    email,
    codeHash: sha256Hex(code),
    expiresAt: new Date(now + CODE_TTL_MS),
    perEmailCutoff: new Date(now - CODE_REQUEST_WINDOW_MS),
    hourlyCutoff: new Date(now - CODE_REQUEST_GLOBAL_WINDOW_MS),
  });
  await sendCode(email, code);
}

export interface LoginSession {
  token: string;
  email: string;
}

export async function verifyLoginCode(
  rawEmail: string,
  rawCode: string,
  deps: IamServiceDeps = {},
): Promise<LoginSession> {
  const store = deps.store ?? getIamStore();
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new EmailInvalidError();
  }
  const code = normalizeLoginCode(rawCode);
  if (!code) {
    throw new InvalidCodeError();
  }
  const token = randomBytes(32).toString('base64url');
  const outcome = await store.verifyCodeAndStartSession({
    email,
    codeHash: sha256Hex(code),
    tokenHash: sha256Hex(token),
    sessionExpiresAt: new Date(Date.now() + SESSION_TTL_SEC * 1000),
  });
  if (!outcome.ok) {
    if (outcome.reason === 'code_exhausted') {
      throw new CodeExhaustedError();
    }
    throw new InvalidCodeError();
  }
  return { token, email: outcome.email };
}

export async function getSession(
  token: string,
  deps: IamServiceDeps = {},
): Promise<SessionRecord | null> {
  const store = deps.store ?? getIamStore();
  return store.findSessionByTokenHash(sha256Hex(token));
}

export async function logout(token: string, deps: IamServiceDeps = {}): Promise<void> {
  const store = deps.store ?? getIamStore();
  await store.revokeSessionByTokenHash(sha256Hex(token));
}
