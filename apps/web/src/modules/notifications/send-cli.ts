import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { exigeTls } from '@/db/client';

import { readDatabaseUrl } from '@/modules/iam/env';

import { createOutboxStore, MAX_OUTBOX_ATTEMPTS } from './outbox-store';
import { processOutbox } from './worker';

// Rejeu manuel / cron VPS : pnpm -F @azzel/web emails:send [limite]
async function main(): Promise<void> {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    console.error('DATABASE_URL absente : définis-la dans .env (voir .env.example).');
    process.exitCode = 1;
    return;
  }
  const rawLimit = process.argv[2];
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      console.error('Limite invalide : donne un entier positif (ex. emails:send 50).');
      process.exitCode = 1;
      return;
    }
    limit = parsed;
  }
  // `prepare: false` : DATABASE_URL peut pointer sur un pooler en mode
  // transaction, qui ne supporte pas les requêtes préparées nommées.
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false, ...(exigeTls(databaseUrl) ? { ssl: 'require' as const } : {}) });
  try {
    const store = createOutboxStore(sql);
    const summary = await processOutbox(limit, { store });
    if (summary.storeError !== null) {
      console.error('File d’envoi injoignable :', summary.storeError);
      process.exitCode = 1;
      return;
    }
    console.info(
      `File d’envoi : ${summary.processed} email(s) traité(s) — ${summary.sent} envoyé(s), ${summary.failed} en échec.`,
    );
    try {
      const deadLetters = await store.countDeadLetters();
      if (deadLetters > 0) {
        console.info(
          `${deadLetters} email(s) en impasse (≥ ${MAX_OUTBOX_ATTEMPTS} tentatives) — inspectez la table email_outbox.`,
        );
      }
    } catch (error) {
      console.error('Comptage des emails en impasse impossible :', error);
    }
    if (summary.failed > 0) {
      console.info(
        'Les emails en échec restent dans la file : relance emails:send après inspection.',
      );
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Résout les symlinks pnpm (node_modules/.bin) avant comparaison avec import.meta.url.
const invokedDirectly = (() => {
  if (typeof process.argv[1] !== 'string') {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  void main().catch((error) => {
    console.error('emails:send a échoué :', error);
    process.exitCode = 1;
  });
}
