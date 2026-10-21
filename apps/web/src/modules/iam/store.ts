import postgres, { type Sql } from 'postgres';

import {
  findOrganisationIdBySlug,
  withOrg,
} from '@/db/org-scope';

import {
  CODE_REQUEST_GLOBAL_WINDOW_MS,
  CODE_REQUEST_WINDOW_MS,
  DEFAULT_ORGANISATION_SLUG,
  MAX_CODE_ATTEMPTS,
  MAX_CODE_REQUESTS_PER_HOUR,
  MAX_CODE_REQUESTS_PER_WINDOW,
  type AccountRole,
} from './constants';
import { readDatabaseUrl } from './env';
import { DbUnavailableError, RateLimitedError } from './errors';

export type VerifyOutcome =
  | { ok: true; accountId: string; organisationId: string; email: string; role: AccountRole }
  | { ok: false; reason: 'code_invalid' | 'code_exhausted' };

export interface SessionRecord {
  accountId: string;
  organisationId: string;
  email: string;
  role: AccountRole;
  createdAt: Date;
}

export interface IamStore {
  getDefaultOrganisationId(): Promise<string>;
  insertLoginCode(input: {
    organisationId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
    perEmailCutoff: Date;
    hourlyCutoff: Date;
  }): Promise<void>;
  verifyCodeAndStartSession(input: {
    email: string;
    codeHash: string;
    tokenHash: string;
    sessionExpiresAt: Date;
    adminEmails: string[];
  }): Promise<VerifyOutcome>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSessionByTokenHash(tokenHash: string): Promise<void>;
}

interface LoginCodeRow {
  id: string;
  organisation_id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

const CONNECTION_ERROR_PATTERN =
  /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|connection terminated|database system is starting|database system is shut down/i;

function isConnectionError(error: unknown): boolean {
  if (error instanceof DbUnavailableError) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) {
      return true;
    }
  }
  return error instanceof Error && CONNECTION_ERROR_PATTERN.test(error.message);
}

async function withDb<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isConnectionError(error)) {
      throw new DbUnavailableError(error);
    }
    throw error;
  }
}

function retryAfterSec(oldestAt: Date | null, windowMs: number): number {
  const oldestMs = oldestAt?.getTime() ?? Date.now();
  return Math.max(1, Math.ceil((oldestMs + windowMs - Date.now()) / 1000));
}

