import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { exigeTls } from '@/db/client';

import { APP_PASSWORD_ENV_NAME, DEV_APP_PASSWORD_FALLBACK } from '../iam/constants';
import { readDatabaseOwnerUrl, readEnv } from '../iam/env';

const MODULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Dossiers de migrations, dans l'ordre du runner — exportés pour que les suites
// d'intégration comptent les fichiers à la source (toute nouvelle migration est
// couverte sans toucher aux tests).
export const MIGRATION_DIRS = [
  path.join(MODULES_DIR, 'iam', 'migrations'),
  path.join(MODULES_DIR, 'inscriptions', 'migrations'),
  path.join(MODULES_DIR, 'missions', 'migrations'),
  path.join(MODULES_DIR, 'contenus', 'migrations'),
  path.join(MODULES_DIR, 'retour-images', 'migrations'),
  path.join(MODULES_DIR, 'chrono', 'migrations'),
  path.join(MODULES_DIR, 'tracking', 'migrations'),
];

// Placeholder du mot de passe du rôle applicatif dans 0008_rls_roles.sql :
// remplacé par AZZEL_APP_PASSWORD (défaut « azzel ») avant exécution.
const APP_PASSWORD_PLACEHOLDER = "'__AZZEL_APP_PASSWORD__'";

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Remplace le placeholder du mot de passe applicatif (migration 0008).
 * En production, AZZEL_APP_PASSWORD est EXIGÉE : un repli silencieux sur « azzel »
 * donnerait un rôle azzel_app au mot de passe public, et le RLS ne protégerait
 * plus rien. En développement, le repli documenté est conservé.
 */
export function injectAppPassword(content: string): string {
  if (!content.includes(APP_PASSWORD_PLACEHOLDER)) {
    return content;
  }
  const password = readEnv(APP_PASSWORD_ENV_NAME);
  if (password) {
    return content.split(APP_PASSWORD_PLACEHOLDER).join(sqlLiteral(password));
  }
  if (readEnv('NODE_ENV') === 'production') {
    throw new Error(
      `${APP_PASSWORD_ENV_NAME} absente : en production, le mot de passe du rôle applicatif ` +
        'azzel_app doit être fourni explicitement (aucune valeur par défaut). ' +
        'Définis-la puis relance pnpm -F @azzel/web db:migrate.',
    );
  }
  return content
    .split(APP_PASSWORD_PLACEHOLDER)
    .join(sqlLiteral(DEV_APP_PASSWORD_FALLBACK));
}

export async function applyAllMigrations(sql: postgres.Sql): Promise<string[]> {
  const applied: string[] = [];
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const entries: { name: string; dir: string }[] = [];
  for (const dir of MIGRATION_DIRS) {
    const names = await readdir(dir);
    for (const name of names) {
      if (name.endsWith('.sql')) {
        entries.push({ name, dir });
      }
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const { name, dir } of entries) {
    const alreadyApplied = await sql`SELECT name FROM schema_migrations WHERE name = ${name}`;
    if (alreadyApplied.length > 0) {
      continue;
    }
    const content = injectAppPassword(await readFile(path.join(dir, name), 'utf8'));
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    applied.push(name);
  }
  return applied;
}

async function main(): Promise<void> {
  // Les migrations tournent en propriétaire (DATABASE_OWNER_URL) : 0008 crée le
  // rôle applicatif, 0009 active FORCE RLS — impossible via la connexion azzel_app.
  const databaseUrl = readDatabaseOwnerUrl();
  if (!databaseUrl) {
    console.error(
      'DATABASE_OWNER_URL absente : définis-la dans .env (voir .env.example, story 1.9).',
    );
    process.exitCode = 1;
    return;
  }
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, ...(exigeTls(databaseUrl) ? { ssl: 'require' as const } : {}) });
  try {
    const applied = await applyAllMigrations(sql);
    if (applied.length === 0) {
      console.info('Migrations déjà appliquées : rien à faire.');
    } else {
      for (const name of applied) {
        console.info(`Migration appliquée : ${name}`);
      }
    }
  } catch (error) {
    console.error('Échec des migrations :', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  void main();
}
