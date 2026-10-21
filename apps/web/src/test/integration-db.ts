import postgres from 'postgres';

import { readDatabaseOwnerUrl, readDatabaseUrl } from '@/modules/iam/env';
import { applyAllMigrations } from '@/modules/inscriptions/migrate';

// Story 1.9 — plomberie partagée des suites d'intégration :
// - garde d'URLs unique (résolution + hôtes locaux + même serveur) pour tous les
//   fichiers d'intégration ;
// - la base de test (azzel_test) est créée et migrée EN PROPRIÉTAIRE
//   (DATABASE_OWNER_URL) : le rôle applicatif (0008) doit exister avant l'activation
//   du RLS (0009) ;
// - les stores s'y connectent EN RÔLE APPLICATIF (DATABASE_URL, azzel_app) — la
//   connexion est vérifiée (current_user) pour que la preuve FR-27 ne puisse pas
//   tourner en propriétaire ;
// - `owner` sert aux fixtures et assertions (superuser : bypass RLS).

export const TEST_DATABASE = 'azzel_test';

const ALLOWED_TEST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface TestDatabaseUrls {
  appUrl: URL;
  ownerUrl: URL;
}

function parseUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Résout les deux URLs de test (app + propriétaire). Retourne null → suite SKIPPÉE
 * (message console) ; lève une Error explicite si une URL pointe hors localhost ou
 * si app et propriétaire ne sont pas sur le même serveur.
 */
export function resolveTestDatabaseUrls(label: string): TestDatabaseUrls | null {
  const appUrl = parseUrl(readDatabaseUrl());
  const ownerUrl = parseUrl(readDatabaseOwnerUrl());

  if (appUrl === null && ownerUrl === null) {
    console.warn(`intégration ${label} SKIPPÉE — bash scripts/dev-db.sh up pour l’activer`);
    return null;
  }
  if (appUrl === null) {
    console.warn(
      `intégration ${label} SKIPPÉE — DATABASE_URL absente ou mal formée (voir .env.example)`,
    );
    return null;
  }
  if (ownerUrl === null) {
    console.warn(
      `intégration ${label} SKIPPÉE — DATABASE_OWNER_URL absente ou mal formée (voir .env.example, story 1.9)`,
    );
    return null;
  }

  for (const url of [appUrl, ownerUrl]) {
    if (!ALLOWED_TEST_HOSTS.has(url.hostname)) {
      throw new Error(
        `Base de test refusée : une URL base pointe vers « ${url.hostname} », seules localhost / 127.0.0.1 / ::1 sont autorisées.`,
      );
    }
  }
  if (appUrl.hostname !== ownerUrl.hostname || appUrl.port !== ownerUrl.port) {
    throw new Error(
      `Base de test refusée : DATABASE_URL (${appUrl.host}) et DATABASE_OWNER_URL (${ownerUrl.host}) doivent pointer sur le même serveur.`,
    );
  }
  return { appUrl, ownerUrl };
}

export function databaseUrl(baseUrl: URL, database: string): string {
  const url = new URL(baseUrl.toString());
  url.pathname = `/${database}`;
  return url.toString();
}

export interface AzzelTestConnections {
  owner: postgres.Sql;
  app: postgres.Sql;
}

async function connectAzzelTestDb(ownerUrl: URL, appUrl: URL): Promise<AzzelTestConnections> {
  const owner = postgres(databaseUrl(ownerUrl, TEST_DATABASE), { max: 2 });
  try {
    await applyAllMigrations(owner);
  } catch (error) {
    await owner.end({ timeout: 5 });
    throw error;
  }
  const app = postgres(databaseUrl(appUrl, TEST_DATABASE), { max: 2 });
  try {
    // Preuve de rôle : les stores DOIVENT tourner en azzel_app (RLS appliqué).
    const identity = await app<{ current_user: string }[]>`SELECT current_user`;
    const currentUser = identity[0]?.current_user;
    if (currentUser !== 'azzel_app') {
      throw new Error(
        `Connexion applicative attendue en rôle « azzel_app », obtenue « ${currentUser} » : la preuve FR-27 ne doit pas tourner en propriétaire (DATABASE_URL doit pointer sur azzel_app).`,
      );
    }
  } catch (error) {
    await app.end({ timeout: 5 });
    throw error;
  }
  return { owner, app };
}

/** Se connecte à azzel_test SANS la recréer (suite qui réutilise une base migrée). */
export async function reuseAzzelTestDb(
  ownerUrl: URL,
  appUrl: URL,
): Promise<AzzelTestConnections> {
  return connectAzzelTestDb(ownerUrl, appUrl);
}

/** Recrée azzel_test de zéro (drop + create en propriétaire) puis migre et connecte. */
export async function recreateAzzelTestDb(
  ownerUrl: URL,
  appUrl: URL,
): Promise<AzzelTestConnections> {
  const admin = postgres(databaseUrl(ownerUrl, 'postgres'), { max: 1 });
  try {
    await admin`DROP DATABASE IF EXISTS azzel_test WITH (FORCE)`;
    await admin`CREATE DATABASE azzel_test`;
  } finally {
    await admin.end({ timeout: 5 });
  }
  return connectAzzelTestDb(ownerUrl, appUrl);
}

export async function closeAzzelTestDb(connections: AzzelTestConnections): Promise<void> {
  await connections.owner.end({ timeout: 5 }).catch(() => {});
  await connections.app.end({ timeout: 5 }).catch(() => {});
}
