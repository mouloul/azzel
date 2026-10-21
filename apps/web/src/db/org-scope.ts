import type postgres from 'postgres';

import { DEFAULT_ORGANISATION_SLUG } from '../modules/iam/constants';

// Socle multi-organisation (story 1.9, AD-4) : toute requête métier s'exécute dans
// une transaction qui pose le GUC `app.organisation_id` — les politiques RLS
// (migration 0009) filtrent structurellement tout ce qui n'est pas de l'org courante.

export const ORGANISATION_GUC = 'app.organisation_id';

export type OrgScopedTx = postgres.TransactionSql;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exécute `fn` dans une transaction où le GUC `app.organisation_id` vaut
 * `organisationId` (portée transaction : set_config(..., true)). Toutes les
 * requêtes métier des stores passent par ici — les WHERE organisation_id
 * applicatifs sont conservés en défense en profondeur.
 */
export async function withOrg<T>(
  sql: postgres.Sql,
  organisationId: string,
  fn: (tx: OrgScopedTx) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(organisationId)) {
    throw new Error(
      `withOrg : organisationId « ${organisationId} » n'est pas un UUID valide (GUC ${ORGANISATION_GUC})`,
    );
  }
  const result = await sql.begin(async (tx) => {
    await tx`SELECT set_config(${ORGANISATION_GUC}, ${organisationId}, true)`;
    return await fn(tx);
  });
  // sql.begin est typé Promise<UnwrapPromiseArray<T>> — réduit à T à l'exécution.
  return result as T;
}

/**
 * Lecture publique de l'organisation par slug, SANS GUC — exception documentée
 * (spec 1.9) : résolution de l'organisation par défaut pour les flows pré-session
 * (l'existence d'une organisation n'est pas sensible ; écritures scopées en base).
 */
export async function findOrganisationIdBySlug(
  sql: postgres.Sql,
  slug: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM organisation WHERE slug = ${slug} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/** Tous les ids d'organisation (lecture publique, sans GUC) — worker outbox, CLI. */
export async function listOrganisationIds(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM organisation ORDER BY created_at ASC
  `;
  return rows.map((row) => row.id);
}

/**
 * Exécute `fn` avec le GUC de l'organisation par défaut V1 (slug `ait-aissi`),
 * résolue par slug hors GUC. Flows pré-session : demande et vérification du code.
 */
export async function withDefaultOrg<T>(
  sql: postgres.Sql,
  fn: (tx: OrgScopedTx) => Promise<T>,
): Promise<T> {
  const organisationId = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
  if (!organisationId) {
    throw new Error(
      `Organisation « ${DEFAULT_ORGANISATION_SLUG} » absente : exécute pnpm -F @azzel/web db:migrate`,
    );
  }
  return withOrg(sql, organisationId, fn);
}
