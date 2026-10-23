import { randomBytes } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

import { cleIdempotencePosition, type PositionTerrain } from '@azzel/shared';

import { withOrg } from '@/db/org-scope';
import { DbUnavailableError } from '@/modules/iam/errors';
import { sha256Hex } from '@/modules/iam/service';
import { readDatabaseUrl } from '@/modules/iam/env';

import { calculerOffsetEstimeMs, type AppareilCoureurRecord } from './domain';
import { AppareilRevokedError } from './errors';

// Story 6.2 — store tracking : l'ingestion d'un lot entier de positions vit
// dans UNE SEULE transaction withOrg (insertions idempotentes + last_sync_at
// — un échec DB n'importe rien). La recherche d'appareil par hash reste HORS
// GUC (pattern 0011 : le secret précède l'organisation, la sync n'a pas de
// session). Gabarit exact du store chrono (0025), décliné pour les coureurs.

export type StatutInsertionPosition = 'accepté' | 'déjà-connu' | { rejeté: string };

export interface TrackingStore {
  /** Hors GUC (pattern 0011) : résout l'org depuis le secret. */
  trouverAppareilParHash(jetonHash: string): Promise<{
    id: string;
    organisationId: string;
    accountId: string;
    appareilClient: string;
    revokedAt: Date | null;
  } | null>;
  /** Find-or-create par (org, account, appareil_client) ; rotation du jeton si connu. */
  enregistrerAppareilCoureur(input: {
    organisationId: string;
    accountId: string;
    appareilClient: string;
  }): Promise<{ id: string; jeton: string; rotation: boolean }>;
  /** Résout puis ingère le lot : JAMAIS de doublon visible (ON CONFLICT). */
  insererLotPositions(input: {
    organisationId: string;
    /** id de la LIGNE appareil_coureur résolue par le Bearer. */
    appareilId: string;
    /** appareil_client du Bearer — base des clés RECALCULÉES côté serveur. */
    appareilClient: string;
    positions: PositionTerrain[];
    reception: Date;
  }): Promise<('accepté' | 'déjà-connu')[]>;
  /** Audit admin : liste les appareils coureurs de l'org. */
  listerAppareils(organisationId: string): Promise<AppareilCoureurRecord[]>;
}

/** Jeton BRUT du canal sync : 256 bits, base64url — hashé avant toute base. */
export function genererJetonAppareil(): string {
  return randomBytes(32).toString('base64url');
}

export function hashJetonAppareil(jeton: string): string {
  return sha256Hex(jeton);
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

interface AppareilCoureurRow {
  id: string;
  organisation_id: string;
  account_id: string;
  appareil_client: string;
  revoked_at: Date | null;
  last_sync_at: Date | null;
  created_at: Date;
}

function toAppareilCoureurRecord(row: AppareilCoureurRow): AppareilCoureurRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    appareilClient: row.appareil_client,
    revokedAt: row.revoked_at,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  };
}

