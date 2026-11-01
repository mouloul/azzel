import type { Sql } from 'postgres';

import { getDbClient } from '@/db/client';

import {
  findOrganisationIdBySlug,
  withOrg,
} from '@/db/org-scope';

import {
  APP_DB_ROLE,
  CODE_REQUEST_GLOBAL_WINDOW_MS,
  CODE_REQUEST_IP_WINDOW_MS,
  CODE_REQUEST_WINDOW_MS,
  DEFAULT_ORGANISATION_SLUG,
  MAX_CODE_ATTEMPTS,
  MAX_CODE_REQUESTS_PER_HOUR,
  MAX_CODE_REQUESTS_PER_IP,
  MAX_CODE_REQUESTS_PER_WINDOW,
  type AccountRole,
} from './constants';

import { readEnv } from './env';
import {
  AppRoleMisconfiguredError,
  DbUnavailableError,
  RateLimitedError,
} from './errors';

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
  /**
   * Quota par adresse IP de la demande de code (fenêtre glissante). Enregistre la
   * demande si le seuil n'est pas atteint, lève RateLimitedError sinon.
   */
  recordCodeRequestIp(input: { ipHash: string; cutoff: Date }): Promise<void>;
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

async function wrapDbErrors<T>(run: () => Promise<T>): Promise<T> {
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

export interface CreateIamStoreOptions {
  /**
   * Garde story 1.9 : vérifie une fois que la connexion est bien le rôle
   * applicatif. Appelée avant CHAQUE accès base — en production elle rejette
   * (AppRoleMisconfiguredError) et l'application ne sert pas.
   */
  ensureAppRole?: () => Promise<void>;
}

export function createIamStore(sql: Sql, options: CreateIamStoreOptions = {}): IamStore {
  const { ensureAppRole } = options;
  const withDb = <T>(run: () => Promise<T>): Promise<T> =>
    wrapDbErrors(async () => {
      if (ensureAppRole) {
        await ensureAppRole();
      }
      return run();
    });

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

    async recordCodeRequestIp(input: { ipHash: string; cutoff: Date }): Promise<void> {
      // Hors withOrg : le quota par IP s'applique AVANT que l'organisation soit
      // résolue, et vaut pour toutes (table sans organisation_id, cf. 0011).
      await withDb(() =>
        sql.begin(async (tx) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${`ip:${input.ipHash}`}))`;
          const rows = await tx<{ count: number; oldest: Date | null }[]>`
            SELECT count(*)::int AS count, min(created_at) AS oldest
            FROM login_code_ip_request
            WHERE ip_hash = ${input.ipHash} AND created_at > ${input.cutoff}
          `;
          const row = rows[0];
          if ((row?.count ?? 0) >= MAX_CODE_REQUESTS_PER_IP) {
            throw new RateLimitedError(
              retryAfterSec(row?.oldest ?? null, CODE_REQUEST_IP_WINDOW_MS),
            );
          }
          // Purge au fil de l'eau (pas de tâche planifiée en V1), bornée à
          // CETTE IP : un DELETE global s'exécutait sous un verrou consultatif
          // par IP, donc deux demandes concurrentes se disputaient les mêmes
          // lignes (contention, interblocage 40P01 possible) et balayaient
          // toute la table à chaque demande de code.
          await tx`
            DELETE FROM login_code_ip_request
            WHERE ip_hash = ${input.ipHash} AND created_at <= ${input.cutoff}
          `;
          await tx`INSERT INTO login_code_ip_request (ip_hash) VALUES (${input.ipHash})`;
        }),
      );
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
            WHERE organisation_id = ${input.organisationId}
              AND email = ${input.email}
              AND created_at > ${input.perEmailCutoff}
          `;
          const perEmail = perEmailRows[0];
          if ((perEmail?.count ?? 0) >= MAX_CODE_REQUESTS_PER_WINDOW) {
            throw new RateLimitedError(
              retryAfterSec(perEmail?.oldest ?? null, CODE_REQUEST_WINDOW_MS),
            );
          }
          // Garde-fou de volumétrie SCOPÉ À L'ORGANISATION : un compteur global
          // laissait 1000 demandes avec des adresses différentes bloquer la
          // connexion de tout le monde. La protection contre l'auteur d'un tel
          // flot est le quota par IP (recordCodeRequestIp), pas ce compteur.
          const hourlyRows = await tx<{ count: number; oldest: Date | null }[]>`
            SELECT count(*)::int AS count, min(created_at) AS oldest
            FROM login_code
            WHERE organisation_id = ${input.organisationId}
              AND created_at > ${input.hourlyCutoff}
          `;
          const hourly = hourlyRows[0];
          if ((hourly?.count ?? 0) >= MAX_CODE_REQUESTS_PER_HOUR) {
            throw new RateLimitedError(
              retryAfterSec(hourly?.oldest ?? null, CODE_REQUEST_GLOBAL_WINDOW_MS),
            );
          }
          // organisation_id explicite (défense en profondeur, en plus du RLS de
          // 0011) : sans lui, demander un code dans l'organisation B invalidait
          // le code en cours de la même adresse dans l'organisation A.
          await tx`
            UPDATE login_code
            SET invalidated_at = now()
            WHERE organisation_id = ${input.organisationId}
              AND email = ${input.email}
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
        // Multi-org : la PRÉ-SÉLECTION se fait hors GUC (exception documentée
        // spec 1.9) — l'organisation n'est pas connue avant d'avoir trouvé la
        // ligne. Elle ne sert qu'à déterminer l'organisation ; tout le reste
        // (vérification du hash, compteur de tentatives, consommation, session)
        // se passe sous withOrg AVEC un filtre organisation_id explicite.
        //
        // Limite assumée : une même adresse ayant un code en cours dans DEUX
        // organisations voit la plus récente l'emporter — les deux codes ne
        // coexistent pas pour la vérification. Lever cette limite demanderait de
        // qualifier la requête par organisation (slug ou domaine), ce que la V1
        // ne fait pas. Ce n'est pas une fuite : le hash doit correspondre à la
        // ligne choisie, donc un code ne peut pas ouvrir de session ailleurs que
        // dans son organisation d'origine.
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
            WHERE organisation_id = ${codeOrganisationId}
              AND email = ${input.email}
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
            INSERT INTO account (organisation_id, email, last_login_at, activated_at)
            VALUES (${code.organisation_id}, ${input.email}, now(), now())
            ON CONFLICT (organisation_id, email)
            DO UPDATE SET last_login_at = now(),
                          activated_at = COALESCE(account.activated_at, now())
            RETURNING id, role
          `;
          // Story 3.1 (connexion code unifiée) : connexion par code pour TOUS les
          // rôles — le rôle est lu sur le compte. activated_at = première
          // connexion réussie, jamais réécrit (COALESCE) : la liste admin des
          // volontaires en dérive le statut « Activé ».
          const account = accountRows[0];
          if (!account) {
            throw new Error('find-or-create du compte sans résultat');
          }
          let role: AccountRole = account.role;
          // Rôle unique : un compte volontaire n'est JAMAIS promu organisateur,
          // même si son email est ajouté à AZZEL_ADMIN_EMAILS après l'import.
          if (account.role !== 'volontaire' && input.adminEmails.includes(input.email)) {
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
            WHERE organisation_id = ${code.organisation_id}
              AND account_id = ${account.id}
              AND revoked_at IS NULL
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
            WHERE organisation_id = ${core.organisation_id}
              AND token_hash = ${tokenHash}
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
    recordCodeRequestIp: unavailable,
    insertLoginCode: unavailable,
    verifyCodeAndStartSession: unavailable,
    findSessionByTokenHash: unavailable,
    revokeSessionByTokenHash: unavailable,
  };
}

export function isProductionRuntime(): boolean {
  return readEnv('NODE_ENV') === 'production';
}

/**
 * Story 1.9 : la connexion applicative DOIT être le rôle azzel_app — le
 * propriétaire a BYPASSRLS, donc tout l'isolement multi-organisation tomberait
 * en silence. En production on refuse de servir (erreur à chaque accès, pas un
 * simple avertissement) ; en développement on conserve l'avertissement.
 *
 * Le verdict est mémorisé : un seul `SELECT current_user` par connexion. Une
 * panne de connexion n'est PAS mémorisée (nouvelle tentative au prochain accès).
 */
export function createAppRoleGuard(
  sql: Sql,
  options: { production: boolean },
): () => Promise<void> {
  let verdict: Promise<void> | null = null;
  const check = async (): Promise<void> => {
    const rows = await sql<{ current_user: string }[]>`SELECT current_user`;
    const currentUser = rows[0]?.current_user ?? 'inconnu';
    if (currentUser === APP_DB_ROLE) {
      return;
    }
    const message =
      `[db] connexion applicative en rôle « ${currentUser} » (attendu « ${APP_DB_ROLE} ») : ` +
      'le RLS est contourné — DATABASE_URL doit pointer sur le rôle applicatif (story 1.9).';
    if (options.production) {
      console.error(message);
      throw new AppRoleMisconfiguredError(currentUser);
    }
    console.warn(message);
  };
  return async () => {
    verdict ??= check();
    try {
      await verdict;
    } catch (error) {
      if (!(error instanceof AppRoleMisconfiguredError)) {
        verdict = null;
      }
      throw error;
    }
  };
}

export function getIamStore(): IamStore {
  const globals = globalThis as typeof globalThis & { __azzelIamStore?: IamStore };
  if (globals.__azzelIamStore) {
    return globals.__azzelIamStore;
  }
  // Pool applicatif partagé — voir `@/db/client`.
  const sql = getDbClient();
  let store: IamStore;
  if (sql !== null) {
    store = createIamStore(sql, {
      ensureAppRole: createAppRoleGuard(sql, { production: isProductionRuntime() }),
    });
  } else {
    store = createUnavailableStore();
  }
  globals.__azzelIamStore = store;
  return store;
}
