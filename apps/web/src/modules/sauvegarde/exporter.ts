import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type postgres from 'postgres';

import { isSafeStorageKey, sha256Hex, type ProofStore } from '@/modules/inscriptions/proof-store';

/**
 * Export des preuves pour la sauvegarde (story 12.2).
 *
 * `scripts/sauvegarde.sh` fait le dump Postgres D'ABORD, puis appelle cet
 * export : toute preuve référencée par le dump est donc présente ici, les
 * fichiers n'étant jamais supprimés hors rollback.
 *
 * Disposition écrite dans `dossier` :
 *   preuves/<clé de stockage>   octets relus par `ProofStore.read`
 *   manifeste.json              horodatage, dernière migration, comptages par
 *                               table de `public`, clés + sha256, avertissements
 *
 * Aucune donnée personnelle : le manifeste ne porte que des clés opaques, des
 * empreintes et des comptages.
 */

export const MANIFESTE_VERSION = 1;
export const MANIFESTE_FICHIER = 'manifeste.json';
export const PREUVES_SOUS_DOSSIER = 'preuves';

export interface LignePreuve {
  storageKey: string;
  sha256: string;
  status: string;
}

export interface Inventaire {
  derniereMigration: string | null;
  comptages: Record<string, number>;
  preuves: LignePreuve[];
}

export interface PreuveManifeste {
  cle: string;
  sha256: string;
  statut: string;
}

export interface Manifeste {
  version: number;
  horodatage: string;
  derniereMigration: string | null;
  comptages: Record<string, number>;
  preuves: PreuveManifeste[];
  avertissements: string[];
}

/**
 * Export refusé : une preuve active manque, ou des octets ne correspondent pas
 * à `preuve.sha256`. Rien ne doit partir — une archive incomplète passerait
 * pour une sauvegarde valide. Les clés (opaques) sont nommées.
 */
export class ExportPreuvesError extends Error {
  constructor(readonly erreurs: string[]) {
    super(`export des preuves refusé :\n- ${erreurs.join('\n- ')}`);
    this.name = 'ExportPreuvesError';
  }
}

/** Seule une preuve active est indispensable : son absence bloque la sauvegarde. */
const STATUT_INDISPENSABLE = 'active';

function citerIdentifiant(nom: string): string {
  return `"${nom.replaceAll('"', '""')}"`;
}

/**
 * Lit, dans un instantané unique, ce que le manifeste décrit. Exige un rôle qui
 * contourne le RLS (`DATABASE_OWNER_URL`) : sous le rôle applicatif, les tables
 * `FORCE ROW LEVEL SECURITY` renverraient zéro ligne, et la sauvegarde
 * paraîtrait complète sans contenir une seule preuve.
 */
export async function lireInventaire(sql: postgres.Sql): Promise<Inventaire> {
  const roles = await sql<{ contourne: boolean }[]>`
    SELECT (rolsuper OR rolbypassrls) AS contourne FROM pg_roles WHERE rolname = current_user
  `;
  if (roles[0]?.contourne !== true) {
    throw new Error(
      'le rôle connecté ne contourne pas le RLS : comptages et preuves seraient filtrés. ' +
        'L’export passe par DATABASE_OWNER_URL (rôle propriétaire), jamais par DATABASE_URL.',
    );
  }

  return sql.begin('isolation level repeatable read read only', async (tx) => {
    const migrations = await tx<{ name: string }[]>`
      SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1
    `;
    const tables = await tx<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const comptages: Record<string, number> = {};
    for (const { tablename } of tables) {
      const lignes = await tx.unsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM public.${citerIdentifiant(tablename)}`,
      );
      comptages[tablename] = lignes[0]?.n ?? 0;
    }
    const preuves = await tx<LignePreuve[]>`
      SELECT storage_key AS "storageKey", sha256, status
      FROM preuve
      ORDER BY created_at, id
    `;
    return {
      derniereMigration: migrations[0]?.name ?? null,
      comptages,
      preuves: preuves.map((ligne) => ({
        storageKey: ligne.storageKey,
        sha256: ligne.sha256,
        status: ligne.status,
      })),
    };
  });
}

/**
 * Écrit chaque preuve sous son nom de clé, vérifie son sha256, puis le
 * manifeste. Le manifeste n'est écrit que si aucune erreur bloquante n'a été
 * relevée : sans lui, le script n'archive rien.
 */
export async function ecrireExport(
  inventaire: Inventaire,
  store: ProofStore,
  dossier: string,
  maintenant: Date = new Date(),
): Promise<Manifeste> {
  const dossierPreuves = path.join(dossier, PREUVES_SOUS_DOSSIER);
  await mkdir(dossierPreuves, { recursive: true });

  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const preuves: PreuveManifeste[] = [];
  const dejaEcrites = new Set<string>();

  for (const ligne of inventaire.preuves) {
    const cle = ligne.storageKey;
    // Une clé hors motif n'est jamais lue ni écrite : elle ne doit pas pouvoir
    // sortir du dossier d'export. `ProofStore.read` la refuse de toute façon.
    const octets = isSafeStorageKey(cle) ? await store.read(cle) : null;
    if (octets === null) {
      const message = `preuve ${ligne.status} sans fichier : ${cle}`;
      if (ligne.status === STATUT_INDISPENSABLE) {
        erreurs.push(message);
      } else {
        avertissements.push(message);
      }
      continue;
    }
    const empreinte = sha256Hex(octets);
    if (empreinte !== ligne.sha256) {
      erreurs.push(`sha256 divergent pour la preuve ${ligne.status} : ${cle}`);
      continue;
    }
    if (!dejaEcrites.has(cle)) {
      await writeFile(path.join(dossierPreuves, cle), octets);
      dejaEcrites.add(cle);
    }
    preuves.push({ cle, sha256: empreinte, statut: ligne.status });
  }

  if (erreurs.length > 0) {
    throw new ExportPreuvesError(erreurs);
  }

  const manifeste: Manifeste = {
    version: MANIFESTE_VERSION,
    horodatage: maintenant.toISOString(),
    derniereMigration: inventaire.derniereMigration,
    comptages: inventaire.comptages,
    preuves,
    avertissements,
  };
  await writeFile(
    path.join(dossier, MANIFESTE_FICHIER),
    `${JSON.stringify(manifeste, null, 2)}\n`,
  );
  return manifeste;
}

/** Inventaire de la base puis écriture des preuves et du manifeste dans `dossier`. */
export async function exporterPreuves(
  sql: postgres.Sql,
  store: ProofStore,
  dossier: string,
): Promise<Manifeste> {
  const inventaire = await lireInventaire(sql);
  return ecrireExport(inventaire, store, dossier);
}
