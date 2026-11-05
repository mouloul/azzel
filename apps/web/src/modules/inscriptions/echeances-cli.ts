import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { exigeTls } from '@/db/client';
import { readDatabaseUrl } from '@/modules/iam/env';
import { createOutboxStore, MAX_OUTBOX_ATTEMPTS } from '@/modules/notifications/outbox-store';
import {
  clampOutboxLimit,
  DEFAULT_OUTBOX_LIMIT,
  processOutbox,
} from '@/modules/notifications/worker';

import { createInscriptionsStore } from './store';

/**
 * Balayage des échéances de preuve, à passer en cron.
 *
 * Deux gestes, dans cet ordre : rappeler ceux dont l'échéance tombe dans les
 * 24 heures, puis expirer ceux qui l'ont dépassée. L'ordre compte — l'inverse
 * enverrait un rappel à quelqu'un qui vient d'expirer.
 *
 * Entièrement idempotent : le passage en « expirée » ne retrouve plus les
 * lignes du passage précédent, et les index uniques partiels absorbent tout
 * doublon d'email. Un cron horaire, ou rejoué dix fois, donne le même état.
 */
async function main(): Promise<void> {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    console.error('DATABASE_URL absente : définis-la dans .env (voir .env.example).');
    process.exitCode = 1;
    return;
  }
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    prepare: false,
    ...(exigeTls(databaseUrl) ? { ssl: 'require' as const } : {}),
  });
  try {
    const inscriptions = createInscriptionsStore(sql);
    const outbox = createOutboxStore(sql);
    const maintenant = new Date();

    const rappels = await inscriptions.enfilerRappelsPreuve(maintenant);
    console.info(`Rappels de preuve : ${rappels} email(s) enfilé(s).`);

    const bilan = await inscriptions.expirerInscriptionsEchues(maintenant);
    console.info(
      `Expirations : ${bilan.expirees} inscription(s) expirée(s), ` +
        `${bilan.emailsEnfiles} email(s) enfilé(s) — autant de places rendues.`,
    );

    const limite = clampOutboxLimit(rappels + bilan.emailsEnfiles + DEFAULT_OUTBOX_LIMIT);
    const resume = await processOutbox(limite, { store: outbox });
    if (resume.storeError !== null) {
      console.error('File d’envoi injoignable :', resume.storeError);
      process.exitCode = 1;
      return;
    }
    console.info(
      `File d’envoi : ${resume.processed} email(s) traité(s) — ${resume.sent} envoyé(s), ${resume.failed} en échec.`,
    );
    try {
      const impasses = await outbox.countDeadLetters();
      if (impasses > 0) {
        console.info(
          `${impasses} email(s) en impasse (≥ ${MAX_OUTBOX_ATTEMPTS} tentatives) — inspectez la table email_outbox.`,
        );
      }
    } catch (error) {
      console.error('Comptage des emails en impasse impossible :', error);
    }
    if (resume.failed > 0) {
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
    console.error('inscriptions:echeances a échoué :', error);
    process.exitCode = 1;
  });
}
