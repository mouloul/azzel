import { createHash, randomBytes, randomInt } from 'node:crypto';

import {
  CODE_REQUEST_GLOBAL_WINDOW_MS,
  CODE_REQUEST_IP_WINDOW_MS,
  CODE_REQUEST_WINDOW_MS,
  CODE_TTL_MS,
  IP_HASH_SALT_ENV_NAME,
  SESSION_TTL_SEC,
  type AccountRole,
} from './constants';
import { sendLoginCodeEmail } from './email';
import { readAdminEmails, readEnv } from './env';
import {
  CodeExhaustedError,
  EmailInvalidError,
  InvalidCodeError,
  IpHashSaltMissingError,
} from './errors';
import {
  getIamStore,
  isProductionRuntime,
  type IamStore,
  type SessionRecord,
} from './store';

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

/**
 * Empreinte salée de l'adresse IP : on ne stocke jamais l'IP en clair pour un
 * simple compteur anti-abus. En PRODUCTION, l'absence de AZZEL_IP_HASH_SALT est
 * refusée — même traitement que le rôle Postgres (story 1.9) : sans sel propre,
 * l'espace des IPv4 est énumérable par force brute, et un sel public ne protège
 * rien. En développement, un sel fixe suffit.
 */
export function hashClientIp(clientIp: string): string {
  const salt = readEnv(IP_HASH_SALT_ENV_NAME);
  if (!salt) {
    if (isProductionRuntime()) {
      throw new IpHashSaltMissingError();
    }
    return sha256Hex(`azzel-ip:${clientIp}`);
  }
  return sha256Hex(`${salt}:${clientIp}`);
}

export interface RequestContext {
  /** IP de l'appelant, extraite par la route. Absente → pas de quota par IP. */
  clientIp?: string | null;
}

export async function requestLoginCode(
  rawEmail: string,
  deps: IamServiceDeps = {},
  context: RequestContext = {},
): Promise<void> {
  const store = deps.store ?? getIamStore();
  const sendCode = deps.sendCode ?? sendLoginCodeEmail;
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new EmailInvalidError();
  }
  // Quota par IP AVANT toute écriture liée à l'email : c'est ce qui empêche un
  // seul auteur de saturer le quota horaire de l'organisation avec des adresses
  // email différentes (déni de service de la connexion).
  const clientIp = context.clientIp?.trim();
  if (clientIp) {
    await store.recordCodeRequestIp({
      ipHash: hashClientIp(clientIp),
      cutoff: new Date(Date.now() - CODE_REQUEST_IP_WINDOW_MS),
    });
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
  /** Rôle du compte : décide de l'espace où la connexion aboutit. */
  role: AccountRole;
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
    adminEmails: readAdminEmails(),
  });
  if (!outcome.ok) {
    if (outcome.reason === 'code_exhausted') {
      throw new CodeExhaustedError();
    }
    throw new InvalidCodeError();
  }
  return { token, email: outcome.email, role: outcome.role };
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