export function createTrackingStore(sql: Sql): TrackingStore {
  return {
    // Hors withOrg, délibérément (pattern 0011) : le hash du jeton EST le
    // contrôle d'accès, l'organisation n'est connue qu'après résolution.
    async trouverAppareilParHash(jetonHash: string) {
      return withDb(async () => {
        const rows = await sql<
          Pick<
            AppareilCoureurRow,
            'id' | 'organisation_id' | 'account_id' | 'appareil_client' | 'revoked_at'
          >[]
        >`
          SELECT id, organisation_id, account_id, appareil_client, revoked_at
          FROM appareil_coureur WHERE jeton_hash = ${jetonHash} LIMIT 1
        `;
        const row = rows[0];
        return row
          ? {
              id: row.id,
              organisationId: row.organisation_id,
              accountId: row.account_id,
              appareilClient: row.appareil_client,
              revokedAt: row.revoked_at,
            }
          : null;
      });
    },

    async enregistrerAppareilCoureur(input: {
      organisationId: string;
      accountId: string;
      appareilClient: string;
    }): Promise<{ id: string; jeton: string; rotation: boolean }> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // UPSERT atomique (aucune fenêtre de course) : deux ouvertures
          // concurrentes de l'app ne peuvent pas créer deux lignes — le
          // conflit (org, account, appareil_client) bascule en rotation du
          // jeton. Le garde révoqué lit revoked_at APRÈS l'upsert : un appareil
          // révoqué ne récupère jamais un jeton (le rollback défait l'écrasement
          // du hash — AD-5, assistance humaine).
          const jeton = genererJetonAppareil();
          const uploadees = await tx<{ id: string; revoked_at: Date | null; cree: boolean }[]>`
            INSERT INTO appareil_coureur (organisation_id, account_id, appareil_client, jeton_hash)
            VALUES (${input.organisationId}, ${input.accountId}, ${input.appareilClient}, ${hashJetonAppareil(jeton)})
            ON CONFLICT (organisation_id, account_id, appareil_client)
              DO UPDATE SET jeton_hash = EXCLUDED.jeton_hash
            RETURNING id, revoked_at, (xmax = 0) AS cree
          `;
          const row = uploadees[0];
          if (!row) {
            throw new Error('upsert de l’appareil coureur sans résultat');
          }
          if (row.revoked_at !== null) {
            throw new AppareilRevokedError();
          }
          return { id: row.id, jeton, rotation: !row.cree };
        }),
      );
    },

    async insererLotPositions(input: {
      organisationId: string;
      appareilId: string;
      appareilClient: string;
      positions: PositionTerrain[];
      reception: Date;
    }): Promise<('accepté' | 'déjà-connu')[]> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Les clés sont RECALCULÉES ICI, côté serveur, depuis
          // l'appareil_client du Bearer — jamais depuis une valeur transportée
          // (l'appareil propose, le serveur dispose).
          const cles = input.positions.map((position) =>
            cleIdempotencePosition(input.appareilClient, position.capteA),
          );

          // INSERT multi-lignes (unnest) : le lot entier part en UNE requête,
          // idempotent par clé — RETURNING donne les clés réellement insérées,
          // les absentes sont « déjà-connu ». Même horodatage de réception pour
          // tout le lot : l'ordre DANS un lot n'a pas de sens d'arbitrage.
          const clesInserees = new Set<string>();
          if (input.positions.length > 0) {
            const inserees = await tx<{ cle_idempotence: string }[]>`
              INSERT INTO position (
                organisation_id, appareil_coureur_id, cle_idempotence,
                latitude, longitude, capte_at, recu_a, offset_estime_ms
              )
              SELECT ${input.organisationId}, ${input.appareilId}, t.f1, t.f2, t.f3, t.f4,
                     ${input.reception}, t.f5
              FROM unnest(
                ${cles}::text[],
                ${input.positions.map((position) => position.lat)}::numeric[],
                ${input.positions.map((position) => position.lon)}::numeric[],
                ${input.positions.map((position) => new Date(position.capteA).toISOString())}::timestamptz[],
                ${input.positions.map((position) =>
                  calculerOffsetEstimeMs(input.reception, new Date(position.capteA)),
                )}::bigint[]
              ) AS t(f1, f2, f3, f4, f5)
              ON CONFLICT (cle_idempotence) DO NOTHING
              RETURNING cle_idempotence
            `;
            for (const row of inserees) {
              clesInserees.add(row.cle_idempotence);
            }
          }

          // last_sync_at rafraîchi HORS du if : un lot vide (ou entièrement
          // rejeté) est une sync RÉUSSIE — l'appareil a parlé, l'audit le
          // raconte ; seule une tentative REFUSÉE (révoqué, base indisponible)
          // ne rajeunit pas l'appareil.
          await tx`
            UPDATE appareil_coureur SET last_sync_at = ${input.reception}
            WHERE id = ${input.appareilId}
          `;

          return cles.map((cle) => (clesInserees.has(cle) ? 'accepté' : 'déjà-connu'));
        }),
      );
    },

    async listerAppareils(organisationId: string): Promise<AppareilCoureurRecord[]> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<AppareilCoureurRow[]>`
            SELECT id, organisation_id, account_id, appareil_client, revoked_at, last_sync_at, created_at
            FROM appareil_coureur
            WHERE organisation_id = ${organisationId}
            ORDER BY created_at ASC, id ASC
          `;
          return rows.map(toAppareilCoureurRecord);
        }),
      );
    },
  };
}

function createUnavailableStore(): TrackingStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    trouverAppareilParHash: unavailable,
    enregistrerAppareilCoureur: unavailable,
    insererLotPositions: unavailable,
    listerAppareils: unavailable,
  };
}

export function getTrackingStore(): TrackingStore {
  const globals = globalThis as typeof globalThis & {
    __azzelTrackingStore?: TrackingStore;
  };
  if (globals.__azzelTrackingStore) {
    return globals.__azzelTrackingStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createTrackingStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelTrackingStore = store;
  return store;
}
