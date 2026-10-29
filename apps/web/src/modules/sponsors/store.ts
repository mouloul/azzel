import postgres, { type Sql } from 'postgres';

import { protegerStore } from '@/db/app-role';
import { isProductionRuntime } from '@/modules/iam/store';

import { findOrganisationIdBySlug, withOrg } from '@/db/org-scope';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { readDatabaseUrl } from '@/modules/iam/env';
import { DbUnavailableError } from '@/modules/iam/errors';

import { DEFAULT_SPONSOR_MODE, MAX_SPONSORS_PAR_ORG, type SponsorMode } from './domain';
import {
  SponsorSignatureConflictError,
  SponsorsLimitError,
} from './errors';

export interface SponsorRecord {
  id: string;
  organisationId: string;
  name: string;
  url: string | null;
  logoUrl: string | null;
  isSignature: boolean;
  createdAt: Date;
}

export interface SponsorsConfigRecord {
  organisationId: string;
  mode: SponsorMode;
  updatedAt: Date;
}

export interface SaveSponsorInput {
  organisationId: string;
  name: string;
  url: string | null;
  logoUrl: string | null;
  isSignature: boolean;
}

export interface SponsorsStore {
  listSponsors(organisationId: string): Promise<SponsorRecord[]>;
  findSponsorById(sponsorId: string, organisationId: string): Promise<SponsorRecord | null>;
  createSponsor(input: SaveSponsorInput): Promise<SponsorRecord>;
  updateSponsor(sponsorId: string, input: SaveSponsorInput): Promise<SponsorRecord | null>;
  deleteSponsor(sponsorId: string, organisationId: string): Promise<boolean>;
  findConfig(organisationId: string): Promise<SponsorsConfigRecord | null>;
  setConfig(input: { organisationId: string; mode: SponsorMode }): Promise<SponsorsConfigRecord>;
  /** Lecture publique de la vitrine : organisation par défaut, sans session. */
  readDefaultOrgPartenaires(): Promise<{ mode: SponsorMode; sponsors: SponsorRecord[] }>;
}

interface SponsorRow {
  id: string;
  organisation_id: string;
  name: string;
  url: string | null;
  logo_url: string | null;
  is_signature: boolean;
  created_at: Date;
}

const SPONSOR_COLUMNS = 'id, organisation_id, name, url, logo_url, is_signature, created_at';

function toSponsorRecord(row: SponsorRow): SponsorRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    url: row.url,
    logoUrl: row.logo_url,
    isSignature: row.is_signature,
    createdAt: row.created_at,
  };
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

// Violation de l'index unique partiel sponsor_signature_unique (course
// concurrente entre deux mises en signature) : refus propre, pas un 500.
function estViolationSignatureUnique(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidat = error as { code?: unknown; constraint?: unknown };
  return (
    candidat.code === '23505' &&
    String(candidat.constraint ?? '').includes('sponsor_signature_unique')
  );
}

