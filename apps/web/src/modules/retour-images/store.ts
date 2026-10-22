import postgres, { type Sql } from 'postgres';

import { findOrganisationIdBySlug, withOrg } from '@/db/org-scope';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { readDatabaseUrl } from '@/modules/iam/env';
import { DbUnavailableError } from '@/modules/iam/errors';

import { MAX_TEMOIGNAGES_PAR_ORG } from './domain';
import { TemoignagesLimitError } from './errors';

export interface TemoignageRecord {
  id: string;
  organisationId: string;
  citation: string;
  prenom: string;
  editionReference: string;
  ordre: number;
  createdAt: Date;
}

export interface MediaConfigRecord {
  organisationId: string;
  trailerUrl: string | null;
  updatedAt: Date;
}

export interface SaveTemoignageInput {
  organisationId: string;
  citation: string;
  prenom: string;
  editionReference: string;
  /** null = placé en fin d'ordre (max + 1) au moment de la création. */
  ordre: number | null;
}

export interface RetourImagesStore {
  listTemoignages(organisationId: string): Promise<TemoignageRecord[]>;
  findTemoignageById(
    temoignageId: string,
    organisationId: string,
  ): Promise<TemoignageRecord | null>;
  createTemoignage(input: SaveTemoignageInput): Promise<TemoignageRecord>;
  updateTemoignage(
    temoignageId: string,
    input: SaveTemoignageInput,
  ): Promise<TemoignageRecord | null>;
  deleteTemoignage(temoignageId: string, organisationId: string): Promise<boolean>;
  findMediaConfig(organisationId: string): Promise<MediaConfigRecord | null>;
  /** Écrit l'URL du trailer ; null retire la vidéo (bloc absent côté public). */
  setTrailerUrl(input: {
    organisationId: string;
    trailerUrl: string | null;
  }): Promise<MediaConfigRecord>;
  /** Lecture publique de /retour-en-images : organisation par défaut, sans session. */
  readDefaultOrgRetourImages(): Promise<{
    trailerUrl: string | null;
    temoignages: TemoignageRecord[];
  }>;
}

interface TemoignageRow {
  id: string;
  organisation_id: string;
  citation: string;
  prenom: string;
  edition_reference: string;
  ordre: number;
  created_at: Date;
}

interface MediaConfigRow {
  organisation_id: string;
  trailer_url: string | null;
  updated_at: Date;
}

const TEMOIGNAGE_COLUMNS =
  'id, organisation_id, citation, prenom, edition_reference, ordre, created_at';

const MEDIA_CONFIG_COLUMNS = 'organisation_id, trailer_url, updated_at';

function toTemoignageRecord(row: TemoignageRow): TemoignageRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    citation: row.citation,
    prenom: row.prenom,
    editionReference: row.edition_reference,
    ordre: row.ordre,
    createdAt: row.created_at,
  };
}

