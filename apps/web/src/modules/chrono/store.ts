import { randomBytes } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

import {
  MOTIF_REJET_CHECKPOINT_INCONNU,
  MOTIF_REJET_COUREUR_INCONNU,
  type EvenementSyncTerrain,
} from '@azzel/shared';

import { withOrg } from '@/db/org-scope';
import { DbUnavailableError } from '@/modules/iam/errors';
import { sha256Hex } from '@/modules/iam/service';
import { readDatabaseUrl } from '@/modules/iam/env';

import type { AppareilRecord, TerrainEvenementRecord } from './domain';
import { PLAFOND_APPAREILS_PAR_ORG, calculerOffsetEstimeMs, estUuidValide } from './domain';
import { AppareilRevokedError, PlafondAppareilsError } from './errors';

// Story 4.5 — store chrono : l'ingestion d'un lot entier vit dans UNE SEULE
// transaction withOrg (résolution des jetons + insertions idempotentes) — un
// échec DB n'importe rien. La recherche d'appareil par hash reste HORS GUC
// (pattern 0011 : le secret précède l'organisation, la sync n'a pas de session).

export type StatutInsertion = 'accepté' | 'déjà-connu' | { rejeté: string };

export interface ChronoStore {
  /** Hors GUC (pattern 0011) : résout l'org depuis le secret. */
  trouverAppareilParHash(jetonHash: string): Promise<{
    id: string;
    organisationId: string;
    appareilClient: string;
    revokedAt: Date | null;
  } | null>;
  /** Find-or-create par appareil_client (org) ; rotation du jeton si connu. */
  enregistrerAppareil(input: {
    organisationId: string;
    appareilClient: string;
  }): Promise<{ id: string; jeton: string; rotation: boolean }>;
  rafraichirLastSync(input: {
    organisationId: string;
    appareilId: string;
    maintenant: Date;
  }): Promise<void>;
  /** Résout puis ingère le lot : JAMAIS de doublon visible (ON CONFLICT). */
  insererLot(input: {
    organisationId: string;
    evenements: EvenementSyncTerrain[];
    reception: Date;
  }): Promise<StatutInsertion[]>;
  /** Arbitrage AD-3 : le PREMIER reçu (horodatage serveur) fait foi. */
  premierRecu(input: {
    organisationId: string;
    editionId: string;
    jeton: string;
    checkpointId: string | null;
  }): Promise<TerrainEvenementRecord | null>;
  listerAppareils(organisationId: string): Promise<AppareilRecord[]>;
  revoquerAppareil(input: {
    organisationId: string;
    appareilId: string;
    maintenant: Date;
  }): Promise<AppareilRecord | null>;
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

interface AppareilRow {
  id: string;
  organisation_id: string;
  appareil_client: string;
  revoked_at: Date | null;
  last_sync_at: Date | null;
  created_at: Date;
}

interface TerrainEvenementRow {
  id: string;
  cle_idempotence: string;
  type: 'retrait' | 'passage';
  edition_id: string;
  jeton_coureur: string;
  checkpoint_id: string | null;
  horodatage_appareil: Date;
  horodatage_reception: Date;
  offset_estime_ms: string | number;
  appareil_id: string;
}

function toTerrainEvenementRecord(row: TerrainEvenementRow): TerrainEvenementRecord {
  return {
    id: row.id,
    cleIdempotence: row.cle_idempotence,
    type: row.type,
    editionId: row.edition_id,
    jetonCoureur: row.jeton_coureur,
    checkpointId: row.checkpoint_id,
    horodatageAppareil: row.horodatage_appareil,
    horodatageReception: row.horodatage_reception,
    offsetEstimeMs: Number(row.offset_estime_ms),
    appareilId: row.appareil_id,
  };
}

function toAppareilRecord(row: AppareilRow): AppareilRecord {
  return {
    id: row.id,
    appareilClient: row.appareil_client,
    revokedAt: row.revoked_at,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  };
}

export function createChronoStore(sql: Sql): ChronoStore {
  return {
    // Hors withOrg, délibérément (pattern 0011) : le hash du jeton EST le
    // contrôle d'accès, l'organisation n'est connue qu'après résolution.
    async trouverAppareilParHash(jetonHash: string) {
      return withDb(async () => {
        const rows = await sql<
          Pick<AppareilRow, 'id' | 'organisation_id' | 'appareil_client' | 'revoked_at'>[]
        >`
          SELECT id, organisation_id, appareil_client, revoked_at
          FROM appareil WHERE jeton_hash = ${jetonHash} LIMIT 1
        `;
        const row = rows[0];
        return row
          ? {
              id: row.id,
              organisationId: row.organisation_id,
              appareilClient: row.appareil_client,
              revokedAt: row.revoked_at,
            }
          : null;
      });
    },

    async enregistrerAppareil(input: {
      organisationId: string;
      appareilClient: string;
    }): Promise<{ id: string; jeton: string; rotation: boolean }> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Plafond doux : seul l'enregistrement d'un NOUVEAU appareil y est
          // soumis — la rotation d'un appareil connu passe toujours.
          const connues = await tx<{ id: string }[]>`
            SELECT id FROM appareil
            WHERE organisation_id = ${input.organisationId}
              AND appareil_client = ${input.appareilClient}
            LIMIT 1
          `;
          if (connues.length === 0) {
            const comptees = await tx<{ count: number }[]>`
              SELECT count(*)::int AS count FROM appareil
              WHERE organisation_id = ${input.organisationId}
            `;
            if ((comptees[0]?.count ?? 0) >= PLAFOND_APPAREILS_PAR_ORG) {
              throw new PlafondAppareilsError(PLAFOND_APPAREILS_PAR_ORG);
            }
          }
          // UPSERT atomique (aucune fenêtre de course entre SELECT et INSERT) :
          // deux ouvertures concurrentes de la PWA ne peuvent pas créer deux
          // lignes — le conflit (org, appareil_client) bascule en rotation du
          // jeton. Le garde révoqué lit revoked_at APRÈS l'upsert : un appareil
          // révoqué ne récupère jamais un jeton (le rollback défait l'écrasement
          // du hash — AD-5, assistance humaine).
          const jeton = genererJetonAppareil();
          const uploadees = await tx<{ id: string; revoked_at: Date | null; cree: boolean }[]>`
            INSERT INTO appareil (organisation_id, appareil_client, jeton_hash)
            VALUES (${input.organisationId}, ${input.appareilClient}, ${hashJetonAppareil(jeton)})
            ON CONFLICT (organisation_id, appareil_client)
              DO UPDATE SET jeton_hash = EXCLUDED.jeton_hash
            RETURNING id, revoked_at, (xmax = 0) AS cree
          `;
          const row = uploadees[0];
          if (!row) {
            throw new Error('upsert de l’appareil sans résultat');
          }
          if (row.revoked_at !== null) {
            throw new AppareilRevokedError();
          }
          return { id: row.id, jeton, rotation: !row.cree };
        }),
      );
    },

    async rafraichirLastSync(input: {
      organisationId: string;
      appareilId: string;
      maintenant: Date;
    }): Promise<void> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          await tx`
            UPDATE appareil SET last_sync_at = ${input.maintenant}
            WHERE id = ${input.appareilId}
          `;
        }),
      );
    },

    async insererLot(input: {
      organisationId: string;
      evenements: EvenementSyncTerrain[];
      reception: Date;
    }): Promise<StatutInsertion[]> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Résolution coureurs en UNE requête : paires (jeton, édition)
          // présentes dans l'org. Un jeton hors org/édition = coureur
          // inconnu → rejet motivé, JAMAIS stocké.
          const jetonsDistincts = [...new Set(input.evenements.map((e) => e.jeton))];
          const pairesConnues = new Set<string>();
          if (jetonsDistincts.length > 0) {
            const rows = await tx<{ jeton: string; edition_id: string }[]>`
              SELECT jeton_edossard AS jeton, edition_id
              FROM coureur
              WHERE organisation_id = ${input.organisationId}
                AND jeton_edossard = ANY(${jetonsDistincts}::text[])
            `;
            for (const row of rows) {
              pairesConnues.add(`${row.jeton}:${row.edition_id}`);
            }
          }

          // Résolution checkpoints en UNE requête (V1 : le checkpoint EST une
          // mission scan_checkpoint de l'org) — un id fantôme (ou non-UUID,
          // donc introuvable par construction) = checkpoint inconnu, rejet
          // motivé, JAMAIS stocké.
          const checkpointsDemandes = new Set(
            input.evenements
              .filter((evenement) => evenement.type === 'passage')
              .map((evenement) => evenement.checkpointId),
          );
          const checkpointsConnus = new Set<string>();
          const uuidsCheckpoints = [...checkpointsDemandes].filter(estUuidValide);
          if (uuidsCheckpoints.length > 0) {
            const rows = await tx<{ id: string }[]>`
              SELECT id FROM mission
              WHERE organisation_id = ${input.organisationId}
                AND type = 'scan_checkpoint'
                AND id = ANY(${uuidsCheckpoints}::uuid[])
            `;
            for (const row of rows) {
              checkpointsConnus.add(row.id);
            }
          }

          // Tri : seuls les événements résolus partent en insertion, dans
          // l'ordre du lot ; les statuts sont réassemblés ensuite.
          const aInserer: EvenementSyncTerrain[] = [];
          const rangs: number[] = [];
          const rejets = new Map<number, string>();
          input.evenements.forEach((evenement, index) => {
            if (!pairesConnues.has(`${evenement.jeton}:${evenement.editionId}`)) {
              rejets.set(index, MOTIF_REJET_COUREUR_INCONNU);
              return;
            }
            if (
              evenement.type === 'passage' &&
              !checkpointsConnus.has(evenement.checkpointId)
            ) {
              rejets.set(index, MOTIF_REJET_CHECKPOINT_INCONNU);
              return;
            }
            aInserer.push(evenement);
            rangs.push(index);
          });

          // INSERT multi-lignes (unnest) : le lot entier part en UNE requête,
          // idempotente par clé — RETURNING donne les clés réellement insérées,
          // les absentes sont « déjà-connu ». Même horodatage de réception pour
          // tout le lot : l'ordre DANS un lot n'a pas de sens d'arbitrage,
          // seul l'ordre ENTRE lots compte.
          const clesInserees = new Set<string>();
          if (aInserer.length > 0) {
            const inserees = await tx<{ cle_idempotence: string }[]>`
              INSERT INTO terrain_evenement (
                organisation_id, cle_idempotence, type, edition_id, jeton_coureur,
                checkpoint_id, horodatage_appareil, horodatage_reception,
                offset_estime_ms, appareil_id
              )
              SELECT ${input.organisationId}, t.f1, t.f2, t.f3, t.f4, t.f5, t.f6,
                     ${input.reception}, t.f7, t.f8
              FROM unnest(
                ${aInserer.map((e) => e.cle)}::text[],
                ${aInserer.map((e) => e.type)}::text[],
                ${aInserer.map((e) => e.editionId)}::uuid[],
                ${aInserer.map((e) => e.jeton)}::text[],
                ${aInserer.map((e) => (e.type === 'passage' ? e.checkpointId : null))}::uuid[],
                ${aInserer.map((e) => new Date(e.horodatage).toISOString())}::timestamptz[],
                ${aInserer.map((e) =>
                  calculerOffsetEstimeMs(input.reception, new Date(e.horodatage)),
                )}::bigint[],
                ${aInserer.map((e) => e.appareilId)}::text[]
              ) AS t(f1, f2, f3, f4, f5, f6, f7, f8)
              ON CONFLICT (cle_idempotence) DO NOTHING
              RETURNING cle_idempotence
            `;
            for (const row of inserees) {
              clesInserees.add(row.cle_idempotence);
            }
          }

          const statuts: StatutInsertion[] = input.evenements.map(() => 'déjà-connu');
          for (let rang = 0; rang < rangs.length; rang += 1) {
            const evenement = aInserer[rang];
            const index = rangs[rang];
            if (evenement !== undefined && index !== undefined) {
              statuts[index] = clesInserees.has(evenement.cle) ? 'accepté' : 'déjà-connu';
            }
          }
          for (const [index, motif] of rejets) {
            statuts[index] = { rejeté: motif };
          }
          return statuts;
        }),
      );
    },

    async premierRecu(input: {
      organisationId: string;
      editionId: string;
      jeton: string;
      checkpointId: string | null;
    }): Promise<TerrainEvenementRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<TerrainEvenementRow[]>`
            SELECT id, cle_idempotence, type, edition_id, jeton_coureur, checkpoint_id,
                   horodatage_appareil, horodatage_reception, offset_estime_ms, appareil_id
            FROM terrain_evenement
            WHERE organisation_id = ${input.organisationId}
              AND edition_id = ${input.editionId}
              AND jeton_coureur = ${input.jeton}
              AND checkpoint_id IS NOT DISTINCT FROM ${input.checkpointId}
            ORDER BY horodatage_reception ASC, id ASC
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toTerrainEvenementRecord(row) : null;
        }),
      );
    },

    async listerAppareils(organisationId: string): Promise<AppareilRecord[]> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<AppareilRow[]>`
            SELECT id, organisation_id, appareil_client, revoked_at, last_sync_at, created_at
            FROM appareil
            WHERE organisation_id = ${organisationId}
            ORDER BY created_at ASC, id ASC
          `;
          return rows.map(toAppareilRecord);
        }),
      );
    },

    async revoquerAppareil(input: {
      organisationId: string;
      appareilId: string;
      maintenant: Date;
    }): Promise<AppareilRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Idempotent : révoquer un appareil déjà révoqué conserve la PREMIÈRE
          // date (COALESCE) — l'audit garde l'acte initial.
          const rows = await tx<AppareilRow[]>`
            UPDATE appareil SET revoked_at = COALESCE(revoked_at, ${input.maintenant})
            WHERE id = ${input.appareilId} AND organisation_id = ${input.organisationId}
            RETURNING id, organisation_id, appareil_client, revoked_at, last_sync_at, created_at
          `;
          const row = rows[0];
          return row ? toAppareilRecord(row) : null;
        }),
      );
    },
  };
}

function createUnavailableStore(): ChronoStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    trouverAppareilParHash: unavailable,
    enregistrerAppareil: unavailable,
    rafraichirLastSync: unavailable,
    insererLot: unavailable,
    premierRecu: unavailable,
    listerAppareils: unavailable,
    revoquerAppareil: unavailable,
  };
}

export function getChronoStore(): ChronoStore {
  const globals = globalThis as typeof globalThis & {
    __azzelChronoStore?: ChronoStore;
  };
  if (globals.__azzelChronoStore) {
    return globals.__azzelChronoStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createChronoStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelChronoStore = store;
  return store;
}
