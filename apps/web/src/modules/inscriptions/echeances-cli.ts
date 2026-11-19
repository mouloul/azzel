import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { terminerAvecBattement } from '@/lib/battement';
import { exigeTls } from '@/db/client';
import { readDatabaseUrl } from '@/modules/iam/env';
import { createOutboxStore, MAX_OUTBOX_ATTEMPTS } from '@/modules/notifications/outbox-store';

import { balayerEcheances } from './echeances';
import { createInscriptionsStore } from './store';

/**
 * Balayage des échéances de preuve, à passer en cron (VPS de production) :
 *   pnpm -F @azzel/web inscriptions:echeances
 *
 * La logique (rappels, puis expirations, puis file d'envoi) vit dans
 * `balayerEcheances`, partagée avec la route `GET /api/cron/echeances` de la
 * recette ; cette commande n'ouvre que sa connexion et rend compte.
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

    // Journal au fil de l'eau : si les expirations lèvent, les rappels déjà
    // commités restent tracés.
    const bilan = await balayerEcheances({ inscriptions, outbox }, new Date(), {
      progression: (etape) => {
        if (etape.etape === 'rappels') {
          console.info(`Rappels de preuve : ${etape.rappels} email(s) enfilé(s).`);
        } else if (etape.etape === 'expirations') {
          console.info(
            `Expirations : ${etape.expirees} inscription(s) expirée(s), ` +
              `${etape.emailsExpiration} email(s) enfilé(s) — autant de places rendues.`,
          );
        }
      },
    });

    const resume = bilan.envoi;
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
  void terminerAvecBattement('ECHEANCES', main, 'inscriptions:echeances');
}
