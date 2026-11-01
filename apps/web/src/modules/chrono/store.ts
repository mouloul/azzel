import { randomBytes } from 'node:crypto';

import type postgres from 'postgres';
import type { Sql } from 'postgres';

import {
  MOTIF_REJET_CHECKPOINT_INCONNU,
  MOTIF_REJET_COUREUR_INCONNU,
  type EvenementSyncTerrain,
} from '@azzel/shared';

import { getDbClient } from '@/db/client';
import { findOrganisationIdBySlug, withOrg } from '@/db/org-scope';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { DbUnavailableError } from '@/modules/iam/errors';
import { sha256Hex } from '@/modules/iam/service';

import type {
  AbandonRecord,
  AlerteHorsDelais,
  AnnulationResultat,
  AppareilRecord,
  ClassementsRecord,
  EpreuveHeureDepartRecord,
  EtatCourseRecord,
  MotifAbandon,
  TerrainEvenementRecord,
} from './domain';
import { PLAFOND_APPAREILS_PAR_ORG, calculerOffsetEstimeMs, estUuidValide } from './domain';
import {
  AbandonAvantDepartError,
  AbandonDejaAbandonneError,
  AbandonDejaArriveError,
  AbandonDossardInconnuError,
  AbandonPasPartiError,
  AnnulationEvenementIntrouvableError,
  AnnulationRetraitRefuseError,
  AppareilRevokedError,
  HeuresDepartEpreuveInconnueError,
  HeuresDepartSansEditionError,
  PlafondAppareilsError,
} from './errors';

// Story 4.5 — store chrono : l'ingestion d'un lot entier vit dans UNE SEULE
// transaction withOrg (résolution des jetons + insertions idempotentes) — un
// échec DB n'importe rien. La recherche d'appareil par hash reste HORS GUC
// (pattern 0011 : le secret précède l'organisation, la sync n'a pas de session).

export type StatutInsertion = 'accepté' | 'déjà-connu' | { rejeté: string };

export interface ChronoStore {
  /** Hors GUC (pattern 0011) : résout l'org depuis le secret. */
  trouverAppareilParHash(jetonHash: string): Promise<{
    id: string;
    organisationId: string;
    appareilClient: string;
    revokedAt: Date | null;
  } | null>;
  /** Find-or-create par appareil_client (org) ; rotation du jeton si connu. */
  enregistrerAppareil(input: {
    organisationId: string;
    appareilClient: string;
  }): Promise<{ id: string; jeton: string; rotation: boolean }>;
  rafraichirLastSync(input: {
    organisationId: string;
    appareilId: string;
    maintenant: Date;
  }): Promise<void>;
  /** Résout puis ingère le lot : JAMAIS de doublon visible (ON CONFLICT). */
  insererLot(input: {
    organisationId: string;
    evenements: EvenementSyncTerrain[];
    reception: Date;
  }): Promise<StatutInsertion[]>;
  /** Arbitrage AD-3 : le PREMIER reçu (horodatage serveur) fait foi. */
  premierRecu(input: {
    organisationId: string;
    editionId: string;
    jeton: string;
    checkpointId: string | null;
  }): Promise<TerrainEvenementRecord | null>;
  listerAppareils(organisationId: string): Promise<AppareilRecord[]>;
  revoquerAppareil(input: {
    organisationId: string;
    appareilId: string;
    maintenant: Date;
  }): Promise<AppareilRecord | null>;
  /** Story 5.1 — agrégats PC course (lecture seule, arbitrage AD-3, org-scopés). */
  etatCourse(organisationId: string): Promise<EtatCourseRecord>;
  /**
   * Story 5.3 — saisie d'un abandon : résolution dossard, contraintes de
   * course et insertion dans UNE transaction (AD-3 : le PREMIER reçu gagne).
   */
  saisirAbandon(input: {
    organisationId: string;
    dossard: number;
    lieu: string;
    motif: MotifAbandon;
    /** Heure LOCALE saisie (donnée déclarative) — déjà convertie ISO par le client. */
    horodatage: Date;
    auteurEmail: string;
    /** Heure serveur : base de l'arbitrage (horodatage_reception). */
    maintenant: Date;
  }): Promise<AbandonRecord>;
  /**
   * Story 5.4 — annulation auditable d'un PASSAGE : l'événement terrain reste
   * INTACT (AD-8), l'annulation est un événement séparé (UNIQUE evenement_id,
   * idempotente, horodatage = DEFAULT now() SQL). Résout la cible dans
   * l'org/édition courante (retrait → 409 dédié, introuvable → 404) et rend
   * dossard/checkpoint pour le message PC.
   */
  annulerPassage(input: {
    organisationId: string;
    evenementId: string;
    motif: string;
    auteurEmail: string;
  }): Promise<AnnulationResultat>;
  /**
   * Story 7.1 — classements par épreuve de l'édition courante, lus en UNE
   * SEULE transaction (NFR-4 : même instant pour partants, arrivées, abandons
   * et heures de départ — jamais un classement partiel incohérent). Lecture
   * seule au-dessus de l'arbitrage AD-3 : le service calcule rangs et temps.
   */
  classements(organisationId: string): Promise<ClassementsRecord>;
  /** Story 7.1 — épreuves de l'édition courante avec leur heure de départ. */
  listerHeuresDepart(organisationId: string): Promise<{
    edition: { id: string; nom: string } | null;
    epreuves: EpreuveHeureDepartRecord[];
  }>;
  /**
   * Story 7.1 — enregistrement des heures de départ officielles : UNE
   * transaction avecOrg, épreuves résolues dans l'org/édition courante (une
   * inconnue → erreur champ), mise à jour ligne par ligne. Retourne l'état
   * SERVEUR complet (la carte se resynchronise dessus).
   */
  enregistrerHeuresDepart(input: {
    organisationId: string;
    heures: { epreuveId: string; heureDepart: Date | null }[];
  }): Promise<EpreuveHeureDepartRecord[]>;
  /**
   * Story 7.2 — id de l'organisation publique par défaut (slug V1) : lecture
   * pré-session hors GUC (pattern readDefaultOrgPartenaires, exception
   * documentée spec 1.9), mémoïsée slug → id.
   */
  organisationParDefautId(): Promise<string | null>;
  /**
   * Story 7.3 — id de l'ÉDITION COURANTE de l'org (calque editionCourante :
   * race_date DESC, id ASC) : la carte publique scope traces ET positions à
   * cette édition. Sans édition : null (état zéro côté service).
   */
  editionCouranteId(organisationId: string): Promise<string | null>;
  /**
   * Story 7.2 — comptage ANONYME d'une visite partagée : upsert atomique (+1)
   * de l'agrégat (organisation, édition, jour) en UNE transaction withOrg.
   * Aucune donnée personnelle ne transite ici (ni IP, ni user-agent) — le
   * rapport 7.4 lira les agrégats, personne d'autre.
   */
  compterVisitePartage(organisationId: string): Promise<void>;
}

