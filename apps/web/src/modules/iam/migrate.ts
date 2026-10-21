import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { readDatabaseUrl } from './env';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function applyMigrations(sql: postgres.Sql): Promise<string[]> {
  const applied: string[] = [];
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const entries = await readdir(MIGRATIONS_DIR);
  const names = entries.filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    const alreadyApplied = await sql`SELECT name FROM schema_migrations WHERE name = ${name}`;
    if (alreadyApplied.length > 0) {
      continue;
    }
    const content = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    applied.push(name);
  }
  return applied;
}

async function main(): Promise<void> {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    console.error('DATABASE_URL absente : définis-la dans .env (voir .env.example).');
    process.exitCode = 1;
    return;
  }
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const applied = await applyMigrations(sql);
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