export function createIamStore(sql: Sql): IamStore {
  return {
    async getDefaultOrganisationId(): Promise<string> {
      return withDb(async () => {
        // Lecture publique par slug, sans GUC — exception documentée (spec 1.9) :
        // résolution de l'organisation par défaut pour les flows pré-session.
        const id = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
        if (!id) {
          throw new Error(
            `Organisation « ${DEFAULT_ORGANISATION_SLUG} » absente : exécute pnpm -F @azzel/web db:migrate`,
          );
        }
        return id;
      });
    },

    async insertLoginCode(input: {
      organisationId: string;
      email: string;
      codeHash: string;
      expiresAt: Date;
      perEmailCutoff: Date;
      hourlyCutoff: Date;
    }): Promise<void> {
      // Flow pré-session : GUC = organisation du code (l'org par défaut en V1).
      await withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${input.email}))`;
          const perEmailRows = await tx<{ count: number; oldest: Date | null }[]>`
            SELECT count(*)::int AS count, min(created_at) AS oldest
            FROM login_code
            WHERE email = ${input.email} AND created_at > ${input.perEmailCutoff}
          `;
          const perEmail = perEmailRows[0];
          if ((perEmail?.count ?? 0) >= MAX_CODE_REQUESTS_PER_WINDOW) {
            throw new RateLimitedError(
              retryAfterSec(perEmail?.oldest ?? null, CODE_REQUEST_WINDOW_MS),
            );
          }
          const hourlyRows = await tx<{ count: number; oldest: Date | null }[]>`
            SELECT count(*)::int AS count, min(created_at) AS oldest
            FROM login_code
            WHERE created_at > ${input.hourlyCutoff}
          `;
          const hourly = hourlyRows[0];
          if ((hourly?.count ?? 0) >= MAX_CODE_REQUESTS_PER_HOUR) {
            throw new RateLimitedError(
              retryAfterSec(hourly?.oldest ?? null, CODE_REQUEST_GLOBAL_WINDOW_MS),
            );
          }
          await tx`
            UPDATE login_code
            SET invalidated_at = now()
            WHERE email = ${input.email}
              AND consumed_at IS NULL
              AND invalidated_at IS NULL
          `;
          await tx`
            INSERT INTO login_code (organisation_id, email, code_hash, expires_at)
            VALUES (${input.organisationId}, ${input.email}, ${input.codeHash}, ${input.expiresAt})
          `;
        }),
      );
    },

    async verifyCodeAndStartSession(input: {
      email: string;
      codeHash: string;
      tokenHash: string;
      sessionExpiresAt: Date;
      adminEmails: string[];
    }): Promise<VerifyOutcome> {
      return withDb(async () => {
        // Multi-org : le code est cherché par email (politique permissive, secret
        // d'abord) SANS GUC par défaut — c'est l'organisation de la ligne
        // login_code qui gouverne compte et session. La re-lecture sous verrou
        // (FOR UPDATE) dans la transaction withOrg garde la consommation atomique.
        const codeRows = await sql<{ organisation_id: string }[]>`
          SELECT organisation_id FROM login_code
          WHERE email = ${input.email}
            AND consumed_at IS NULL
            AND invalidated_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `;
        const codeOrganisationId = codeRows[0]?.organisation_id;
        if (!codeOrganisationId) {
          return { ok: false, reason: 'code_invalid' as const };
        }
        return withOrg(sql, codeOrganisationId, async (tx) => {
          const rows = await tx<LoginCodeRow[]>`
            SELECT id, organisation_id, code_hash, attempts, expires_at
            FROM login_code
            WHERE email = ${input.email}
              AND consumed_at IS NULL
              AND invalidated_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
          `;
          const code = rows[0];
          if (!code) {
            return { ok: false, reason: 'code_invalid' as const };
          }
          if (code.expires_at.getTime() <= Date.now()) {
            return { ok: false, reason: 'code_invalid' as const };
          }
          if (code.code_hash !== input.codeHash) {
            const attempts = code.attempts + 1;
            if (attempts >= MAX_CODE_ATTEMPTS) {
              await tx`
                UPDATE login_code
                SET attempts = ${attempts}, invalidated_at = now()
                WHERE id = ${code.id}
              `;
              return { ok: false, reason: 'code_exhausted' as const };
            }
            await tx`UPDATE login_code SET attempts = ${attempts} WHERE id = ${code.id}`;
            return { ok: false, reason: 'code_invalid' as const };
          }
          await tx`UPDATE login_code SET consumed_at = now() WHERE id = ${code.id}`;
          const accountRows = await tx<{ id: string; role: AccountRole }[]>`
            INSERT INTO account (organisation_id, email, last_login_at)
            VALUES (${code.organisation_id}, ${input.email}, now())
            ON CONFLICT (organisation_id, email)
            DO UPDATE SET last_login_at = now()
            RETURNING id, role
          `;
          const account = accountRows[0];
          if (!account) {
            throw new Error('find-or-create du compte sans résultat');
          }
          let role: AccountRole = account.role;
          if (input.adminEmails.includes(input.email)) {
            const promotedRows = await tx<{ role: AccountRole }[]>`
              UPDATE account SET role = 'organisateur'
              WHERE id = ${account.id} AND role <> 'organisateur'
              RETURNING role
            `;
            const promoted = promotedRows[0];
            if (promoted) {
              role = promoted.role;
            }
          }
          await tx`
            UPDATE session
            SET revoked_at = now()
            WHERE account_id = ${account.id} AND revoked_at IS NULL
          `;
          await tx`
            INSERT INTO session (organisation_id, account_id, token_hash, expires_at)
            VALUES (${code.organisation_id}, ${account.id}, ${input.tokenHash}, ${input.sessionExpiresAt})
          `;
          return {
            ok: true as const,
            accountId: account.id,
            organisationId: code.organisation_id,
            email: input.email,
            role,
          };
        });
      });
    },

    async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      return withDb(async () => {
        // Exception documentée (spec 1.9) : la session est cherchée par secret
        // avant que l'organisation soit connue — politique SELECT permissive.
        const rows = await sql<
          { account_id: string; organisation_id: string; created_at: Date }[]
        >`
          SELECT account_id, organisation_id, created_at
          FROM session
          WHERE token_hash = ${tokenHash}
            AND revoked_at IS NULL
            AND expires_at > now()
          LIMIT 1
        `;
        const core = rows[0];
        if (!core) {
          return null;
        }
        // Le compte (et son rôle) sont isolés par organisation : GUC = org de la session.
        return withOrg(sql, core.organisation_id, async (tx) => {
          const accounts = await tx<{ email: string; role: AccountRole }[]>`
            SELECT email, role FROM account WHERE id = ${core.account_id} LIMIT 1
          `;
          const account = accounts[0];
          if (!account) {
            return null;
          }
          return {
            accountId: core.account_id,
            organisationId: core.organisation_id,
            email: account.email,
            role: account.role,
            createdAt: core.created_at,
          };
        });
      });
    },

    async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
      await withDb(async () => {
        // Même exception documentée : secret d'abord, organisation ensuite.
        const rows = await sql<{ organisation_id: string }[]>`
          SELECT organisation_id FROM session
          WHERE token_hash = ${tokenHash}
            AND revoked_at IS NULL
            AND expires_at > now()
          LIMIT 1
        `;
        const core = rows[0];
        if (!core) {
          return;
        }
        await withOrg(sql, core.organisation_id, async (tx) => {
          // Re-vérifié DANS la transaction (UPDATE atomique conditionnel) : une
          // session révoquée ou expirée entre les deux étapes n'est plus acceptée.
          await tx`
            UPDATE session SET revoked_at = now()
            WHERE token_hash = ${tokenHash}
              AND revoked_at IS NULL
              AND expires_at > now()
          `;
        });
      });
    },
  };
}

function createUnavailableStore(): IamStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    getDefaultOrganisationId: unavailable,
    insertLoginCode: unavailable,
    verifyCodeAndStartSession: unavailable,
    findSessionByTokenHash: unavailable,
    revokeSessionByTokenHash: unavailable,
  };
}

// Story 1.9 : au premier accès applicatif, signaler une connexion qui ne serait
// pas en rôle azzel_app — sinon le RLS serait contourné en silence (owner/superuser).
function warnIfNotAppRole(sql: Sql): void {
  const globals = globalThis as typeof globalThis & { __azzelAppRoleWarned?: boolean };
  if (globals.__azzelAppRoleWarned) {
    return;
  }
  globals.__azzelAppRoleWarned = true;
  void sql<{ current_user: string }[]>`SELECT current_user`
    .then((rows) => {
      const currentUser = rows[0]?.current_user;
      if (currentUser && currentUser !== 'azzel_app') {
        console.warn(
          `[db] connexion applicative en rôle « ${currentUser} » (attendu « azzel_app ») : le RLS est contourné — DATABASE_URL doit pointer sur le rôle applicatif (story 1.9).`,
        );
      }
    })
    .catch(() => {});
}

export function getIamStore(): IamStore {
  const globals = globalThis as typeof globalThis & { __azzelIamStore?: IamStore };
  if (globals.__azzelIamStore) {
    return globals.__azzelIamStore;
  }
  const databaseUrl = readDatabaseUrl();
  let store: IamStore;
  if (databaseUrl) {
    const sql = postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 });
    warnIfNotAppRole(sql);
    store = createIamStore(sql);
  } else {
    store = createUnavailableStore();
  }
  globals.__azzelIamStore = store;
  return store;
}
