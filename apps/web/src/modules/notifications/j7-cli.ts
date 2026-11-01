import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { readDatabaseUrl } from '@/modules/iam/env';
import { createInscriptionsStore } from '@/modules/inscriptions/store';

import { createOutboxStore, MAX_OUTBOX_ATTEMPTS } from './outbox-store';
import { planifierRappelsJ7 } from './rappel-j7';
import { clampOutboxLimit, DEFAULT_OUTBOX_LIMIT, processOutbox } from './worker';

// Rappel batterie J-7 (cron VPS, comme emails:send) :
//   pnpm -F @azzel/web emails:j7 [limite]
// Planifie (fenêtre J-7 ≤ aujourd'hui < course, coureurs validés, idempotent)
// PUIS délègue l'envoi au worker existant.
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
      console.error('Limite invalide : donne un entier positif (ex. emails:j7 50).');
      process.exitCode = 1;
      return;
    }
    limit = parsed;
  }
  // `prepare: false` : DATABASE_URL peut pointer sur un pooler en mode
  // transaction, qui ne supporte pas les requêtes préparées nommées.
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
  try {
    const outbox = createOutboxStore(sql);
    const inscriptions = createInscriptionsStore(sql);
    const planifie = await planifierRappelsJ7({ outbox, inscriptions });
    if (planifie.erreur !== null) {
      console.error('Planification J-7 incomplète :', planifie.erreur);
      process.exitCode = 1;
    }
    console.info(
      `Rappels J-7 : ${planifie.enfiles} email(s) enfilé(s)` +
        (planifie.dejaEnfiles > 0 ? `, ${planifie.dejaEnfiles} déjà enfilé(s)` : '') +
        ` — ${planifie.organisationsDansFenetre} organisation(s) dans la fenêtre` +
        (planifie.horsFenetre > 0
          ? `, ${planifie.horsFenetre} hors fenêtre (avant J-7 ou course passée)`
          : '') +
        '.',
    );
    // Sans limite explicite : le passage couvre les rappels J-7 fraîchement
    // enfilés (plus les lignes déjà présentes de la même vague) PLUS la marge
    // habituelle — pas de goutte-à-goutte 20 par passage.
    const limiteOutbox =
      limit ?? clampOutboxLimit(
        planifie.enfiles + planifie.dejaEnfiles + DEFAULT_OUTBOX_LIMIT,
      );
    const summary = await processOutbox(limiteOutbox, { store: outbox });
    if (summary.storeError !== null) {
      console.error('File d’envoi injoignable :', summary.storeError);
      process.exitCode = 1;
      return;
    }
    console.info(
      `File d’envoi : ${summary.processed} email(s) traité(s) — ${summary.sent} envoyé(s), ${summary.failed} en échec.`,
    );
    try {
      const deadLetters = await outbox.countDeadLetters();
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
    console.error('emails:j7 a échoué :', error);
    process.exitCode = 1;
  });
}
