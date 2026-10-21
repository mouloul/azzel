import postgres, { type Sql } from 'postgres';

import {
  CODE_REQUEST_GLOBAL_WINDOW_MS,
  CODE_REQUEST_WINDOW_MS,
  DEFAULT_ORGANISATION_SLUG,
  MAX_CODE_ATTEMPTS,
  MAX_CODE_REQUESTS_PER_HOUR,
  MAX_CODE_REQUESTS_PER_WINDOW,
} from './constants';
import { readDatabaseUrl } from './env';
import { DbUnavailableError, RateLimitedError } from './errors';

export type VerifyOutcome =
  | { ok: true; accountId: string; organisationId: string; email: string }
  | { ok: false; reason: 'code_invalid' | 'code_exhausted' };

export interface SessionRecord {
  accountId: string;
  organisationId: string;
  email: string;
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
        const rows = await sql<{ id: string }[]>`
          SELECT id FROM organisation WHERE slug = ${DEFAULT_ORGANISATION_SLUG} LIMIT 1
        `;
        const row = rows[0];
        if (!row) {
          throw new Error(
            `Organisation « ${DEFAULT_ORGANISATION_SLUG} » absente : exécute pnpm -F @azzel/web db:migrate`,
          );
        }
        return row.id;
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
      await withDb(() =>
        sql.begin(async (tx) => {
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
    }): Promise<VerifyOutcome> {
      return withDb(() =>
        sql.begin<VerifyOutcome>(async (tx) => {
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
          const accountRows = await tx<{ id: string }[]>`
            INSERT INTO account (organisation_id, email, last_login_at)
            VALUES (${code.organisation_id}, ${input.email}, now())
            ON CONFLICT (organisation_id, email)
            DO UPDATE SET last_login_at = now()
            RETURNING id
          `;
          const account = accountRows[0];
          if (!account) {
            throw new Error('find-or-create du compte sans résultat');
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
          };
        }),
      );
    },

    async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      return withDb(async () => {
        const rows = await sql<{
          account_id: string;
          organisation_id: string;
          email: string;
          created_at: Date;
        }[]>`
          SELECT s.account_id, s.organisation_id, a.email, s.created_at
          FROM session s
          JOIN account a ON a.id = s.account_id
          WHERE s.token_hash = ${tokenHash}
            AND s.revoked_at IS NULL
            AND s.expires_at > now()
          LIMIT 1
        `;
        const row = rows[0];
        if (!row) {
          return null;
        }
        return {
          accountId: row.account_id,
          organisationId: row.organisation_id,
          email: row.email,
          createdAt: row.created_at,
        };
      });
    },

    async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
      await withDb(async () => {
        await sql`UPDATE session SET revoked_at = now() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
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

export function getIamStore(): IamStore {
  const globals = globalThis as typeof globalThis & { __azzelIamStore?: IamStore };
  if (globals.__azzelIamStore) {
    return globals.__azzelIamStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createIamStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelIamStore = store;
  return store;
}