export function createSponsorsStore(sql: Sql): SponsorsStore {
  return {
    async listSponsors(organisationId: string): Promise<SponsorRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<SponsorRow[]>`
            SELECT ${tx.unsafe(SPONSOR_COLUMNS)}
            FROM sponsor
            WHERE organisation_id = ${organisationId}
            ORDER BY created_at ASC, id ASC
          `;
          return rows.map(toSponsorRecord);
        }),
      );
    },

    async findSponsorById(
      sponsorId: string,
      organisationId: string,
    ): Promise<SponsorRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<SponsorRow[]>`
            SELECT ${tx.unsafe(SPONSOR_COLUMNS)}
            FROM sponsor
            WHERE id = ${sponsorId} AND organisation_id = ${organisationId}
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toSponsorRecord(row) : null;
        }),
      );
    },

    async createSponsor(input: SaveSponsorInput): Promise<SponsorRecord> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Verrou consultatif transactionnel (même pattern que createTemoignage) :
          // sérialise le couple count + insert par organisation. Sans lui, deux
          // créations concurrentes à 19 sponsors franchissaient toutes les deux
          // MAX_SPONSORS_PAR_ORG. Clé préfixée : ne bloque pas les témoignages.
          await tx`SELECT pg_advisory_xact_lock(hashtext(${`sponsor:${input.organisationId}`}))`;
          const counts = await tx<{ count: number }[]>`
            SELECT count(*)::int AS count FROM sponsor
            WHERE organisation_id = ${input.organisationId}
          `;
          if ((counts[0]?.count ?? 0) >= MAX_SPONSORS_PAR_ORG) {
            throw new SponsorsLimitError(MAX_SPONSORS_PAR_ORG);
          }
          if (input.isSignature) {
            await tx`
              UPDATE sponsor SET is_signature = false
              WHERE organisation_id = ${input.organisationId} AND is_signature
            `;
          }
          let rows: SponsorRow[];
          try {
            rows = await tx<SponsorRow[]>`
              INSERT INTO sponsor (organisation_id, name, url, logo_url, is_signature)
              VALUES (${input.organisationId}, ${input.name}, ${input.url}, ${input.logoUrl},
                      ${input.isSignature})
              RETURNING ${tx.unsafe(SPONSOR_COLUMNS)}
            `;
          } catch (error) {
            if (estViolationSignatureUnique(error)) {
              throw new SponsorSignatureConflictError();
            }
            throw error;
          }
          const row = rows[0];
          if (!row) {
            throw new Error('insertion du sponsor impossible');
          }
          return toSponsorRecord(row);
        }),
      );
    },

    async updateSponsor(
      sponsorId: string,
      input: SaveSponsorInput,
    ): Promise<SponsorRecord | null> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          if (input.isSignature) {
            await tx`
              UPDATE sponsor SET is_signature = false
              WHERE organisation_id = ${input.organisationId} AND is_signature AND id <> ${sponsorId}
            `;
          }
          let rows: SponsorRow[];
          try {
            rows = await tx<SponsorRow[]>`
              UPDATE sponsor SET
                name = ${input.name},
                url = ${input.url},
                logo_url = ${input.logoUrl},
                is_signature = ${input.isSignature}
              WHERE id = ${sponsorId} AND organisation_id = ${input.organisationId}
              RETURNING ${tx.unsafe(SPONSOR_COLUMNS)}
            `;
          } catch (error) {
            if (estViolationSignatureUnique(error)) {
              throw new SponsorSignatureConflictError();
            }
            throw error;
          }
          const row = rows[0];
          return row ? toSponsorRecord(row) : null;
        }),
      );
    },

    async deleteSponsor(sponsorId: string, organisationId: string): Promise<boolean> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ id: string }[]>`
            DELETE FROM sponsor
            WHERE id = ${sponsorId} AND organisation_id = ${organisationId}
            RETURNING id
          `;
          return rows.length > 0;
        }),
      );
    },

    async findConfig(organisationId: string): Promise<SponsorsConfigRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{
            organisation_id: string;
            mode: SponsorMode;
            updated_at: Date;
          }[]>`
            SELECT organisation_id, mode, updated_at
            FROM vitrine_sponsors_config
            WHERE organisation_id = ${organisationId}
            LIMIT 1
          `;
          const row = rows[0];
          return row
            ? {
                organisationId: row.organisation_id,
                mode: row.mode,
                updatedAt: row.updated_at,
              }
            : null;
        }),
      );
    },

    async setConfig(input: {
      organisationId: string;
      mode: SponsorMode;
    }): Promise<SponsorsConfigRecord> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<{
            organisation_id: string;
            mode: SponsorMode;
            updated_at: Date;
          }[]>`
            INSERT INTO vitrine_sponsors_config (organisation_id, mode)
            VALUES (${input.organisationId}, ${input.mode})
            ON CONFLICT (organisation_id)
            DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()
            RETURNING organisation_id, mode, updated_at
          `;
          const row = rows[0];
          if (!row) {
            throw new Error('écriture de la configuration sponsors impossible');
          }
          return {
            organisationId: row.organisation_id,
            mode: row.mode,
            updatedAt: row.updated_at,
          };
        }),
      );
    },

    async readDefaultOrgPartenaires(): Promise<{
      mode: SponsorMode;
      sponsors: SponsorRecord[];
    }> {
      return withDb(async () => {
        // Lecture publique pré-session : résolution de l'organisation par défaut
        // hors GUC (exception documentée spec 1.9), puis lecture scopée.
        const organisationId = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
        if (!organisationId) {
          throw new Error(
            `Organisation « ${DEFAULT_ORGANISATION_SLUG} » absente : exécute pnpm -F @azzel/web db:migrate`,
          );
        }
        return withOrg(sql, organisationId, async (tx) => {
          const [configRows, sponsorRows] = await Promise.all([
            tx<{ mode: SponsorMode }[]>`
              SELECT mode FROM vitrine_sponsors_config
              WHERE organisation_id = ${organisationId}
              LIMIT 1
            `,
            tx<SponsorRow[]>`
              SELECT ${tx.unsafe(SPONSOR_COLUMNS)}
              FROM sponsor
              WHERE organisation_id = ${organisationId}
              ORDER BY created_at ASC, id ASC
            `,
          ]);
          return {
            mode: configRows[0]?.mode ?? DEFAULT_SPONSOR_MODE,
            sponsors: sponsorRows.map(toSponsorRecord),
          };
        });
      });
    },
  };
}

function createUnavailableStore(): SponsorsStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    listSponsors: unavailable,
    findSponsorById: unavailable,
    createSponsor: unavailable,
    updateSponsor: unavailable,
    deleteSponsor: unavailable,
    findConfig: unavailable,
    setConfig: unavailable,
    readDefaultOrgPartenaires: unavailable,
  };
}

export function getSponsorsStore(): SponsorsStore {
  const globals = globalThis as typeof globalThis & {
    __azzelSponsorsStore?: SponsorsStore;
  };
  if (globals.__azzelSponsorsStore) {
    return globals.__azzelSponsorsStore;
  }
  const databaseUrl = readDatabaseUrl();
  // Garde de rôle applicatif (story 1.9) : la connexion doit être le rôle
  // soumis au RLS, sur CE store comme sur celui de l'IAM.
  const sql = databaseUrl
    ? postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 })
    : null;
  const store =
    sql !== null
      ? protegerStore(sql, createSponsorsStore(sql), isProductionRuntime())
      : createUnavailableStore();
  globals.__azzelSponsorsStore = store;
  return store;
}
