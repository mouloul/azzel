import postgres, { type Sql } from 'postgres';

import { withOrg } from '@/db/org-scope';
import { readDatabaseUrl } from '@/modules/iam/env';
import { DbUnavailableError } from '@/modules/iam/errors';

import { lireClassementsRecord } from '@/modules/chrono/store';
import type { ClassementsRecord } from '@/modules/chrono/domain';

// Story 7.4 — store rapports : TOUTES les données d'un rapport vivent dans
// UNE SEULE transaction withOrg (calque NFR-4 de classements 7.1, partagée
// via lireClassementsRecord : le rapport entier décrit UN instant). Lecture
// seule par-dessus l'arbitrage 4.5/5.x et les dossiers 1.x : aucune nouvelle
// collecte, aucun recalcul. Les détails restent au niveau DOSSARD — jamais
// un nom ni un contact de coureur ne quitte ce module.

/** Inscrits de l'édition par statut français (0006). */
export interface RapportInscritsStatut {
  statut: string;
  total: number;
}

/** Validés par épreuve × taille de t-shirt (dossard JAMAIS requis ici). */
export interface RapportValideTaille {
  epreuveNom: string;
  epreuveSlug: string;
  taille: string;
  total: number;
}

/** Checkpoint de l'édition (mission scan_checkpoint) et coureurs passés distincts. */
export interface RapportCheckpoint {
  titre: string;
  secteurNom: string;
  /** Coureurs RÉSOLUS (validés ∧ numérotés) passés — arbitré, annulations exclues. */
  passes: number;
}

/** Abandon détaillé 5.3 : le dossard et l'épreuve sont résolus par join. */
export interface RapportAbandon {
  epreuveNom: string | null;
  dossard: number | null;
  lieu: string;
  motif: string;
  /** Heure LOCALE déclarée (donnée 5.3, jamais un temps de classement). */
  horodatage: Date;
  auteurEmail: string;
}

/** Portée des partages 7.2 : un agrégat anonyme par jour. */
export interface RapportVisite {
  /** Jour ISO (YYYY-MM-DD) — frontière de l'horloge de la base. */
  jour: string;
  visites: number;
}

/** Lecture cohérente de TOUT ce qu'un rapport 7.4 assemble. */
export interface RapportRecord {
  edition: { id: string; nom: string; slug: string } | null;
  inscritsParStatut: RapportInscritsStatut[];
  validesParTaille: RapportValideTaille[];
  /** Coureurs distincts retirés (arbitré, résolus) — « présents au départ ». */
  retraits: number;
  checkpoints: RapportCheckpoint[];
  abandons: RapportAbandon[];
  visites: RapportVisite[];
  /** Faits classements 7.1, lus dans la MÊME transaction (NFR-4). */
  classements: ClassementsRecord;
}

export interface RapportsStore {
  lireRapport(organisationId: string): Promise<RapportRecord>;
  /**
   * Édition courante seule (nom, slug, date de course) : la note J-10 de la
   * page /admin/rapports en dérive sans payer la lecture complète du rapport.
   */
  lireEdition(organisationId: string): Promise<{
    id: string;
    nom: string;
    slug: string;
    raceDate: Date;
  } | null>;
}

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

const CONNECTION_ERROR_PATTERN =
  /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|connection terminated|database system is starting|database system is shut down/i;

function isConnectionError(error: unknown): boolean {
  if (error instanceof DbUnavailableError) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) {
      return true;
    }
  }
  return error instanceof Error && CONNECTION_ERROR_PATTERN.test(error.message);
}

async function withDb<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isConnectionError(error)) {
      throw new DbUnavailableError(error);
    }
    throw error;
  }
}

/**
 * Édition courante de l'org (calque editionCourante du chrono : race_date
 * DESC, id ASC) + slug pour le nom de fichier + date de course (note J-10).
 */
async function editionCouranteRapport(
  tx: postgres.TransactionSql,
  organisationId: string,
): Promise<{ id: string; nom: string; slug: string; raceDate: Date } | undefined> {
  const editions = await tx<{ id: string; nom: string; slug: string; raceDate: Date }[]>`
    SELECT id, name AS nom, slug, race_date AS "raceDate" FROM edition
    WHERE organisation_id = ${organisationId}
    ORDER BY race_date DESC, id ASC
    LIMIT 1
  `;
  return editions[0];
}