function toMediaConfigRecord(row: MediaConfigRow): MediaConfigRecord {
  return {
    organisationId: row.organisation_id,
    trailerUrl: row.trailer_url,
    updatedAt: row.updated_at,
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

export function createRetourImagesStore(sql: Sql): RetourImagesStore {
  return {
    async listTemoignages(organisationId: string): Promise<TemoignageRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<TemoignageRow[]>`
            SELECT ${tx.unsafe(TEMOIGNAGE_COLUMNS)}
            FROM temoignage
            WHERE organisation_id = ${organisationId}
            ORDER BY ordre ASC, created_at ASC, id ASC
          `;
          return rows.map(toTemoignageRecord);
        }),
      );
    },

    async findTemoignageById(
      temoignageId: string,
      organisationId: string,
    ): Promise<TemoignageRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<TemoignageRow[]>`
            SELECT ${tx.unsafe(TEMOIGNAGE_COLUMNS)}
            FROM temoignage
            WHERE id = ${temoignageId} AND organisation_id = ${organisationId}
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toTemoignageRecord(row) : null;
        }),
      );
    },

    async createTemoignage(input: SaveTemoignageInput): Promise<TemoignageRecord> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Verrou consultatif transactionnel (pattern iam) : sérialise le
          // couple count + insert par organisation — deux créations concurrentes
          // à 5 témoignages ne peuvent plus passer toutes les deux la limite.
          await tx`SELECT pg_advisory_xact_lock(hashtext(${input.organisationId}))`;
          const counts = await tx<{ count: number }[]>`
            SELECT count(*)::int AS count FROM temoignage
            WHERE organisation_id = ${input.organisationId}
          `;
          if ((counts[0]?.count ?? 0) >= MAX_TEMOIGNAGES_PAR_ORG) {
            throw new TemoignagesLimitError(MAX_TEMOIGNAGES_PAR_ORG);
          }
          const rows = await tx<TemoignageRow[]>`
            INSERT INTO temoignage (organisation_id, citation, prenom, edition_reference, ordre)
            VALUES (
              ${input.organisationId},
              ${input.citation},
              ${input.prenom},
              ${input.editionReference},
              COALESCE(
                ${input.ordre}::int,
                (SELECT COALESCE(max(ordre), 0) + 1 FROM temoignage
                 WHERE organisation_id = ${input.organisationId})
              )
            )
            RETURNING ${tx.unsafe(TEMOIGNAGE_COLUMNS)}
          `;
          const row = rows[0];
          if (!row) {
            throw new Error('insertion du témoignage impossible');
          }
          return toTemoignageRecord(row);
        }),
      );
    },

    async updateTemoignage(
      temoignageId: string,
      input: SaveTemoignageInput,
    ): Promise<TemoignageRecord | null> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<TemoignageRow[]>`
            UPDATE temoignage SET
              citation = ${input.citation},
              prenom = ${input.prenom},
              edition_reference = ${input.editionReference},
              ordre = COALESCE(
                ${input.ordre}::int,
                (SELECT ordre FROM temoignage
                 WHERE id = ${temoignageId} AND organisation_id = ${input.organisationId})
              )
            WHERE id = ${temoignageId} AND organisation_id = ${input.organisationId}
            RETURNING ${tx.unsafe(TEMOIGNAGE_COLUMNS)}
          `;
          const row = rows[0];
          return row ? toTemoignageRecord(row) : null;
        }),
      );
    },

    async deleteTemoignage(
      temoignageId: string,
      organisationId: string,
    ): Promise<boolean> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ id: string }[]>`
            DELETE FROM temoignage
            WHERE id = ${temoignageId} AND organisation_id = ${organisationId}
            RETURNING id
          `;
          return rows.length > 0;
        }),
      );
    },

    async findMediaConfig(organisationId: string): Promise<MediaConfigRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<MediaConfigRow[]>`
            SELECT ${tx.unsafe(MEDIA_CONFIG_COLUMNS)}
            FROM vitrine_media_config
            WHERE organisation_id = ${organisationId}
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toMediaConfigRecord(row) : null;
        }),
      );
    },

    async setTrailerUrl(input: {
      organisationId: string;
      trailerUrl: string | null;
    }): Promise<MediaConfigRecord> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<MediaConfigRow[]>`
            INSERT INTO vitrine_media_config (organisation_id, trailer_url)
            VALUES (${input.organisationId}, ${input.trailerUrl})
            ON CONFLICT (organisation_id)
            DO UPDATE SET trailer_url = EXCLUDED.trailer_url, updated_at = now()
            RETURNING ${tx.unsafe(MEDIA_CONFIG_COLUMNS)}
          `;
          const row = rows[0];
          if (!row) {
            throw new Error('écriture de la configuration trailer impossible');
          }
          return toMediaConfigRecord(row);
        }),
      );
    },

    async readDefaultOrgRetourImages(): Promise<{
      trailerUrl: string | null;
      temoignages: TemoignageRecord[];
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
          const [configRows, temoignageRows] = await Promise.all([
            tx<{ trailer_url: string | null }[]>`
              SELECT trailer_url FROM vitrine_media_config
              WHERE organisation_id = ${organisationId}
              LIMIT 1
            `,
            tx<TemoignageRow[]>`
              SELECT ${tx.unsafe(TEMOIGNAGE_COLUMNS)}
              FROM temoignage
              WHERE organisation_id = ${organisationId}
              ORDER BY ordre ASC, created_at ASC, id ASC
            `,
          ]);
          return {
            trailerUrl: configRows[0]?.trailer_url ?? null,
            temoignages: temoignageRows.map(toTemoignageRecord),
          };
        });
      });
    },
  };
}

function createUnavailableStore(): RetourImagesStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    listTemoignages: unavailable,
    findTemoignageById: unavailable,
    createTemoignage: unavailable,
    updateTemoignage: unavailable,
    deleteTemoignage: unavailable,
    findMediaConfig: unavailable,
    setTrailerUrl: unavailable,
    readDefaultOrgRetourImages: unavailable,
  };
}

export function getRetourImagesStore(): RetourImagesStore {
  const globals = globalThis as typeof globalThis & {
    __azzelRetourImagesStore?: RetourImagesStore;
  };
  if (globals.__azzelRetourImagesStore) {
    return globals.__azzelRetourImagesStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createRetourImagesStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelRetourImagesStore = store;
  return store;
}
