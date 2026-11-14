import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { exigeTls } from '@/db/client';
import { readEnv } from '@/modules/iam/env';
import { getProofStore } from '@/modules/inscriptions/proof-store';

import { ExportPreuvesError, exporterPreuves } from './exporter';

/**
 * Export des preuves vers un dossier, appelé par `scripts/sauvegarde.sh`
 * après le dump (story 12.2) :
 *   pnpm -F @azzel/web preuves:exporter <dossier absolu>
 *
 * Connexion : `DATABASE_OWNER_URL` seulement — jamais `DATABASE_URL`, dont le
 * rôle applicatif est filtré par le RLS. Stockage : `getProofStore()`, donc la
 * même configuration que l'application (`PROOF_STORAGE_*` ou `STORAGE_DIR`).
 *
 * Le journal ne porte que des comptages ; les clés opaques n'apparaissent
 * qu'en cas d'échec, pour désigner la preuve en cause.
 */
async function main(): Promise<void> {
  const cible = process.argv[2];
  if (!cible) {
    console.error('Usage : pnpm -F @azzel/web preuves:exporter <dossier>');
    process.exitCode = 1;
    return;
  }
  const dossier = path.resolve(cible);

  const ownerUrl = readEnv('DATABASE_OWNER_URL');
  if (!ownerUrl) {
    console.error('DATABASE_OWNER_URL absente : définis-la (voir .env.example).');
    process.exitCode = 1;
    return;
  }

  // Lève en nommant la variable si la configuration du stockage est incomplète.
  const store = getProofStore();

  const sql = postgres(ownerUrl, {
    max: 1,
    connect_timeout: 10,
    prepare: false,
    ...(exigeTls(ownerUrl) ? { ssl: 'require' as const } : {}),
  });
  try {
    const manifeste = await exporterPreuves(sql, store, dossier);
    const tables = Object.keys(manifeste.comptages).length;
    console.info(
      `Preuves exportées : ${manifeste.preuves.length} fichier(s) vérifié(s) par sha256, ` +
        `${tables} table(s) comptée(s), dernière migration ${manifeste.derniereMigration ?? '(aucune)'}.`,
    );
    if (manifeste.avertissements.length > 0) {
      console.warn(
        `${manifeste.avertissements.length} avertissement(s) consigné(s) dans le manifeste ` +
          '(preuve non active sans fichier).',
      );
    }
  } catch (error) {
    if (error instanceof ExportPreuvesError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
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
    console.error('preuves:exporter a échoué :', error);
    process.exitCode = 1;
  });
}
