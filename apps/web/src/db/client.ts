import postgres, { type Sql } from 'postgres';

import { readDatabaseUrl, readEnv } from '@/modules/iam/env';

/**
 * Fabrique de connexion applicative unique (story 8.1).
 *
 * Avant ce point d'entrée, dix modules ouvraient chacun leur pool `max: 5` sur
 * la même base : jusqu'à cinquante connexions par instance de processus, et
 * aucun ne désactivait les requêtes préparées. Derrière un pooler en mode
 * transaction — la cible de l'épopée 8 — les requêtes préparées nommées ne sont
 * pas supportées : des erreurs `prepared statement already exists` surviennent
 * dès qu'une connexion est recyclée.
 *
 * Le pool est mémoïsé par `globalThis` (même motif que les stores) pour
 * survivre au rechargement à chaud de Next.
 *
 * Hors périmètre volontaire : les CLI (`migrate`, `send-cli`, `j7-cli`) et les
 * utilitaires de test gardent leur connexion propre, de courte vie.
 */

/** Taille de pool hors serverless — valeur historique des stores, inchangée. */
export const POOL_MAX_LOCAL = 5;

/**
 * Taille de pool en serverless : chaque instance de fonction est une instance
 * de processus, et le plafond de connexions du free tier est vite atteint.
 */
export const POOL_MAX_SERVERLESS = 1;

type PoolOptions = postgres.Options<Record<string, postgres.PostgresType>>;

/** Variables posées par les plateformes serverless (Vercel, Lambda). */
const SERVERLESS_ENV_NAMES = ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME'] as const;

export function isServerlessRuntime(): boolean {
  return SERVERLESS_ENV_NAMES.some((name) => readEnv(name) !== null);
}

/**
 * Options du pool applicatif. `prepare: false` est posé inconditionnellement :
 * un comportement unique entre local et hébergé vaut mieux qu'un écart qui ne
 * se révèle qu'en production.
 */
/** Hôtes considérés comme locaux : eux seuls peuvent se passer de chiffrement. */
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * Une base distante se joint en TLS, sans exception : sinon le mot de passe et
 * les données personnelles des coureurs traversent le réseau en clair. Certains
 * hébergeurs l'exigent et refusent la connexion — Supabase répond
 * « SSL connection is required » sur sa connexion directe — mais d'autres
 * acceptent le clair en silence, ce qui est bien pire. On ne s'en remet donc
 * pas au serveur, et pas davantage à un paramètre d'URL que quelqu'un doit
 * penser à écrire.
 */
export function exigeTls(databaseUrl: string): boolean {
  try {
    return !HOTES_LOCAUX.has(new URL(databaseUrl).hostname);
  } catch {
    // URL illisible : on chiffre, le repli sûr n'est jamais le clair.
    return true;
  }
}

/**
 * Options du pool applicatif. `prepare: false` est posé inconditionnellement :
 * un comportement unique entre local et hébergé vaut mieux qu'un écart qui ne
 * se révèle qu'en production.
 */
export function databasePoolOptions(databaseUrl?: string): PoolOptions {
  const options: PoolOptions = {
    max: isServerlessRuntime() ? POOL_MAX_SERVERLESS : POOL_MAX_LOCAL,
    connect_timeout: 5,
    idle_timeout: 20,
    prepare: false,
  };
  if (databaseUrl !== undefined && exigeTls(databaseUrl)) {
    options.ssl = 'require';
  }
  return options;
}

type DbGlobals = typeof globalThis & { __azzelDbClient?: Sql };

/**
 * Pool applicatif partagé, ou `null` si `DATABASE_URL` est absente — chaque
 * module sert alors son store indisponible, sans exception à l'import.
 *
 * L'absence n'est pas mémoïsée : seul un pool réellement ouvert l'est.
 */
export function getDbClient(): Sql | null {
  const globals = globalThis as DbGlobals;
  if (globals.__azzelDbClient) {
    return globals.__azzelDbClient;
  }
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }
  const sql = postgres(databaseUrl, databasePoolOptions(databaseUrl));
  globals.__azzelDbClient = sql;
  return sql;
}

/**
 * Tests uniquement : oublie le pool mémoïsé (isolation entre cas).
 *
 * N'appelle PAS `sql.end()` : les suites doublent le module `postgres`, il n'y
 * a aucune connexion réelle à fermer. Sur un pool réel, les connexions
 * resteraient ouvertes jusqu'à la fin du processus.
 */
export function resetDbClientForTests(): void {
  delete (globalThis as DbGlobals).__azzelDbClient;
}
