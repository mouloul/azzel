import type { Sql } from 'postgres';

import { getDbClient } from '@/db/client';
import { protegerStore } from '@/db/app-role';
import { isProductionRuntime } from '@/modules/iam/store';

import { findOrganisationIdBySlug, withOrg } from '@/db/org-scope';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { DbUnavailableError } from '@/modules/iam/errors';

import { PARCOURS_SLUGS, REGION_SLUGS, ordonnerParSlugs } from './domain';
import { EpreuveAbsenteError } from './errors';

export interface ContenuRecord {
  id: string;
  organisationId: string;
  slug: string;
  titre: string;
  corps: string;
  updatedAt: Date;
}

export interface EpreuveParcoursRecord {
  id: string;
  slug: string;
  nom: string;
  distanceKm: number;
  gpxUrl: string | null;
}

export interface SaveContenuInput {
  organisationId: string;
  slug: string;
  titre: string;
  corps: string;
  /**
   * Verrou optimiste : version lue par le client. null = création attendue
   * (le bloc n'existait pas à la lecture) ; une valeur décalée fait échouer
   * l'upsert silencieusement (null retourné → Conflit au service).
   */
  ancienUpdatedAt: Date | null;
  /** Mis à jour uniquement si fourni (fusion au niveau service). */
  gpx?: { epreuveSlug: string; url: string | null };
}

export interface SaveContenuResult {
  contenu: ContenuRecord;
  epreuve: EpreuveParcoursRecord | null;
}

export interface PageParcoursRecord {
  contenus: ContenuRecord[];
  epreuves: EpreuveParcoursRecord[];
}

export interface PageRegionRecord {
  contenus: ContenuRecord[];
}

export interface ContenusStore {
  listContenusBySlugs(
    organisationId: string,
    slugs: readonly string[],
  ): Promise<ContenuRecord[]>;
  findContenuBySlug(
    organisationId: string,
    slug: string,
  ): Promise<ContenuRecord | null>;
  /**
   * Écrit le bloc : création si absent, mise à jour verrouillée par la version
   * lue si présent (upsert atomique). Retourne null quand la version est
   * obsolète (conflit d'édition concurrente).
   */
  saveContenu(input: SaveContenuInput): Promise<SaveContenuResult | null>;
  /**
   * Épreuves « parcours » de l'org. Story 7.3 : `editionId` optionnel — fourni
   * par la carte publique, la liste est SCOPÉE à cette édition (plus de doublon
   * de slug ni de tracé d'une édition passée) ; sans paramètre, comportement
   * historique (toutes les épreuves de l'org, surfaces admin V1 mono-édition).
   */
  listEpreuvesParcours(
    organisationId: string,
    editionId?: string,
  ): Promise<EpreuveParcoursRecord[]>;
  /** Lecture publique de /parcours : organisation par défaut, sans session. */
  readDefaultOrgPageParcours(): Promise<PageParcoursRecord>;
  /** Lecture publique de /region : organisation par défaut, sans session. */
  readDefaultOrgPageRegion(): Promise<PageRegionRecord>;
}

interface ContenuRow {
  id: string;
  organisation_id: string;
  slug: string;
  titre: string;
  corps: string;
  updated_at: Date;
}

interface EpreuveRow {
  id: string;
  slug: string;
  name: string;
  distance_km: string | number;
  gpx_url: string | null;
}

const CONTENU_COLUMNS = 'id, organisation_id, slug, titre, corps, updated_at';

const EPREUVE_COLUMNS = 'id, slug, name, distance_km, gpx_url';

function toContenuRecord(row: ContenuRow): ContenuRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    slug: row.slug,
    titre: row.titre,
    corps: row.corps,
    updatedAt: row.updated_at,
  };
}

