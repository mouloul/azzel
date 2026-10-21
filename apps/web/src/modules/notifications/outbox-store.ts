import postgres, { type Sql } from 'postgres';

import { listOrganisationIds, withOrg } from '@/db/org-scope';
import { readDatabaseUrl } from '@/modules/iam/env';
import { DbUnavailableError } from '@/modules/iam/errors';

import type { NotificationType } from './email-contents';

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed';

// Dead-letter implicite : à partir de ce nombre de tentatives, la ligne n'est plus
// reprise par la file — elle reste visible en base et le CLI la signale.
export const MAX_OUTBOX_ATTEMPTS = 5;

export interface OutboxRow {
  id: string;
  organisationId: string;
  destinataire: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  statut: OutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface InsertOutboxInput {
  organisationId: string;
  destinataire: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}

type Queryable = Sql | postgres.TransactionSql;

interface OutboxDbRow {
  id: string;
  organisation_id: string;
  destinataire: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  statut: OutboxStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: Date | null;
  sent_at: Date | null;
  created_at: Date;
}

function toOutboxRow(row: OutboxDbRow): OutboxRow {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    destinataire: row.destinataire,
    type: row.type,
    payload: row.payload,
    statut: row.statut,
    attempts: row.attempts,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

// Insertion DANS la transaction de l'événement métier (déjà withOrg — GUC de
// l'organisation) : si elle échoue, l'événement échoue (cohérence). L'envoi, lui,
// est toujours hors transaction (worker best effort + rejeu).
export async function insertOutboxEmail(
  tx: Queryable,
  input: InsertOutboxInput,
): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    INSERT INTO email_outbox (organisation_id, destinataire, type, payload)
    VALUES (${input.organisationId}, ${input.destinataire}, ${input.type}, ${tx.json(input.payload as postgres.JSONValue)})
    RETURNING id
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('insertion email_outbox sans résultat');
  }
  return row.id;
}

export interface OutboxStore {
  // Lecture publique des organisations (sans GUC — exception documentée spec 1.9) :
  // le worker traite la file de chaque organisation successivement.
  listOrganisationIds(): Promise<string[]>;
  listOutstanding(organisationId: string, limit: number): Promise<OutboxRow[]>;
  claimOutboxRow(organisationId: string, id: string): Promise<boolean>;
  markOutboxSent(organisationId: string, id: string): Promise<void>;
  markOutboxFailed(organisationId: string, id: string, error: string): Promise<void>;
  countDeadLetters(): Promise<number>;
}

export const MAX_LAST_ERROR_LENGTH = 500;

const OUTSTANDING_COLUMNS = `
  id, organisation_id, destinataire, type, payload, statut,
  attempts, last_error, next_attempt_at, sent_at, created_at
`;

export function createOutboxStore(sql: Sql): OutboxStore {
  return {
    async listOrganisationIds(): Promise<string[]> {
      return listOrganisationIds(sql);
    },

    // Candidats à l'envoi : pending immédiat, failed seulement après expiration du
    // backoff (next_attempt_at) ; poison exclu (attempts >= MAX_OUTBOX_ATTEMPTS).
    // Les lignes « sent » ne sont jamais re-listées (idempotence).
    async listOutstanding(organisationId: string, limit: number): Promise<OutboxRow[]> {
      return withOrg(sql, organisationId, async (tx) => {
        const rows = await tx<OutboxDbRow[]>`
          SELECT ${tx.unsafe(OUTSTANDING_COLUMNS)}
          FROM email_outbox
          WHERE statut IN ('pending', 'failed')
            AND attempts < ${MAX_OUTBOX_ATTEMPTS}
            AND (statut = 'pending' OR next_attempt_at IS NULL OR next_attempt_at <= now())
          ORDER BY created_at ASC
          LIMIT ${limit}
        `;
        return rows.map(toOutboxRow);
      });
    },

    // Revendication atomique avant envoi : 0 ligne = déjà prise par un worker
    // concurrent (ou poison) — on saute. attempts est incrémenté ICI, une seule fois.
    async claimOutboxRow(organisationId: string, id: string): Promise<boolean> {
      return withOrg(sql, organisationId, async (tx) => {
        const rows = await tx<{ id: string }[]>`
          UPDATE email_outbox
          SET statut = 'sending', attempts = attempts + 1
          WHERE id = ${id} AND statut IN ('pending', 'failed')
          RETURNING id
        `;
        return rows.length > 0;
      });
    },

    async markOutboxSent(organisationId: string, id: string): Promise<void> {
      await withOrg(sql, organisationId, async (tx) => {
        await tx`
          UPDATE email_outbox
          SET statut = 'sent', last_error = NULL, next_attempt_at = NULL, sent_at = now()
          WHERE id = ${id} AND statut = 'sending'
        `;
      });
    },

    // Backoff : reprise seulement après now() + min(attempts × 5 min, 1 h).
    async markOutboxFailed(
      organisationId: string,
      id: string,
      error: string,
    ): Promise<void> {
      const message = error.slice(0, MAX_LAST_ERROR_LENGTH);
      await withOrg(sql, organisationId, async (tx) => {
        await tx`
          UPDATE email_outbox
          SET statut = 'failed', last_error = ${message},
              next_attempt_at = now() + least(attempts * interval '5 minutes', interval '1 hour')
          WHERE id = ${id} AND statut = 'sending'
        `;
      });
    },

    // Inspection globale (CLI) : somme des impasses de chaque organisation.
    async countDeadLetters(): Promise<number> {
      const organisationIds = await listOrganisationIds(sql);
      let total = 0;
      for (const organisationId of organisationIds) {
        const count = await withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ count: number }[]>`
            SELECT count(*)::int AS count
            FROM email_outbox
            WHERE statut = 'failed' AND attempts >= ${MAX_OUTBOX_ATTEMPTS}
          `;
          return rows[0]?.count ?? 0;
        });
        total += count;
      }
      return total;
    },
  };
}

function createUnavailableOutboxStore(): OutboxStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    listOrganisationIds: unavailable,
    listOutstanding: unavailable,
    claimOutboxRow: unavailable,
    markOutboxSent: unavailable,
    markOutboxFailed: unavailable,
    countDeadLetters: unavailable,
  };
}

export function getOutboxStore(): OutboxStore {
  const globals = globalThis as typeof globalThis & {
    __azzelOutboxStore?: OutboxStore;
  };
  if (globals.__azzelOutboxStore) {
    return globals.__azzelOutboxStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createOutboxStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableOutboxStore();
  globals.__azzelOutboxStore = store;
  return store;
}
