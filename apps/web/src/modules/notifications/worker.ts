import { readAssistancePhone } from '@/lib/assistance-phone';
import { sendEmail } from '@/modules/iam/email';

import {
  buildNotificationEmail,
  normalizeNotificationPayload,
  type BuiltNotificationEmail,
  readConnexionUrl,
  readEspaceCoureurUrl,
  readRunnersAppUrl,
  type NotificationType,
} from './email-contents';
import { getOutboxStore, type OutboxRow, type OutboxStore } from './outbox-store';

export type SendNotificationFn = (
  to: string,
  subject: string,
  text: string,
  html: string,
) => Promise<void>;

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

function contentFor(row: OutboxRow): BuiltNotificationEmail {
  const payload = normalizeNotificationPayload(row.type as NotificationType, row.payload);
  return buildNotificationEmail(row.type as NotificationType, payload, {
    assistancePhone: readAssistancePhone(),
    espaceCoureurUrl: readEspaceCoureurUrl(),
    // Story 3.1 : l'invitation volontaire pointe vers /connexion (sans jeton).
    connexionUrl: readConnexionUrl(),
    // Story 6.4 — lien app coureurs du rappel J-7 (RUNNERS_APP_URL, repli APP_URL).
    runnersAppUrl: readRunnersAppUrl(),
  });
}

// Worker best effort : énumère les organisations (lecture publique), liste les
// candidats de chacune (pending + failed hors backoff/poison, GUC posé par le
// store), fusionne par created_at, revendique chaque ligne atomiquement dans SON
// organisation (statut sending — 0 ligne = déjà prise, on saute), envoie, marque
// sent/failed. N'échoue jamais — erreurs avalées + log.
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
    deps.send ?? ((to, subject, text, html) => sendEmail({ to, subject, text, html }));
  const boundedLimit = clampOutboxLimit(limit);
  let organisationIds: string[];
  try {
    organisationIds = await store.listOrganisationIds();
  } catch (error) {
    summary.storeError = errorMessage(error);
    console.error('[notifications] lecture des organisations impossible :', error);
    return summary;
  }
  const collected: OutboxRow[] = [];
  const storeErrors: string[] = [];
  for (const organisationId of organisationIds) {
    let rows: OutboxRow[];
    try {
      rows = await store.listOutstanding(organisationId, boundedLimit);
    } catch (error) {
      // Une organisation malade n'arrête pas la boucle : erreur accumulée, on
      // continue sur les organisations restantes (les lignes déjà collectées
      // restent traitées).
      const message = errorMessage(error);
      storeErrors.push(`${organisationId}: ${message}`);
      console.error(
        '[notifications] lecture de la file d’envoi impossible pour %s :',
        organisationId,
        error,
      );
      continue;
    }
    collected.push(...rows);
  }
  summary.storeError = storeErrors.length > 0 ? storeErrors.join(' ; ') : null;
  const rows = collected.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, boundedLimit);
  summary.processed = rows.length;
  for (const row of rows) {
    let claimed = false;
    try {
      claimed = await store.claimOutboxRow(row.organisationId, row.id);
    } catch (error) {
      console.error('[notifications] revendication de %s impossible :', row.id, error);
      continue;
    }
    if (!claimed) {
      continue;
    }
    try {
      const content = contentFor(row);
      await send(row.destinataire, content.subject, content.text, content.html);
      await store.markOutboxSent(row.organisationId, row.id);
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
        await store.markOutboxFailed(row.organisationId, row.id, errorMessage(error));
      } catch (markError) {
        console.error('[notifications] marquage failed de %s impossible :', row.id, markError);
      }
    }
  }
  return summary;
}