function toEpreuveRecord(row: EpreuveRow): EpreuveParcoursRecord {
  return {
    id: row.id,
    slug: row.slug,
    nom: row.name,
    distanceKm: Number(row.distance_km),
    gpxUrl: row.gpx_url,
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

export function createContenusStore(sql: Sql): ContenusStore {
  return {
    async listContenusBySlugs(
      organisationId: string,
      slugs: readonly string[],
    ): Promise<ContenuRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<ContenuRow[]>`
            SELECT ${tx.unsafe(CONTENU_COLUMNS)}
            FROM contenu_vitrine
            WHERE organisation_id = ${organisationId} AND slug IN ${tx(slugs)}
          `;
          return ordonnerParSlugs(rows.map(toContenuRecord), slugs);
        }),
      );
    },

    async findContenuBySlug(
      organisationId: string,
      slug: string,
    ): Promise<ContenuRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<ContenuRow[]>`
            SELECT ${tx.unsafe(CONTENU_COLUMNS)}
            FROM contenu_vitrine
            WHERE organisation_id = ${organisationId} AND slug = ${slug}
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toContenuRecord(row) : null;
        }),
      );
    },

    async saveContenu(input: SaveContenuInput): Promise<SaveContenuResult | null> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Upsert atomique : création si le bloc n'existe pas (organisation non
          // seedée), sinon mise à jour verrouillée par la version lue — version
          // obsolète ⇒ la clause WHERE échoue, aucune ligne retournée (null).
          // updated_at reste en précision milliseconde : la version envoyée par
          // le client (ISO, ms) doit rejouer exactement contre la colonne.
          const contenuRows = await tx<ContenuRow[]>`
            INSERT INTO contenu_vitrine (organisation_id, slug, titre, corps)
            VALUES (${input.organisationId}, ${input.slug}, ${input.titre}, ${input.corps})
            ON CONFLICT (organisation_id, slug) DO UPDATE
              SET titre = EXCLUDED.titre,
                  corps = EXCLUDED.corps,
                  updated_at = date_trunc('milliseconds', now())
              WHERE contenu_vitrine.updated_at = ${input.ancienUpdatedAt}
            RETURNING ${tx.unsafe(CONTENU_COLUMNS)}
          `;
          const contenuRow = contenuRows[0];
          if (!contenuRow) {
            return null;
          }
          let epreuve: EpreuveParcoursRecord | null = null;
          if (input.gpx) {
            const epreuveRows = await tx<EpreuveRow[]>`
              UPDATE epreuve
              SET gpx_url = ${input.gpx.url}
              WHERE organisation_id = ${input.organisationId} AND slug = ${input.gpx.epreuveSlug}
              RETURNING ${tx.unsafe(EPREUVE_COLUMNS)}
            `;
            const epreuveRow = epreuveRows[0];
            if (!epreuveRow) {
              // 400 dédié (pas un 500) : ce bloc parcours n'a pas d'épreuve
              // dans cette organisation — l'URL GPX n'a nulle part où vivre.
              throw new EpreuveAbsenteError();
            }
            epreuve = toEpreuveRecord(epreuveRow);
          }
          return { contenu: toContenuRecord(contenuRow), epreuve };
        }),
      );
    },

    async listEpreuvesParcours(
      organisationId: string,
      editionId?: string,
    ): Promise<EpreuveParcoursRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          // V1 : une seule édition par organisation — les épreuves parcourues
          // sont celles créées pour elle (ordre de création, longue d'abord).
          // Story 7.3 : filtre édition OPTIONNEL (carte publique — l'épreuve
          // « longue » d'une édition passée ne doit plus jamais y fuiter).
          const rows = await tx<EpreuveRow[]>`
            SELECT ${tx.unsafe(EPREUVE_COLUMNS)}
            FROM epreuve
            WHERE organisation_id = ${organisationId}
              ${editionId === undefined ? tx`` : tx`AND edition_id = ${editionId}`}
            ORDER BY created_at ASC, id ASC
          `;
          return rows.map(toEpreuveRecord);
        }),
      );
    },

    async readDefaultOrgPageParcours(): Promise<PageParcoursRecord> {
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
          const [contenus, epreuves] = await Promise.all([
            tx<ContenuRow[]>`
              SELECT ${tx.unsafe(CONTENU_COLUMNS)}
              FROM contenu_vitrine
              WHERE organisation_id = ${organisationId} AND slug IN ${tx(PARCOURS_SLUGS)}
            `,
            tx<EpreuveRow[]>`
              SELECT ${tx.unsafe(EPREUVE_COLUMNS)}
              FROM epreuve
              WHERE organisation_id = ${organisationId}
              ORDER BY created_at ASC, id ASC
            `,
          ]);
          return {
            contenus: ordonnerParSlugs(contenus.map(toContenuRecord), PARCOURS_SLUGS),
            epreuves: epreuves.map(toEpreuveRecord),
          };
        });
      });
    },

    async readDefaultOrgPageRegion(): Promise<PageRegionRecord> {
      return withDb(async () => {
        const organisationId = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
        if (!organisationId) {
          throw new Error(
            `Organisation « ${DEFAULT_ORGANISATION_SLUG} » absente : exécute pnpm -F @azzel/web db:migrate`,
          );
        }
        return withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<ContenuRow[]>`
            SELECT ${tx.unsafe(CONTENU_COLUMNS)}
            FROM contenu_vitrine
            WHERE organisation_id = ${organisationId} AND slug IN ${tx(REGION_SLUGS)}
          `;
          return { contenus: ordonnerParSlugs(rows.map(toContenuRecord), REGION_SLUGS) };
        });
      });
    },
  };
}

function createUnavailableStore(): ContenusStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    listContenusBySlugs: unavailable,
    findContenuBySlug: unavailable,
    saveContenu: unavailable,
    listEpreuvesParcours: unavailable,
    readDefaultOrgPageParcours: unavailable,
    readDefaultOrgPageRegion: unavailable,
  };
}

export function getContenusStore(): ContenusStore {
  const globals = globalThis as typeof globalThis & {
    __azzelContenusStore?: ContenusStore;
  };
  if (globals.__azzelContenusStore) {
    return globals.__azzelContenusStore;
  }
  // Garde de rôle applicatif (story 1.9) : la connexion doit être le rôle
  // soumis au RLS, sur CE store comme sur celui de l'IAM.
  // Pool applicatif partagé — voir `@/db/client`.
  const sql = getDbClient();
  const store =
    sql !== null
      ? protegerStore(sql, createContenusStore(sql), isProductionRuntime())
      : createUnavailableStore();
  globals.__azzelContenusStore = store;
  return store;
}
