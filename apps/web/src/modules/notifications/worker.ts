import { readAssistancePhone } from '@/lib/assistance-phone';
import { sendPlainTextEmail } from '@/modules/iam/email';

import {
  buildNotificationEmail,
  normalizeNotificationPayload,
  readEspaceCoureurUrl,
  type NotificationType,
} from './email-contents';
import { getOutboxStore, type OutboxRow, type OutboxStore } from './outbox-store';

export type SendNotificationFn = (to: string, subject: string, text: string) => Promise<void>;

export interface ProcessOutboxDeps {
  store?: OutboxStore;
  send?: SendNotificationFn;
}

export interface OutboxProcessSummary {
  processed: number;
  sent: number;
  failed: number;
  storeError: string | null;
}

export const DEFAULT_OUTBOX_LIMIT = 20;

export const MAX_OUTBOX_LIMIT = 500;

export function clampOutboxLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) {
    return 1;
  }
  return Math.min(Math.floor(limit), MAX_OUTBOX_LIMIT);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function contentFor(row: OutboxRow): { subject: string; text: string } {
  return buildNotificationEmail(
    row.type as NotificationType,
    normalizeNotificationPayload(row.type as NotificationType, row.payload),
    {
      assistancePhone: readAssistancePhone(),
      espaceCoureurUrl: readEspaceCoureurUrl(),
    },
  );
}

// Worker best effort : liste les candidats (pending + failed hors backoff/poison),
// revendique chaque ligne atomiquement (statut sending — 0 ligne = déjà prise, on
// saute), envoie, marque sent/failed. N'échoue jamais — erreurs avalées + log.
export async function processOutbox(
  limit: number = DEFAULT_OUTBOX_LIMIT,
  deps: ProcessOutboxDeps = {},
): Promise<OutboxProcessSummary> {
  const summary: OutboxProcessSummary = {
    processed: 0,
    sent: 0,
    failed: 0,
    storeError: null,
  };
  let store: OutboxStore;
  try {
    store = deps.store ?? getOutboxStore();
  } catch (error) {
    summary.storeError = errorMessage(error);
    console.error('[notifications] file d’envoi indisponible :', error);
    return summary;
  }
  const send: SendNotificationFn =
    deps.send ?? ((to, subject, text) => sendPlainTextEmail({ to, subject, text }));
  let rows: OutboxRow[];
  try {
    rows = await store.listOutstanding(clampOutboxLimit(limit));
  } catch (error) {
    summary.storeError = errorMessage(error);
    console.error('[notifications] lecture de la file d’envoi impossible :', error);
    return summary;
  }
  summary.processed = rows.length;
  for (const row of rows) {
    let claimed = false;
    try {
      claimed = await store.claimOutboxRow(row.id);
    } catch (error) {
      console.error('[notifications] revendication de %s impossible :', row.id, error);
      continue;
    }
    if (!claimed) {
      continue;
    }
    try {
      const content = contentFor(row);
      await send(row.destinataire, content.subject, content.text);
      await store.markOutboxSent(row.id);
      summary.sent += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(
        '[notifications] envoi %s à %s a échoué :',
        row.id,
        row.destinataire,
        error,
      );
      try {
        await store.markOutboxFailed(row.id, errorMessage(error));
      } catch (markError) {
        console.error('[notifications] marquage failed de %s impossible :', row.id, markError);
      }
    }
  }
  return summary;
}