/** Jeton BRUT du canal sync : 256 bits, base64url — hashé avant toute base. */
export function genererJetonAppareil(): string {
  return randomBytes(32).toString('base64url');
}

export function hashJetonAppareil(jeton: string): string {
  return sha256Hex(jeton);
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

interface AppareilRow {
  id: string;
  organisation_id: string;
  appareil_client: string;
  revoked_at: Date | null;
  last_sync_at: Date | null;
  created_at: Date;
}

interface TerrainEvenementRow {
  id: string;
  cle_idempotence: string;
  type: 'retrait' | 'passage';
  edition_id: string;
  jeton_coureur: string;
  checkpoint_id: string | null;
  horodatage_appareil: Date;
  horodatage_reception: Date;
  offset_estime_ms: string | number;
  appareil_id: string;
}

function toTerrainEvenementRecord(row: TerrainEvenementRow): TerrainEvenementRecord {
  return {
    id: row.id,
    cleIdempotence: row.cle_idempotence,
    type: row.type,
    editionId: row.edition_id,
    jetonCoureur: row.jeton_coureur,
    checkpointId: row.checkpoint_id,
    horodatageAppareil: row.horodatage_appareil,
    horodatageReception: row.horodatage_reception,
    offsetEstimeMs: Number(row.offset_estime_ms),
    appareilId: row.appareil_id,
  };
}

function toAppareilRecord(row: AppareilRow): AppareilRecord {
  return {
    id: row.id,
    appareilClient: row.appareil_client,
    revokedAt: row.revoked_at,
    lastSyncAt: row.last_sync_at,
    createdAt: row.created_at,
  };
}

interface AbandonRow {
  id: string;
  edition_id: string;
  jeton_coureur: string;
  lieu: string;
  motif: MotifAbandon;
  horodatage: Date;
  auteur_email: string;
  horodatage_reception: Date;
}

function toAbandonRecord(row: AbandonRow): AbandonRecord {
  return {
    id: row.id,
    editionId: row.edition_id,
    jetonCoureur: row.jeton_coureur,
    lieu: row.lieu,
    motif: row.motif,
    horodatage: row.horodatage,
    auteurEmail: row.auteur_email,
    horodatageReception: row.horodatage_reception,
  };
}

/**
 * Édition courante de l'org : la plus proche date_course = la plus récente,
 * id ASC en tie-break canonique (dates égales). Partagée par etatCourse et
 * saisirAbandon — un seul lieu de vérité pour « l'édition pilotée ».
 */
async function editionCourante(
  tx: postgres.TransactionSql,
  organisationId: string,
): Promise<{ id: string; name: string } | undefined> {
  const editions = await tx<{ id: string; name: string }[]>`
    SELECT id, name FROM edition
    WHERE organisation_id = ${organisationId}
    ORDER BY race_date DESC, id ASC
    LIMIT 1
  `;
  return editions[0];
}

/**
 * Story 7.1 — épreuves de l'édition avec heure de départ : LECTURE UNIQUE
 * partagée par classements/listerHeuresDepart/enregistrerHeuresDepart (même
 * SELECT, même tri canonique distance_km DESC puis id ASC — jamais copié).
 */
async function epreuvesHeuresDepart(
  tx: postgres.TransactionSql,
  organisationId: string,
  editionId: string,
): Promise<EpreuveHeureDepartRecord[]> {
  const rows = await tx<
    { id: string; slug: string; name: string; distance_km: number; heure_depart: Date | null }[]
  >`
    SELECT id, slug, name, distance_km::float8 AS distance_km, heure_depart
    FROM epreuve
    WHERE organisation_id = ${organisationId} AND edition_id = ${editionId}
    ORDER BY distance_km DESC, id ASC
  `;
  return rows.map((row) => ({
    epreuveId: row.id,
    slug: row.slug,
    nom: row.name,
    distanceKm: row.distance_km,
    heureDepart: row.heure_depart,
  }));
}

/**
 * Story 7.1 — FAITS classements de l'édition courante (partants, arrivées
 * arbitrées, abandons, heures de départ), lus dans la transaction DE
 * L'APPELANT. Story 7.4 : le rapport post-course partage ces lectures dans SA
 * propre transaction unique (calque NFR-4 — un rapport entier décrit UN seul
 * instant, jamais deux). Rangs et temps restent calculés par le service
 * (versClassements), au-dessus de ces faits — jamais recalculés ailleurs.
 */
export async function lireClassementsRecord(
  tx: postgres.TransactionSql,
  organisationId: string,
): Promise<ClassementsRecord> {
  const edition = await editionCourante(tx, organisationId);
  if (!edition) {
    return { edition: null, epreuves: [], fraicheur: null };
  }

  const [epreuvesHeures, partantRows, retraitRows, arriveeRows, abandonRows, fraicheurRows] =
    await Promise.all([
      epreuvesHeuresDepart(tx, organisationId, edition.id),
      // Partants POTENTIELS : validés ∧ numérotés ∧ jeton résolu — le
      // retrait arbitré (ci-dessous) fait le départ effectif (un
      // validé/numéroté jamais retiré n'est PAS partant : absent).
      tx<{
        jeton: string;
        dossard: number;
        epreuve_id: string;
        age_category: string;
      }[]>`
        SELECT jeton_edossard AS jeton, dossard, epreuve_id, age_category
        FROM coureur
        WHERE organisation_id = ${organisationId}
          AND edition_id = ${edition.id}
          AND status = 'validé'
          AND jeton_edossard IS NOT NULL
          AND dossard IS NOT NULL
      `,
      // Retraits arbitrés (AD-3) — l'existence du PREMIER suffit à
      // faire partir : son horodatage ne sert JAMAIS au classement.
      tx<{ jeton_coureur: string }[]>`
        SELECT DISTINCT ON (jeton_coureur) jeton_coureur
        FROM terrain_evenement te
        WHERE te.organisation_id = ${organisationId}
          AND te.edition_id = ${edition.id}
          AND te.type = 'retrait'
          AND NOT EXISTS (
            SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
          )
        ORDER BY jeton_coureur, horodatage_reception ASC, id ASC
      `,
      // Premiers passages ARRIVÉE arbitrés par coureur : checkpoint
      // global à l'édition (est_arrivee), croisé avec le coureur pour
      // l'épreuve côté service. horodatage_reception SERVEUR = base
      // du temps (AD-3) ; annulés exclus (ré-arbitrage en lecture).
      tx<{ jeton_coureur: string; horodatage_reception: Date }[]>`
        SELECT DISTINCT ON (te.jeton_coureur)
               te.jeton_coureur, te.horodatage_reception
        FROM terrain_evenement te
        JOIN mission m ON m.id = te.checkpoint_id
        JOIN secteur s ON s.id = m.secteur_id
        WHERE te.organisation_id = ${organisationId}
          AND te.edition_id = ${edition.id}
          AND te.type = 'passage'
          AND m.organisation_id = ${organisationId}
          AND m.type = 'scan_checkpoint'
          AND m.est_arrivee
          AND s.edition_id = ${edition.id}
          AND NOT EXISTS (
            SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
          )
        ORDER BY te.jeton_coureur, te.horodatage_reception ASC, te.id ASC
      `,
      tx<{ jeton_coureur: string }[]>`
        SELECT jeton_coureur
        FROM abandon
        WHERE organisation_id = ${organisationId}
          AND edition_id = ${edition.id}
      `,
      // Fraîcheur du contrat classements : DERNIER PASSAGE reçu —
      // les retraits ne la font pas bouger (un retrait plus récent
      // qu'un passage reste invisible côté fraîcheur).
      tx<{ fraicheur: Date | null }[]>`
        SELECT max(horodatage_reception) AS fraicheur
        FROM terrain_evenement
        WHERE organisation_id = ${organisationId}
          AND edition_id = ${edition.id}
          AND type = 'passage'
      `,
    ]);

  const partis = new Set(retraitRows.map((row) => row.jeton_coureur));
  const abandonnes = new Set(abandonRows.map((row) => row.jeton_coureur));
  const arriveeParJeton = new Map(
    arriveeRows.map((row) => [row.jeton_coureur, row.horodatage_reception]),
  );
  const epreuves: ClassementsRecord['epreuves'] = epreuvesHeures.map((epreuve) => ({
    ...epreuve,
    lignes: [],
  }));
  const epreuveParId = new Map(epreuves.map((epreuve) => [epreuve.epreuveId, epreuve]));
  for (const row of partantRows) {
    // Partant = résolu ∧ RETIRÉ (arbitré). Un coureur dont l'épreuve
    // n'est pas celle d'une épreuve listée (défense : FK libre) reste
    // neutre — il n'apparaît dans AUCUN classement.
    if (!partis.has(row.jeton)) {
      continue;
    }
    const epreuve = epreuveParId.get(row.epreuve_id);
    if (epreuve === undefined) {
      continue;
    }
    const arriveeRecue = arriveeParJeton.get(row.jeton) ?? null;
    // L'abandon DOMINE l'arrivée : un scan d'arrivée tardif (réseau
    // différé) ne fait jamais rebasculer un abandonné (calque 5.3).
    const statut: 'arrivé' | 'en-course' | 'abandonné' = abandonnes.has(row.jeton)
      ? 'abandonné'
      : arriveeRecue !== null
        ? 'arrivé'
        : 'en-course';
    epreuve.lignes.push({
      dossard: row.dossard,
      epreuveId: row.epreuve_id,
      categorieAge: row.age_category,
      statut,
      arriveeRecue,
    });
  }

  return {
    edition: { id: edition.id, nom: edition.name },
    epreuves,
    fraicheur: fraicheurRows[0]?.fraicheur ?? null,
  };
}

export function createChronoStore(sql: Sql): ChronoStore {
  return {
    // Hors withOrg, délibérément (pattern 0011) : le hash du jeton EST le
    // contrôle d'accès, l'organisation n'est connue qu'après résolution.
    async trouverAppareilParHash(jetonHash: string) {
      return withDb(async () => {
        const rows = await sql<
          Pick<AppareilRow, 'id' | 'organisation_id' | 'appareil_client' | 'revoked_at'>[]
        >`
          SELECT id, organisation_id, appareil_client, revoked_at
          FROM appareil WHERE jeton_hash = ${jetonHash} LIMIT 1
        `;
        const row = rows[0];
        return row
          ? {
              id: row.id,
              organisationId: row.organisation_id,
              appareilClient: row.appareil_client,
              revokedAt: row.revoked_at,
            }
          : null;
      });
    },

    async enregistrerAppareil(input: {
      organisationId: string;
      appareilClient: string;
    }): Promise<{ id: string; jeton: string; rotation: boolean }> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Plafond doux : seul l'enregistrement d'un NOUVEAU appareil y est
          // soumis — la rotation d'un appareil connu passe toujours.
          const connues = await tx<{ id: string }[]>`
            SELECT id FROM appareil
            WHERE organisation_id = ${input.organisationId}
              AND appareil_client = ${input.appareilClient}
            LIMIT 1
          `;
          if (connues.length === 0) {
            const comptees = await tx<{ count: number }[]>`
              SELECT count(*)::int AS count FROM appareil
              WHERE organisation_id = ${input.organisationId}
            `;
            if ((comptees[0]?.count ?? 0) >= PLAFOND_APPAREILS_PAR_ORG) {
              throw new PlafondAppareilsError(PLAFOND_APPAREILS_PAR_ORG);
            }
          }
          // UPSERT atomique (aucune fenêtre de course entre SELECT et INSERT) :
          // deux ouvertures concurrentes de la PWA ne peuvent pas créer deux
          // lignes — le conflit (org, appareil_client) bascule en rotation du
          // jeton. Le garde révoqué lit revoked_at APRÈS l'upsert : un appareil
          // révoqué ne récupère jamais un jeton (le rollback défait l'écrasement
          // du hash — AD-5, assistance humaine).
          const jeton = genererJetonAppareil();
          const uploadees = await tx<{ id: string; revoked_at: Date | null; cree: boolean }[]>`
            INSERT INTO appareil (organisation_id, appareil_client, jeton_hash)
            VALUES (${input.organisationId}, ${input.appareilClient}, ${hashJetonAppareil(jeton)})
            ON CONFLICT (organisation_id, appareil_client)
              DO UPDATE SET jeton_hash = EXCLUDED.jeton_hash
            RETURNING id, revoked_at, (xmax = 0) AS cree
          `;
          const row = uploadees[0];
          if (!row) {
            throw new Error('upsert de l’appareil sans résultat');
          }
          if (row.revoked_at !== null) {
            throw new AppareilRevokedError();
          }
          return { id: row.id, jeton, rotation: !row.cree };
        }),
      );
    },

    async rafraichirLastSync(input: {
      organisationId: string;
      appareilId: string;
      maintenant: Date;
    }): Promise<void> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          await tx`
            UPDATE appareil SET last_sync_at = ${input.maintenant}
            WHERE id = ${input.appareilId}
          `;
        }),
      );
    },

    async insererLot(input: {
      organisationId: string;
      evenements: EvenementSyncTerrain[];
      reception: Date;
    }): Promise<StatutInsertion[]> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Résolution coureurs en UNE requête : paires (jeton, édition)
          // présentes dans l'org. Un jeton hors org/édition = coureur
          // inconnu → rejet motivé, JAMAIS stocké.
          const jetonsDistincts = [...new Set(input.evenements.map((e) => e.jeton))];
          const pairesConnues = new Set<string>();
          if (jetonsDistincts.length > 0) {
            const rows = await tx<{ jeton: string; edition_id: string }[]>`
              SELECT jeton_edossard AS jeton, edition_id
              FROM coureur
              WHERE organisation_id = ${input.organisationId}
                AND jeton_edossard = ANY(${jetonsDistincts}::text[])
            `;
            for (const row of rows) {
              pairesConnues.add(`${row.jeton}:${row.edition_id}`);
            }
          }

          // Résolution checkpoints en UNE requête (V1 : le checkpoint EST une
          // mission scan_checkpoint de l'org) — un id fantôme (ou non-UUID,
          // donc introuvable par construction) = checkpoint inconnu, rejet
          // motivé, JAMAIS stocké.
          const checkpointsDemandes = new Set(
            input.evenements
              .filter((evenement) => evenement.type === 'passage')
              .map((evenement) => evenement.checkpointId),
          );
          const checkpointsConnus = new Set<string>();
          const uuidsCheckpoints = [...checkpointsDemandes].filter(estUuidValide);
          if (uuidsCheckpoints.length > 0) {
            const rows = await tx<{ id: string }[]>`
              SELECT id FROM mission
              WHERE organisation_id = ${input.organisationId}
                AND type = 'scan_checkpoint'
                AND id = ANY(${uuidsCheckpoints}::uuid[])
            `;
            for (const row of rows) {
              checkpointsConnus.add(row.id);
            }
          }

          // Tri : seuls les événements résolus partent en insertion, dans
          // l'ordre du lot ; les statuts sont réassemblés ensuite.
          const aInserer: EvenementSyncTerrain[] = [];
          const rangs: number[] = [];
          const rejets = new Map<number, string>();
          input.evenements.forEach((evenement, index) => {
            if (!pairesConnues.has(`${evenement.jeton}:${evenement.editionId}`)) {
              rejets.set(index, MOTIF_REJET_COUREUR_INCONNU);
              return;
            }
            if (
              evenement.type === 'passage' &&
              !checkpointsConnus.has(evenement.checkpointId)
            ) {
              rejets.set(index, MOTIF_REJET_CHECKPOINT_INCONNU);
              return;
            }
            aInserer.push(evenement);
            rangs.push(index);
          });

          // INSERT multi-lignes (unnest) : le lot entier part en UNE requête,
          // idempotente par clé — RETURNING donne les clés réellement insérées,
          // les absentes sont « déjà-connu ». Même horodatage de réception pour
          // tout le lot : l'ordre DANS un lot n'a pas de sens d'arbitrage,
          // seul l'ordre ENTRE lots compte.
          const clesInserees = new Set<string>();
          if (aInserer.length > 0) {
            const inserees = await tx<{ cle_idempotence: string }[]>`
              INSERT INTO terrain_evenement (
                organisation_id, cle_idempotence, type, edition_id, jeton_coureur,
                checkpoint_id, horodatage_appareil, horodatage_reception,
                offset_estime_ms, appareil_id
              )
              SELECT ${input.organisationId}, t.f1, t.f2, t.f3, t.f4, t.f5, t.f6,
                     ${input.reception}, t.f7, t.f8
              FROM unnest(
                ${aInserer.map((e) => e.cle)}::text[],
                ${aInserer.map((e) => e.type)}::text[],
                ${aInserer.map((e) => e.editionId)}::uuid[],
                ${aInserer.map((e) => e.jeton)}::text[],
                ${aInserer.map((e) => (e.type === 'passage' ? e.checkpointId : null))}::uuid[],
                ${aInserer.map((e) => new Date(e.horodatage).toISOString())}::timestamptz[],
                ${aInserer.map((e) =>
                  calculerOffsetEstimeMs(input.reception, new Date(e.horodatage)),
                )}::bigint[],
                ${aInserer.map((e) => e.appareilId)}::text[]
              ) AS t(f1, f2, f3, f4, f5, f6, f7, f8)
              ON CONFLICT (cle_idempotence) DO NOTHING
              RETURNING cle_idempotence
            `;
            for (const row of inserees) {
              clesInserees.add(row.cle_idempotence);
            }
          }

          const statuts: StatutInsertion[] = input.evenements.map(() => 'déjà-connu');
          for (let rang = 0; rang < rangs.length; rang += 1) {
            const evenement = aInserer[rang];
            const index = rangs[rang];
            if (evenement !== undefined && index !== undefined) {
              statuts[index] = clesInserees.has(evenement.cle) ? 'accepté' : 'déjà-connu';
            }
          }
          for (const [index, motif] of rejets) {
            statuts[index] = { rejeté: motif };
          }
          return statuts;
        }),
      );
    },

    async premierRecu(input: {
      organisationId: string;
      editionId: string;
      jeton: string;
      checkpointId: string | null;
    }): Promise<TerrainEvenementRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Story 5.4 — lecture arbitrée : les événements ANNULÉS sont
          // exclus (NOT EXISTS) — si le premier reçu est annulé, le SUIVANT
          // non annulé devient le premier (ré-arbitrage en lecture, AD-8).
          const rows = await tx<TerrainEvenementRow[]>`
            SELECT id, cle_idempotence, type, edition_id, jeton_coureur, checkpoint_id,
                   horodatage_appareil, horodatage_reception, offset_estime_ms, appareil_id
            FROM terrain_evenement te
            WHERE te.organisation_id = ${input.organisationId}
              AND te.edition_id = ${input.editionId}
              AND te.jeton_coureur = ${input.jeton}
              AND te.checkpoint_id IS NOT DISTINCT FROM ${input.checkpointId}
              AND NOT EXISTS (
                SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
              )
            ORDER BY te.horodatage_reception ASC, te.id ASC
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toTerrainEvenementRecord(row) : null;
        }),
      );
    },

    async listerAppareils(organisationId: string): Promise<AppareilRecord[]> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<AppareilRow[]>`
            SELECT id, organisation_id, appareil_client, revoked_at, last_sync_at, created_at
            FROM appareil
            WHERE organisation_id = ${organisationId}
            ORDER BY created_at ASC, id ASC
          `;
          return rows.map(toAppareilRecord);
        }),
      );
    },

    async revoquerAppareil(input: {
      organisationId: string;
      appareilId: string;
      maintenant: Date;
    }): Promise<AppareilRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Idempotent : révoquer un appareil déjà révoqué conserve la PREMIÈRE
          // date (COALESCE) — l'audit garde l'acte initial.
          const rows = await tx<AppareilRow[]>`
            UPDATE appareil SET revoked_at = COALESCE(revoked_at, ${input.maintenant})
            WHERE id = ${input.appareilId} AND organisation_id = ${input.organisationId}
            RETURNING id, organisation_id, appareil_client, revoked_at, last_sync_at, created_at
          `;
          const row = rows[0];
          return row ? toAppareilRecord(row) : null;
        }),
      );
    },

    // -----------------------------------------------------------------
    // Story 5.1 — agrégats PC course. Une SEULE transaction withOrg : les
    // compteurs, les boards et la fraîcheur décrivent le même instant. Toutes
    // les lectures passent par l'arbitrage premier-reçu (AD-3) : DISTINCT ON
    // (jeton [, checkpoint]) ORDER BY horodatage_reception — le PC voit la
    // vérité de classement, jamais le bruit des doublons d'appareils. La
    // résolution jeton→coureur (dossard) reste ICI, côté serveur : le board ne
    // transporte que des dossards.
    // -----------------------------------------------------------------
    async etatCourse(organisationId: string): Promise<EtatCourseRecord> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const edition = await editionCourante(tx, organisationId);
          if (!edition) {
            return {
              edition: null,
              partants: [],
              retraits: 0,
              arrives: 0,
              abandones: 0,
              enCourse: 0,
              arriveeDefinie: false,
              checkpoints: [],
              alertes: [],
              fraicheur: null,
            };
          }

          const [partantsRows, checkpointRows, retraitRows, passageRows, abandonRows, dossardRows, fraicheurRows] =
            await Promise.all([
              tx<{ id: string; name: string; total: number }[]>`
                SELECT e.id, e.name,
                       count(c.id) FILTER (WHERE c.status = 'validé')::int AS total
                FROM epreuve e
                LEFT JOIN coureur c
                  ON c.epreuve_id = e.id
                 AND c.organisation_id = ${organisationId}
                 AND c.edition_id = ${edition.id}
                WHERE e.organisation_id = ${organisationId} AND e.edition_id = ${edition.id}
                GROUP BY e.id, e.name, e.distance_km
                ORDER BY e.distance_km DESC, e.id ASC
              `,
              tx<{
                id: string;
                titre: string;
                est_arrivee: boolean;
                barriere_le: Date | null;
                contact_secteur: string | null;
              }[]>`
                SELECT m.id, m.titre, m.est_arrivee, m.barriere_le, s.contact AS contact_secteur
                FROM mission m
                JOIN secteur s ON s.id = m.secteur_id
                WHERE m.organisation_id = ${organisationId}
                  AND s.edition_id = ${edition.id}
                  AND m.type = 'scan_checkpoint'
                ORDER BY m.debut_le ASC, m.created_at ASC, m.id ASC
              `,
              // Story 5.4 — retraits : le NOT EXISTS y est DÉLIBÉRÉ. V1,
              // un retrait ne peut PAS être annulé (garde 409 dans
              // annulerPassage) — mais l'invariant de lecture « un événement
              // annulé est neutre pour TOUTE lecture arbitrée » PRÉCÈDE la
              // surface : l'annulation de retrait (correction guichet —
              // rouvrir « présent au départ ») viendra par-dessus cette
              // lecture, jamais en la réécrivant.
              tx<{ jeton_coureur: string; horodatage_reception: Date }[]>`
                SELECT DISTINCT ON (jeton_coureur) jeton_coureur, horodatage_reception
                FROM terrain_evenement te
                WHERE te.organisation_id = ${organisationId}
                  AND te.edition_id = ${edition.id}
                  AND te.type = 'retrait'
                  AND NOT EXISTS (
                    SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
                  )
                ORDER BY jeton_coureur, horodatage_reception ASC, id ASC
              `,
              // Story 5.4 — passages arbitrés SANS les annulés (NOT EXISTS) :
              // le ré-arbitrage « second fait foi » tombe du DISTINCT ON seul.
              // L'id de l'événement fait foi : cible du bouton « Annuler ».
              tx<{
                id: string;
                checkpoint_id: string;
                jeton_coureur: string;
                horodatage_reception: Date;
              }[]>`
                SELECT DISTINCT ON (checkpoint_id, jeton_coureur)
                       id, checkpoint_id, jeton_coureur, horodatage_reception
                FROM terrain_evenement te
                WHERE te.organisation_id = ${organisationId}
                  AND te.edition_id = ${edition.id}
                  AND te.type = 'passage'
                  AND NOT EXISTS (
                    SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
                  )
                ORDER BY checkpoint_id, jeton_coureur, horodatage_reception ASC, id ASC
              `,
              // Story 5.3 — abandons de l'édition (UNIQUE par coureur en
              // base : une ligne = un coureur abandonné, jamais de doublon).
              tx<{ jeton_coureur: string }[]>`
                SELECT jeton_coureur
                FROM abandon
                WHERE organisation_id = ${organisationId}
                  AND edition_id = ${edition.id}
              `,
              tx<{ jeton: string; dossard: number }[]>`
                SELECT jeton_edossard AS jeton, dossard
                FROM coureur
                WHERE organisation_id = ${organisationId}
                  AND edition_id = ${edition.id}
                  AND status = 'validé'
                  AND jeton_edossard IS NOT NULL
                  AND dossard IS NOT NULL
              `,
              tx<{ fraicheur: Date | null }[]>`
                SELECT max(horodatage_reception) AS fraicheur
                FROM terrain_evenement
                WHERE organisation_id = ${organisationId} AND edition_id = ${edition.id}
              `,
            ]);

          // Dossards par jeton : résolution SERVEUR, l'identité coureur ne
          // quitte jamais ce module sous forme de jeton. Un jeton RÉSOLU =
          // coureur VALIDÉ, numéroté, ayant consulté son e-dossard : tout
          // autre événement (coureur fantôme : jeton connu de l'ingestion mais
          // jamais numéroté / non validé) reste en audit, NEUTRE pour le PC.
          const dossardParJeton = new Map(dossardRows.map((row) => [row.jeton, row.dossard]));

          // Retraits arbitrés RÉSOLUS : un coureur DISTINCT par ligne (premier
          // reçu), uniquement si son dossard est résolu — un retrait fantôme
          // ne gonfle NI retraits NI en course.
          const jetonsRetires = new Set(
            retraitRows
              .map((row) => row.jeton_coureur)
              .filter((jeton) => dossardParJeton.has(jeton)),
          );

          // Story 5.3 — abandonnés de l'édition : résolus par construction
          // (la saisie valide le dossard), la garde de résolution reste par
          // défense en profondeur — un abandon fantôme ne toucherait aucun
          // compteur.
          const jetonsAbandonnes = new Set(
            abandonRows
              .map((row) => row.jeton_coureur)
              .filter((jeton) => dossardParJeton.has(jeton)),
          );

          // Passages arbitrés par checkpoint : seuls les coureurs RÉSOLUS
          // (dossard connu) montent sur un board — l'ingestion garantit
          // l'existence du coureur, cette garde ne sert qu'à la forme.
          const passagesParCheckpoint = new Map<
            string,
            { evenementId: string; dossard: number; horodatageReception: Date }[]
          >();
          const jetonsParCheckpoint = new Map<string, Set<string>>();
          for (const row of passageRows) {
            const dossard = dossardParJeton.get(row.jeton_coureur);
            if (dossard === undefined) {
              continue;
            }
            const jetons = jetonsParCheckpoint.get(row.checkpoint_id) ?? new Set<string>();
            jetons.add(row.jeton_coureur);
            jetonsParCheckpoint.set(row.checkpoint_id, jetons);
            const liste = passagesParCheckpoint.get(row.checkpoint_id) ?? [];
            liste.push({
              evenementId: row.id,
              dossard,
              horodatageReception: row.horodatage_reception,
            });
            passagesParCheckpoint.set(row.checkpoint_id, liste);
          }

          const checkpoints = checkpointRows.map((row) => ({
            id: row.id,
            titre: row.titre,
            estArrivee: row.est_arrivee,
            // Tri heure DÉCROISSANTE (UX-DR-12) : dernier passage en tête.
            passages: (passagesParCheckpoint.get(row.id) ?? []).sort(
              (a, b) =>
                b.horodatageReception.getTime() - a.horodatageReception.getTime() ||
                a.dossard - b.dossard,
            ),
          }));

          // Arrivés = retirés RÉSOLUS ∧ passage AU checkpoint est_arrivee
          // ∧ NON abandonnés (∧ : intersection). La saisie refuse un coureur
          // déjà arrivé (5.3), mais un scan d'arrivée peut arriver APRÈS
          // l'abandon (réseau différé) : l'abandonné reste abandonné, il ne
          // bascule JAMAIS dans les arrivés. L'ensemble vit AU-DESSUS des
          // alertes : un arrivé comme un abandonné ont leur course finie.
          const arriveeCheckpoint = checkpointRows.find((row) => row.est_arrivee);
          const jetonsAArrivee =
            arriveeCheckpoint !== undefined
              ? (jetonsParCheckpoint.get(arriveeCheckpoint.id) ?? new Set<string>())
              : new Set<string>();
          const jetonsArrives = new Set(
            [...jetonsRetires].filter(
              (jeton) => jetonsAArrivee.has(jeton) && !jetonsAbandonnes.has(jeton),
            ),
          );
          const arrives = jetonsArrives.size;

          // Story 5.2 — alertes hors-délais, MÊME instant que les agrégats :
          // attendu = retiré RÉSOLU (dossard connu) et NON ARRIVÉ (passage
          // arbitré au checkpoint est_arrivee = course finie, sécurité réglée) ;
          // alerte si heure SERVEUR strictement APRÈS la barrière ET aucun
          // passage arbitré au checkpoint. Barrière absente (NULL) ou future →
          // jamais d'alerte. Le passage arbitré règle la question au polling
          // suivant — aucune persistance.
          const maintenant = new Date();
          const alertes: AlerteHorsDelais[] = [];
          for (const checkpoint of checkpointRows) {
            if (checkpoint.barriere_le === null) {
              continue;
            }
            if (maintenant.getTime() <= checkpoint.barriere_le.getTime()) {
              continue;
            }
            const passes = jetonsParCheckpoint.get(checkpoint.id) ?? new Set<string>();
            for (const jeton of jetonsRetires) {
              // Arrivé ou ABANDONNÉ : plus aucune alerte de sécurité, sur
              // AUCUN checkpoint — la course est finie dans les deux cas.
              if (jetonsArrives.has(jeton) || jetonsAbandonnes.has(jeton)) {
                continue;
              }
              const dossard = dossardParJeton.get(jeton);
              if (dossard === undefined || passes.has(jeton)) {
                continue;
              }
              alertes.push({
                dossard,
                checkpointId: checkpoint.id,
                checkpointTitre: checkpoint.titre,
                barriereLe: checkpoint.barriere_le,
                contactSecteur: checkpoint.contact_secteur,
              });
            }
          }
          alertes.sort(
            (a, b) => a.dossard - b.dossard || a.checkpointId.localeCompare(b.checkpointId),
          );

          return {
            edition: { id: edition.id, nom: edition.name },
            partants: partantsRows.map((row) => ({
              epreuveId: row.id,
              epreuveNom: row.name,
              total: row.total,
            })),
            retraits: jetonsRetires.size,
            arrives,
            abandones: jetonsAbandonnes.size,
            enCourse: Math.max(0, jetonsRetires.size - jetonsAbandonnes.size - arrives),
            arriveeDefinie: arriveeCheckpoint !== undefined,
            checkpoints,
            alertes,
            fraicheur: fraicheurRows[0]?.fraicheur ?? null,
          };
        }),
      );
    },

    // -----------------------------------------------------------------
    // Story 5.3 — saisie d'un abandon. TOUT vit dans UNE SEULE transaction
    // withOrg : l'état de course au moment de la saisie est la vérité (jamais
    // une validation à froid sur un état potentiellement périmé). L'insertion
    // append-only porte l'arbitrage AD-3 : UNIQUE (edition, jeton) + ON
    // CONFLICT DO NOTHING — deux saisies concurrentes (PC et secteur) ne
    // peuvent JAMAIS produire deux abandons, le premier reçu fait foi.
    // -----------------------------------------------------------------
    async saisirAbandon(input: {
      organisationId: string;
      dossard: number;
      lieu: string;
      motif: MotifAbandon;
      horodatage: Date;
      auteurEmail: string;
      maintenant: Date;
    }): Promise<AbandonRecord> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Édition courante (helper partagé avec etatCourse) : la saisie vit
          // sur l'édition que le PC est en train de piloter.
          const edition = await editionCourante(tx, input.organisationId);

          // Résolution dossard → coureur VALIDÉ et numéroté de l'édition
          // courante (mêmes règles que le board : un dossard d'une autre
          // édition, non validé ou sans jeton, est introuvable — RLS comprise).
          let jeton: string | null = null;
          if (edition !== undefined) {
            const coureurs = await tx<{ jeton: string }[]>`
              SELECT jeton_edossard AS jeton
              FROM coureur
              WHERE organisation_id = ${input.organisationId}
                AND edition_id = ${edition.id}
                AND dossard = ${input.dossard}
                AND status = 'validé'
                AND jeton_edossard IS NOT NULL
              LIMIT 1
            `;
            jeton = coureurs[0]?.jeton ?? null;
          }
          if (edition === undefined || jeton === null) {
            throw new AbandonDossardInconnuError();
          }

          // Coureur parti : sans retrait arbitré, un abandon n'a pas de sens
          // de course (il n'est nulle part « en course »). La réception du
          // PREMIER retrait (arbitrage AD-3) servira aussi de borne basse de
          // chronologie une fois les refus d'état de course passés.
          const retraits = await tx<{ horodatage_reception: Date }[]>`
            SELECT horodatage_reception FROM terrain_evenement
            WHERE organisation_id = ${input.organisationId}
              AND edition_id = ${edition.id}
              AND jeton_coureur = ${jeton}
              AND type = 'retrait'
            ORDER BY horodatage_reception ASC, id ASC
            LIMIT 1
          `;
          const retraitRecu = retraits[0];
          if (retraitRecu === undefined) {
            throw new AbandonPasPartiError();
          }

          // Coureur pas déjà arrivé : un passage arbitré au checkpoint
          // est_arrivee clôt la course — l'abandon ne la réouvre pas.
          const arrivees = await tx<{ id: string }[]>`
            SELECT m.id
            FROM mission m
            JOIN secteur s ON s.id = m.secteur_id
            WHERE m.organisation_id = ${input.organisationId}
              AND s.edition_id = ${edition.id}
              AND m.type = 'scan_checkpoint'
              AND m.est_arrivee
            LIMIT 1
          `;
          const arriveeCheckpoint = arrivees[0];
          if (arriveeCheckpoint !== undefined) {
            // Story 5.4 — lecture arbitrée SYMÉTRIQUE : un passage d'arrivée
            // ANNULÉ ne clôt plus la course — l'abandon redevient saisissable
            // (le coureur reparti « en course » au board).
            const passages = await tx<{ id: string }[]>`
              SELECT te.id FROM terrain_evenement te
              WHERE te.organisation_id = ${input.organisationId}
                AND te.edition_id = ${edition.id}
                AND te.jeton_coureur = ${jeton}
                AND te.type = 'passage'
                AND te.checkpoint_id = ${arriveeCheckpoint.id}
                AND NOT EXISTS (
                  SELECT 1 FROM annulation a WHERE a.evenement_id = te.id
                )
              LIMIT 1
            `;
            if (passages.length > 0) {
              throw new AbandonDejaArriveError();
            }
          }

          // Borne basse de chronologie : l'heure déclarée du terrain vit
          // APRÈS le départ (réception SERVEUR du premier retrait, lue dans
          // la même transaction). Les refus d'état de course sont passés :
          // ce qui reste à corriger est la FORME de la saisie.
          if (input.horodatage.getTime() < retraitRecu.horodatage_reception.getTime()) {
            throw new AbandonAvantDepartError();
          }

          // Insertion append-only ARBITRÉE : le PREMIER reçu commit, le
          // concurrent retombe sur DO NOTHING (0 ligne) → « déjà abandonné ».
          const inserees = await tx<AbandonRow[]>`
            INSERT INTO abandon (
              organisation_id, edition_id, jeton_coureur, lieu, motif,
              horodatage, auteur_email, horodatage_reception
            )
            VALUES (
              ${input.organisationId}, ${edition.id}, ${jeton}, ${input.lieu},
              ${input.motif}, ${input.horodatage}, ${input.auteurEmail},
              ${input.maintenant}
            )
            ON CONFLICT (edition_id, jeton_coureur) DO NOTHING
            RETURNING id, edition_id, jeton_coureur, lieu, motif, horodatage,
                      auteur_email, horodatage_reception
          `;
          const row = inserees[0];
          if (row === undefined) {
            throw new AbandonDejaAbandonneError();
          }
          return toAbandonRecord(row);
        }),
      );
    },

    // -----------------------------------------------------------------
    // Story 5.4 — annulation auditable d'un passage (AD-8). TOUT vit dans
    // UNE transaction withOrg : la cible est résolue DANS l'org/édition
    // courante (RLS comprise — un id deviné d'une autre org est
    // introuvable), un retrait est refusé (409 dédié, V1), et l'insertion
    // est idempotente : UNIQUE (evenement_id) + ON CONFLICT DO NOTHING —
    // rejouer « Confirmer » rend « déjà annulé » (succès), jamais une
    // seconde ligne. terrain_evenement reste INTACT : seule la lecture
    // arbitrée (etatCourse/premierRecu, NOT EXISTS) change.
    // -----------------------------------------------------------------
    async annulerPassage(input: {
      organisationId: string;
      evenementId: string;
      motif: string;
      auteurEmail: string;
    }): Promise<AnnulationResultat> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const edition = await editionCourante(tx, input.organisationId);

          // Cible : événement de l'édition courante, org-scopé (RLS en
          // profondeur). Un candidat non-UUID n'est jamais envoyé au SQL :
          // introuvable par construction.
          let cible:
            | { id: string; type: string; jeton_coureur: string; checkpoint_id: string | null }
            | undefined;
          if (edition !== undefined && estUuidValide(input.evenementId)) {
            const rows = await tx<
              { id: string; type: string; jeton_coureur: string; checkpoint_id: string | null }[]
            >`
              SELECT id, type, jeton_coureur, checkpoint_id
              FROM terrain_evenement
              WHERE organisation_id = ${input.organisationId}
                AND edition_id = ${edition.id}
                AND id = ${input.evenementId}
              LIMIT 1
            `;
            cible = rows[0];
          }
          if (edition === undefined || cible === undefined) {
            throw new AnnulationEvenementIntrouvableError();
          }
          // V1 : seuls les PASSAGES sont annulables — le retrait erroné est
          // une correction guichet (rouvrir « présent au départ »), besoin
          // séparé, construit sur demande.
          if (cible.type !== 'passage') {
            throw new AnnulationRetraitRefuseError();
          }

          // Résolution du libellé PC : dossard du coureur VALIDÉ (symétrie
          // dossardParJeton — un événement de coureur non validé n'est
          // PILOTABLE nulle part, jamais annulable à l'aveugle) + titre du
          // checkpoint (la mission scan_checkpoint EST le checkpoint, V1).
          const [coureurRows, checkpointRows] = await Promise.all([
            tx<{ dossard: number }[]>`
              SELECT dossard FROM coureur
              WHERE organisation_id = ${input.organisationId}
                AND edition_id = ${edition.id}
                AND jeton_edossard = ${cible.jeton_coureur}
                AND status = 'validé'
                AND dossard IS NOT NULL
              LIMIT 1
            `,
            tx<{ titre: string }[]>`
              SELECT m.titre
              FROM mission m
              JOIN secteur s ON s.id = m.secteur_id
              WHERE m.organisation_id = ${input.organisationId}
                AND s.edition_id = ${edition.id}
                AND m.type = 'scan_checkpoint'
                AND m.id = ${cible.checkpoint_id}
              LIMIT 1
            `,
          ]);
          const dossard = coureurRows[0]?.dossard;
          const checkpointTitre = checkpointRows[0]?.titre;
          if (dossard === undefined || checkpointTitre === undefined) {
            // Coureur irrésolu ou checkpoint disparu : l'événement existe en
            // audit mais n'est PILOTABLE nulle part — la ligne ne peut pas
            // être affichée, l'annulation n'a pas de sens PC.
            throw new AnnulationEvenementIntrouvableError();
          }

          // Insertion append-only idempotente : UNIQUE (evenement_id) — le
          // rejeu retombe sur DO NOTHING (0 ligne) → « déjà annulé ». L'audit
          // horodatage vit du DEFAULT now() SQL (heure serveur de la base,
          // jamais une heure passée par l'applicatif).
          const inserees = await tx<{ id: string }[]>`
            INSERT INTO annulation (
              organisation_id, evenement_id, motif, auteur_email
            )
            VALUES (
              ${input.organisationId}, ${input.evenementId}, ${input.motif},
              ${input.auteurEmail}
            )
            ON CONFLICT (evenement_id) DO NOTHING
            RETURNING id
          `;
          return {
            dejaAnnule: inserees.length === 0,
            evenementId: input.evenementId,
            dossard,
            checkpointTitre,
          };
        }),
      );
    },

    // -----------------------------------------------------------------
    // Story 7.1 — classements par épreuve (départs échelonnés). Gabarit
    // direct d'etatCourse : UNE transaction withOrg (NFR-4), lectures
    // arbitrées AD-3 (DISTINCT ON premier reçu + NOT EXISTS annulation — le
    // scan de départ n'entre JAMAIS dans le calcul). Le store rend des FAITS
    // (partants, arrivées, abandons, heures) ; rangs et temps sont assemblés
    // par le service, au-dessus de ce seul instant cohérent.
    // -----------------------------------------------------------------
    async classements(organisationId: string): Promise<ClassementsRecord> {
      return withDb(() =>
        withOrg(sql, organisationId, (tx) => lireClassementsRecord(tx, organisationId)),
      );
    },

    // -----------------------------------------------------------------
    // Story 7.1 — heures de départ officielles : lecture (carte admin) et
    // écriture organisateur. L'écriture résout les épreuves DANS l'org/édition
    // courante (RLS comprise — un id deviné d'une autre org est introuvable)
    // et retourne l'état serveur complet.
    // -----------------------------------------------------------------
    async listerHeuresDepart(organisationId: string): Promise<{
      edition: { id: string; nom: string } | null;
      epreuves: EpreuveHeureDepartRecord[];
    }> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const edition = await editionCourante(tx, organisationId);
          if (!edition) {
            return { edition: null, epreuves: [] };
          }
          return {
            edition: { id: edition.id, nom: edition.name },
            epreuves: await epreuvesHeuresDepart(tx, organisationId, edition.id),
          };
        }),
      );
    },

    async enregistrerHeuresDepart(input: {
      organisationId: string;
      heures: { epreuveId: string; heureDepart: Date | null }[];
    }): Promise<EpreuveHeureDepartRecord[]> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // « Aucune édition en cours » est un refus DÉDIÉ (409) : la carte
          // n'a rien à configurer, ce n'est la faute d'AUCUN champ.
          const edition = await editionCourante(tx, input.organisationId);
          if (!edition) {
            throw new HeuresDepartSansEditionError();
          }
          const connues = await tx<{ id: string }[]>`
            SELECT id FROM epreuve
            WHERE organisation_id = ${input.organisationId}
              AND edition_id = ${edition.id}
          `;
          const idsConnus = new Set(connues.map((row) => row.id));
          const inconnues = input.heures
            .map((ligne) => ligne.epreuveId)
            .filter((epreuveId) => !idsConnus.has(epreuveId));
          if (inconnues.length > 0) {
            // RLS comprise : une épreuve d'une autre org/édition est
            // introuvable par construction — erreur champ par épreuve.
            throw new HeuresDepartEpreuveInconnueError(inconnues);
          }
          for (const ligne of input.heures) {
            await tx`
              UPDATE epreuve SET heure_depart = ${ligne.heureDepart}
              WHERE id = ${ligne.epreuveId}
                AND organisation_id = ${input.organisationId}
                AND edition_id = ${edition.id}
            `;
          }
          return epreuvesHeuresDepart(tx, input.organisationId, edition.id);
        }),
      );
    },

    // -----------------------------------------------------------------
    // Story 7.2 — résultats publics partageables. L'organisation par défaut
    // est résolue hors GUC (gabarit sponsors readDefaultOrgPartenaires) ;
    // le comptage des visites partagées est un AGRÉGAT quotidien anonyme :
    // upsert (+1) dans UNE transaction, la clé naturelle (org, édition,
    // jour) arbitre structurellement les chargements concurrents — aucune
    // donnée personnelle n'approche cette table.
    // -----------------------------------------------------------------
    async organisationParDefautId(): Promise<string | null> {
      return withDb(() => findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG));
    },

    async editionCouranteId(organisationId: string): Promise<string | null> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const edition = await editionCourante(tx, organisationId);
          return edition?.id ?? null;
        }),
      );
    },

    async compterVisitePartage(organisationId: string): Promise<void> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          // Sans édition courante : rien à compter (la page reste honnête,
          // jamais une erreur — calque de l'état zéro de classements()).
          const edition = await editionCourante(tx, organisationId);
          if (!edition) {
            return;
          }
          // Upsert atomique : le jour vient de l'horloge de la BASE
          // (CURRENT_DATE), la même pour le rapport 7.4 qui lira l'agrégat.
          await tx`
            INSERT INTO resultats_visite (organisation_id, edition_id, jour, visites)
            VALUES (${organisationId}, ${edition.id}, CURRENT_DATE, 1)
            ON CONFLICT (organisation_id, edition_id, jour)
              DO UPDATE SET visites = resultats_visite.visites + 1
          `;
        }),
      );
    },
  };
}

function createUnavailableStore(): ChronoStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    trouverAppareilParHash: unavailable,
    enregistrerAppareil: unavailable,
    rafraichirLastSync: unavailable,
    insererLot: unavailable,
    premierRecu: unavailable,
    listerAppareils: unavailable,
    revoquerAppareil: unavailable,
    etatCourse: unavailable,
    saisirAbandon: unavailable,
    annulerPassage: unavailable,
    classements: unavailable,
    listerHeuresDepart: unavailable,
    enregistrerHeuresDepart: unavailable,
    organisationParDefautId: unavailable,
    editionCouranteId: unavailable,
    compterVisitePartage: unavailable,
  };
}

export function getChronoStore(): ChronoStore {
  const globals = globalThis as typeof globalThis & {
    __azzelChronoStore?: ChronoStore;
  };
  if (globals.__azzelChronoStore) {
    return globals.__azzelChronoStore;
  }
  // Pool applicatif partagé — voir `@/db/client`.
  const sql = getDbClient();
  const store = sql !== null ? createChronoStore(sql) : createUnavailableStore();
  globals.__azzelChronoStore = store;
  return store;
}