export function createRapportsStore(sql: Sql): RapportsStore {
  return {
    async lireRapport(organisationId: string): Promise<RapportRecord> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const edition = await editionCouranteRapport(tx, organisationId);
          if (!edition) {
            // État ZÉRO cohérent (calque classements) : sections présentes,
            // zéros lisibles — jamais une erreur pour une org sans édition.
            return {
              edition: null,
              inscritsParStatut: [],
              validesParTaille: [],
              retraits: 0,
              checkpoints: [],
              abandons: [],
              visites: [],
              classements: { edition: null, epreuves: [], fraicheur: null },
            };
          }

          const [
            classements,
            inscritsRows,
            validesRows,
            dossardRows,
            retraitRows,
            checkpointRows,
            passageRows,
            abandonRows,
            visiteRows,
          ] = await Promise.all([
            // Faits 7.1 DANS LA MÊME transaction : rangs/temps du rapport
            // décrivent le même instant que les inscrits et les passages.
            lireClassementsRecord(tx, organisationId),
            tx<{ statut: string; total: number }[]>`
              SELECT status AS statut, count(*)::int AS total
              FROM coureur
              WHERE organisation_id = ${organisationId}
                AND edition_id = ${edition.id}
              GROUP BY status
            `,
            // La commande ne part QUE des VALIDÉS — dossard jamais requis
            // (un validé non encore numéroté commande son t-shirt).
            tx<{ epreuve_nom: string; epreuve_slug: string; taille: string; total: number }[]>`
              SELECT e.name AS epreuve_nom, e.slug AS epreuve_slug,
                     c.tshirt_size AS taille, count(*)::int AS total
              FROM coureur c
              JOIN epreuve e ON e.id = c.epreuve_id
              WHERE c.organisation_id = ${organisationId}
                AND c.edition_id = ${edition.id}
                AND c.status = 'validé'
                AND e.organisation_id = ${organisationId}
                AND e.edition_id = ${edition.id}
              GROUP BY e.id, e.name, e.slug, c.tshirt_size
            `,
            // Résolution jeton → dossard (calque etatCourse : validé ∧ jeton
            // ∧ numéroté, épreuve DE l'édition courante — cohérence avec les
            // partants de classements : le retrait d'un coureur dont
            // l'épreuve est étrangère à l'édition reste neutre, retraits ≤
            // somme des partants par construction).
            tx<{ jeton: string; dossard: number }[]>`
              SELECT c.jeton_edossard AS jeton, c.dossard
              FROM coureur c
              JOIN epreuve e ON e.id = c.epreuve_id
              WHERE c.organisation_id = ${organisationId}
                AND c.edition_id = ${edition.id}
                AND c.status = 'validé'
                AND c.jeton_edossard IS NOT NULL
                AND c.dossard IS NOT NULL
                AND e.organisation_id = ${organisationId}
                AND e.edition_id = ${edition.id}
            `,
            tx<{ jeton_coureur: string }[]>`
              SELECT DISTINCT ON (jeton_coureur) jeton_coureur
              FROM terrain_evenement te
              WHERE te.organisation_id = ${organisationId}
                AND te.edition_id = ${edition.id}
                AND te.type = 'retrait'
                AND NOT EXISTS (
                  SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
                )
              ORDER BY jeton_coureur, te.horodatage_reception ASC, te.id ASC
            `,
            tx<{ id: string; titre: string; secteur_nom: string }[]>`
              SELECT m.id, m.titre, s.nom AS secteur_nom
              FROM mission m
              JOIN secteur s ON s.id = m.secteur_id
              WHERE m.organisation_id = ${organisationId}
                AND s.edition_id = ${edition.id}
                AND m.type = 'scan_checkpoint'
              ORDER BY m.debut_le ASC, m.created_at ASC, m.id ASC
            `,
            tx<{ checkpoint_id: string; jeton_coureur: string }[]>`
              SELECT DISTINCT ON (te.checkpoint_id, te.jeton_coureur)
                     te.checkpoint_id, te.jeton_coureur
              FROM terrain_evenement te
              WHERE te.organisation_id = ${organisationId}
                AND te.edition_id = ${edition.id}
                AND te.type = 'passage'
                AND NOT EXISTS (
                  SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
                )
              ORDER BY te.checkpoint_id, te.jeton_coureur,
                       te.horodatage_reception ASC, te.id ASC
            `,
            // Abandons détaillés 5.3 : join jeton → coureur (UNIQUE 0023, une
            // ligne au plus) → épreuve. Le coureur est résolu par la saisie —
            // le LEFT JOIN ne sert que la défense en profondeur.
            tx<{
              epreuve_nom: string | null;
              dossard: number | null;
              lieu: string;
              motif: string;
              horodatage: Date;
              auteur_email: string;
            }[]>`
              SELECT e.name AS epreuve_nom, c.dossard,
                     a.lieu, a.motif, a.horodatage, a.auteur_email
              FROM abandon a
              LEFT JOIN coureur c
                ON c.organisation_id = a.organisation_id
               AND c.edition_id = a.edition_id
               AND c.jeton_edossard = a.jeton_coureur
              LEFT JOIN epreuve e ON e.id = c.epreuve_id
              WHERE a.organisation_id = ${organisationId}
                AND a.edition_id = ${edition.id}
              ORDER BY a.horodatage_reception ASC, a.id ASC
            `,
            // Portée des partages 7.2 : l'agrégat anonyme (org, édition,
            // jour) — le jour vient de l'horloge de la base, jamais du client.
            tx<{ jour: Date; visites: number }[]>`
              SELECT jour, visites
              FROM resultats_visite
              WHERE organisation_id = ${organisationId}
                AND edition_id = ${edition.id}
              ORDER BY jour ASC
            `,
          ]);

          const dossardParJeton = new Map(dossardRows.map((row) => [row.jeton, row.dossard]));

          const retraits = retraitRows.filter((row) =>
            dossardParJeton.has(row.jeton_coureur),
          ).length;

          const passesParCheckpoint = new Map<string, number>();
          for (const row of passageRows) {
            if (!dossardParJeton.has(row.jeton_coureur)) {
              continue;
            }
            passesParCheckpoint.set(
              row.checkpoint_id,
              (passesParCheckpoint.get(row.checkpoint_id) ?? 0) + 1,
            );
          }

          return {
            edition: { id: edition.id, nom: edition.nom, slug: edition.slug },
            inscritsParStatut: inscritsRows.map((row) => ({
              statut: row.statut,
              total: row.total,
            })),
            validesParTaille: validesRows.map((row) => ({
              epreuveNom: row.epreuve_nom,
              epreuveSlug: row.epreuve_slug,
              taille: row.taille,
              total: row.total,
            })),
            retraits,
            checkpoints: checkpointRows.map((row) => ({
              titre: row.titre,
              secteurNom: row.secteur_nom,
              passes: passesParCheckpoint.get(row.id) ?? 0,
            })),
            abandons: abandonRows.map((row) => ({
              epreuveNom: row.epreuve_nom,
              dossard: row.dossard,
              lieu: row.lieu,
              motif: row.motif,
              horodatage: row.horodatage,
              auteurEmail: row.auteur_email,
            })),
            visites: visiteRows.map((row) => ({
              jour: row.jour.toISOString().slice(0, 10),
              visites: row.visites,
            })),
            classements,
          };
        }),
      );
    },

    async lireEdition(organisationId: string) {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const edition = await editionCouranteRapport(tx, organisationId);
          return edition
            ? {
                id: edition.id,
                nom: edition.nom,
                slug: edition.slug,
                raceDate: edition.raceDate,
              }
            : null;
        }),
      );
    },
  };
}

function createUnavailableStore(): RapportsStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return { lireRapport: unavailable, lireEdition: unavailable };
}

export function getRapportsStore(): RapportsStore {
  const globals = globalThis as typeof globalThis & {
    __azzelRapportsStore?: RapportsStore;
  };
  if (globals.__azzelRapportsStore) {
    return globals.__azzelRapportsStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createRapportsStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelRapportsStore = store;
  return store;
}
