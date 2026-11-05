import { randomBytes } from 'node:crypto';

import { getDbClient } from '@/db/client';
import { protegerStore } from '@/db/app-role';
import { isProductionRuntime } from '@/modules/iam/store';

import type postgres from 'postgres';
import type { Sql } from 'postgres';

import { DOSSARD_MAX } from '@azzel/shared';

import { findOrganisationIdBySlug, withOrg } from '@/db/org-scope';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { insertOutboxEmail } from '@/modules/notifications/outbox-store';

import {
  COUREUR_STATUS_EN_CONSTITUTION,
  COUREUR_STATUS_VALIDE,
  STATUTS_MODIFIABLES,
  COUREUR_STATUS_EXPIREE,
  limitePreuve,
  STATUTS_OCCUPANT_UNE_PLACE,
  placesRestantes,
  statutInitial,
  LIST_COUREURS_LIMIT,
  canDepositPreuve,
  isRegistrationOpen,
} from './domain';
import {
  DbUnavailableError,
  DossardsEpuisesError,
  DossierIncompletError,
  DossierNotFoundError,
  DossierValidatedError,
  DocumentsMissingError,
  NoCoureurError,
  PreuveIdenticalRefusedError,
  RegistrationClosedError,
  RefusalReasonRequiredError,
  type PieceDossier,
} from './errors';

export interface BilanExpiration {
  /** Dossiers passés en « expirée » par CE passage, jamais les précédents. */
  expirees: number;
  /** Emails d'expiration réellement enfilés (les doublons sont absorbés). */
  emailsEnfiles: number;
}

export interface EditionRecord {
  id: string;
  organisationId: string;
  slug: string;
  nom: string;
  dateCourse: string;
  registrationClosesAt: Date;
  capacite: number;
  seuilAffichagePlaces: number;
  capaciteHebergement: number;
  prixDossardDa: number;
  prixHebergementDa: number;
  delaiPreuveJours: number;
}

export interface DocumentRecord {
  id: string;
  organisationId: string;
  slug: string;
  version: string;
  content: string;
  updatedAt: Date;
}

export interface EpreuveRecord {
  id: string;
  editionId: string;
  slug: string;
  nom: string;
  distanceKm: number;
}

export interface CoureurRecord {
  id: string;
  organisationId: string;
  accountId: string;
  editionId: string;
  epreuveId: string;
  epreuveSlug: string;
  epreuveNom: string;
  distanceKm: number;
  prenom: string;
  nom: string;
  telephone: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateNaissance: string;
  tailleTshirt: string;
  /** Nullable : les inscriptions anterieures a la demande du genre n'en portent pas. */
  genre: string | null;
  /** Échéance de dépôt de la preuve, figée à l'inscription. Null en liste d'attente. */
  preuveDueAt: Date | null;
  expiredAt: Date | null;
  age: number;
  categorieAge: string;
  status: string;
  /** Numéro de dossard (nullable : attribué par lot, story 3.4). */
  dossard: number | null;
  /**
   * Jeton e-dossard (story 4.1) : nullable, créé paresseusement à la première
   * consultation du coureur validé — jamais régénéré.
   */
  jetonEdossard: string | null;
  refusalReason: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  dechargeAcceptedAt: Date | null;
  dechargeVersion: string | null;
  reglementAcceptedAt: Date | null;
  reglementVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AcceptDocumentsInput {
  organisationId: string;
  accountId: string;
  editionId: string;
}

export interface AcceptancesSnapshot {
  dechargeAcceptedAt: Date;
  dechargeVersion: string;
  reglementAcceptedAt: Date;
  reglementVersion: string;
}

export interface UpsertCoureurInput {
  organisationId: string;
  accountId: string;
  editionId: string;
  epreuveId: string;
  prenom: string;
  nom: string;
  telephone: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateNaissance: string;
  tailleTshirt: string;
  genre: string;
  age: number;
  categorieAge: string;
}

export interface PreuveRecord {
  id: string;
  organisationId: string;
  coureurId: string;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  createdAt: Date;
}

export interface StoredProofFile {
  storageKey: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
}

export interface SavePreuveInput {
  organisationId: string;
  accountId: string;
  editionId: string;
  file: StoredProofFile;
}

export interface SavePreuveResult {
  preuve: PreuveRecord;
  replaced: PreuveRecord | null;
}

export interface ListCoureursInput {
  organisationId: string;
  editionId: string;
  search?: string;
  /** Story 6.4 (revue) — pagination : décalage de la fenêtre (défaut 0). */
  offset?: number;
}

export interface DossierListItem {
  coureurId: string;
  prenom: string;
  nom: string;
  email: string;
  epreuveSlug: string;
  epreuveNom: string;
  status: string;
  dossard: number | null;
  refusalReason: string | null;
  hasActivePreuve: boolean;
  preuveDepositedAt: Date | null;
  acceptationsCompletes: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type DossierDecision = 'valider' | 'refuser';

/** Résultat du lot d'attribution (story 3.4) — idempotent, jamais de renumérotation. */
export interface DossardsAttribution {
  attribues: number;
  premier: number | null;
  dernier: number | null;
}

export interface AttribuerDossardsInput {
  organisationId: string;
  editionId: string;
}

// Story 4.1 — données coureur nécessaires à la page e-dossard. Renvoyées d'un
// seul tenant par le store (le jeton naît dans la même transaction que la
// lecture du dossard/identité : pas de course avec l'attribution 3.4).

export interface EdossardCoureurData {
  jeton: string;
  dossard: number | null;
  prenom: string;
  nom: string;
  epreuveNom: string;
}

export interface ObtenirJetonEdossardInput {
  organisationId: string;
  accountId: string;
  editionId: string;
}

/**
 * Garde de capacité du lot (pure, testée unitairement) : la suite de la
 * numérotation (base + cibles) doit rester sous le plafond — sinon enveloppe
 * claire (DossardsEpuisesError, 409), jamais un CHECK SQL brut en 500.
 */
export function assertCapaciteDossards(base: number, cibles: number): void {
  if (base + cibles > DOSSARD_MAX) {
    throw new DossardsEpuisesError();
  }
}

export interface DossierDetail {
  coureur: CoureurRecord;
  email: string;
  preuveActive: PreuveRecord | null;
  decidePar: { email: string; decidedAt: Date } | null;
}

export interface DecideDossierInput {
  organisationId: string;
  editionId: string;
  coureurId: string;
  decision: DossierDecision;
  refusalReason: string | null;
  decidedBy: string;
}

export interface ListCoureursResult {
  items: DossierListItem[];
  hasMore: boolean;
}

export interface InscriptionsStore {
  findCurrentEdition(organisationId: string): Promise<EditionRecord | null>;
  countPlacesOccupees(editionId: string, organisationId: string): Promise<number>;
  readDefaultOrgPlaces(): Promise<{ capacite: number; seuil: number; occupees: number } | null>;
  expirerInscriptionsEchues(maintenant: Date): Promise<BilanExpiration>;
  enfilerRappelsPreuve(maintenant: Date): Promise<number>;
  listEpreuves(editionId: string, organisationId: string): Promise<EpreuveRecord[]>;
  findDocuments(organisationId: string): Promise<DocumentRecord[]>;
  findCoureurByAccount(
    accountId: string,
    editionId: string,
    organisationId: string,
  ): Promise<CoureurRecord | null>;
  upsertCoureur(input: UpsertCoureurInput): Promise<CoureurRecord>;
  acceptDocuments(input: AcceptDocumentsInput): Promise<AcceptancesSnapshot>;
  findActivePreuveByAccount(
    accountId: string,
    editionId: string,
    organisationId: string,
  ): Promise<PreuveRecord | null>;
  savePreuve(input: SavePreuveInput): Promise<SavePreuveResult>;
  listCoureurs(input: ListCoureursInput): Promise<ListCoureursResult>;
  findDossierDetail(input: {
    organisationId: string;
    editionId: string;
    coureurId: string;
  }): Promise<DossierDetail | null>;
  decideDossier(input: DecideDossierInput): Promise<CoureurRecord>;
  attribuerDossards(input: AttribuerDossardsInput): Promise<DossardsAttribution>;
  obtenirOuCreerJetonEdossard(
    input: ObtenirJetonEdossardInput,
  ): Promise<EdossardCoureurData | null>;
  findPreuveByIdForOrganisation(
    preuveId: string,
    organisationId: string,
  ): Promise<PreuveRecord | null>;
}

interface PreuveRow {
  id: string;
  organisation_id: string;
  coureur_id: string;
  storage_key: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  status: string;
  created_at: Date;
}

function toPreuveRecord(row: PreuveRow): PreuveRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    coureurId: row.coureur_id,
    storageKey: row.storage_key,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    status: row.status,
    createdAt: row.created_at,
  };
}

type Queryable = Sql | postgres.TransactionSql;

async function selectActivePreuve(
  sql: Queryable,
  accountId: string,
  editionId: string,
  organisationId: string,
  forUpdate = false,
): Promise<PreuveRow | null> {
  const rows = await sql<PreuveRow[]>`
    SELECT p.id, p.organisation_id, p.coureur_id, p.storage_key, p.mime,
           p.size_bytes, p.sha256, p.status, p.created_at
    FROM preuve p
    JOIN coureur c ON c.id = p.coureur_id
    WHERE c.account_id = ${accountId}
      AND c.edition_id = ${editionId}
      AND c.organisation_id = ${organisationId}
      AND p.status = 'active'
    LIMIT 1
    ${forUpdate ? sql`FOR UPDATE OF p` : sql``}
  `;
  const row = rows[0];
  return row ?? null;
}

interface CoureurRow {
  id: string;
  organisation_id: string;
  account_id: string;
  edition_id: string;
  epreuve_id: string;
  epreuve_slug: string;
  epreuve_nom: string;
  distance_km: number;
  first_name: string;
  last_name: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  birth_date: string;
  tshirt_size: string;
  genre: string | null;
  preuve_due_at: Date | null;
  expired_at: Date | null;
  age: number;
  age_category: string;
  status: string;
  dossard: number | null;
  jeton_edossard: string | null;
  refusal_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decharge_accepted_at: Date | null;
  decharge_version: string | null;
  reglement_accepted_at: Date | null;
  reglement_version: string | null;
  created_at: Date;
  updated_at: Date;
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

function toCoureurRecord(row: CoureurRow): CoureurRecord {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    accountId: row.account_id,
    editionId: row.edition_id,
    epreuveId: row.epreuve_id,
    epreuveSlug: row.epreuve_slug,
    epreuveNom: row.epreuve_nom,
    distanceKm: row.distance_km,
    prenom: row.first_name,
    nom: row.last_name,
    telephone: row.phone,
    contactUrgenceNom: row.emergency_contact_name,
    contactUrgenceTelephone: row.emergency_contact_phone,
    dateNaissance: row.birth_date,
    tailleTshirt: row.tshirt_size,
    genre: row.genre,
    preuveDueAt: row.preuve_due_at,
    expiredAt: row.expired_at,
    age: row.age,
    categorieAge: row.age_category,
    status: row.status,
    dossard: row.dossard,
    jetonEdossard: row.jeton_edossard,
    refusalReason: row.refusal_reason,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    dechargeAcceptedAt: row.decharge_accepted_at,
    dechargeVersion: row.decharge_version,
    reglementAcceptedAt: row.reglement_accepted_at,
    reglementVersion: row.reglement_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COUREUR_COLUMNS = `
  c.id, c.organisation_id, c.account_id, c.edition_id, c.epreuve_id,
  c.first_name, c.last_name, c.phone,
  c.emergency_contact_name, c.emergency_contact_phone,
  c.birth_date::text AS birth_date, c.tshirt_size, c.genre, c.age, c.age_category, c.status,
  c.preuve_due_at, c.expired_at,
  c.dossard, c.jeton_edossard, c.refusal_reason, c.decided_by, c.decided_at,
  c.decharge_accepted_at, c.decharge_version,
  c.reglement_accepted_at, c.reglement_version,
  c.created_at, c.updated_at,
  e.slug AS epreuve_slug, e.name AS epreuve_nom, e.distance_km::float8 AS distance_km
`;

const COUREUR_SOURCE = `
  coureur c
  JOIN epreuve e ON e.id = c.epreuve_id
`;

async function selectCoureurByAccount(
  sql: Queryable,
  accountId: string,
  editionId: string,
  organisationId: string,
): Promise<CoureurRecord | null> {
  const rows = await sql<CoureurRow[]>`
    SELECT ${sql.unsafe(COUREUR_COLUMNS)}
    FROM ${sql.unsafe(COUREUR_SOURCE)}
    WHERE c.account_id = ${accountId} AND c.edition_id = ${editionId} AND c.organisation_id = ${organisationId}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toCoureurRecord(row) : null;
}

export function createInscriptionsStore(sql: Sql): InscriptionsStore {
  return {
    async findCurrentEdition(organisationId: string): Promise<EditionRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<
            {
              id: string;
              organisation_id: string;
              slug: string;
              name: string;
              race_date: string;
              registration_closes_at: Date;
              capacite: number;
              seuil_affichage_places: number;
              capacite_hebergement: number;
              prix_dossard_da: number;
              prix_hebergement_da: number;
              delai_preuve_jours: number;
            }[]
          >`
            SELECT id, organisation_id, slug, name, race_date::text AS race_date,
                   registration_closes_at, capacite, seuil_affichage_places,
                   capacite_hebergement, prix_dossard_da, prix_hebergement_da,
                   delai_preuve_jours
            FROM edition
            WHERE organisation_id = ${organisationId}
            ORDER BY race_date DESC
            LIMIT 1
          `;
          const row = rows[0];
          if (!row) {
            return null;
          }
          return {
            id: row.id,
            organisationId: row.organisation_id,
            slug: row.slug,
            nom: row.name,
            dateCourse: row.race_date,
            registrationClosesAt: row.registration_closes_at,
            capacite: row.capacite,
            seuilAffichagePlaces: row.seuil_affichage_places,
            capaciteHebergement: row.capacite_hebergement,
            prixDossardDa: row.prix_dossard_da,
            prixHebergementDa: row.prix_hebergement_da,
            delaiPreuveJours: row.delai_preuve_jours,
          };
        }),
      );
    },

    async countPlacesOccupees(editionId: string, organisationId: string): Promise<number> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ occupees: number }[]>`
            SELECT count(*)::int AS occupees
            FROM coureur
            WHERE edition_id = ${editionId}
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          return rows[0]?.occupees ?? 0;
        }),
      );
    },

    async readDefaultOrgPlaces(): Promise<{
      capacite: number;
      seuil: number;
      occupees: number;
    } | null> {
      return withDb(async () => {
        // Lecture publique pré-session : l'organisation par défaut est résolue
        // hors GUC (même exception documentée que les sponsors), puis tout est
        // lu scopé.
        const organisationId = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
        if (!organisationId) {
          return null;
        }
        return withOrg(sql, organisationId, async (tx) => {
          const editions = await tx<
            { id: string; capacite: number; seuil_affichage_places: number }[]
          >`
            SELECT id, capacite, seuil_affichage_places
            FROM edition
            WHERE organisation_id = ${organisationId}
            ORDER BY race_date DESC
            LIMIT 1
          `;
          const edition = editions[0];
          if (!edition) {
            return null;
          }
          const occupees = await tx<{ occupees: number }[]>`
            SELECT count(*)::int AS occupees
            FROM coureur
            WHERE edition_id = ${edition.id}
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          return {
            capacite: edition.capacite,
            seuil: edition.seuil_affichage_places,
            occupees: occupees[0]?.occupees ?? 0,
          };
        });
      });
    },

    /**
     * Passe en « expirée » tout dossier qui tient une place sans avoir déposé
     * sa preuve avant son échéance, et rend la place.
     *
     * La règle porte sur le DÉPÔT de la preuve, pas sur sa validation : un
     * dossier déposé à temps ne saute pas parce que personne ne l'a encore
     * regardé. Un dossier sans échéance (liste d'attente, inscription
     * antérieure à la règle) n'expire jamais — on ne libère pas une place sur
     * une donnée manquante.
     *
     * Idempotent : le filtre sur `status = 'en constitution'` fait qu'un
     * second passage ne retrouve plus les lignes du premier, et l'index unique
     * partiel absorbe un éventuel doublon d'email.
     */
    async expirerInscriptionsEchues(maintenant: Date): Promise<BilanExpiration> {
      return withDb(async () => {
        const organisationIds = await sql<{ id: string }[]>`SELECT id FROM organisation`;
        let expirees = 0;
        let emailsEnfiles = 0;
        for (const { id: organisationId } of organisationIds) {
          const bilan = await withOrg(sql, organisationId, async (tx) => {
            const lignes = await tx<
              { id: string; email: string; first_name: string; edition_nom: string }[]
            >`
              UPDATE coureur AS c
              SET status = ${COUREUR_STATUS_EXPIREE},
                  expired_at = ${maintenant},
                  updated_at = now()
              FROM account AS a, edition AS e
              WHERE c.account_id = a.id
                AND c.edition_id = e.id
                AND c.organisation_id = ${organisationId}
                AND c.status = ${COUREUR_STATUS_EN_CONSTITUTION}
                AND c.preuve_due_at IS NOT NULL
                AND c.preuve_due_at < ${maintenant}
                AND NOT EXISTS (
                  SELECT 1 FROM preuve AS p
                  WHERE p.coureur_id = c.id AND p.status = 'active'
                )
              RETURNING c.id, a.email, c.first_name, e.name AS edition_nom
            `;
            let enfiles = 0;
            for (const ligne of lignes) {
              const inseres = await tx<{ id: string }[]>`
                INSERT INTO email_outbox (organisation_id, destinataire, type, payload)
                VALUES (
                  ${organisationId}, ${ligne.email}, 'inscription_expiree',
                  ${tx.json({
                    coureurId: ligne.id,
                    prenom: ligne.first_name,
                    edition: ligne.edition_nom,
                  } as unknown as postgres.JSONValue)}
                )
                ON CONFLICT (organisation_id, (payload->>'coureurId'))
                  WHERE (type = 'inscription_expiree')
                DO NOTHING
                RETURNING id
              `;
              enfiles += inseres.length;
            }
            return { expirees: lignes.length, emailsEnfiles: enfiles };
          });
          expirees += bilan.expirees;
          emailsEnfiles += bilan.emailsEnfiles;
        }
        return { expirees, emailsEnfiles };
      });
    },

    /**
     * Rappel unique, la veille de l'échéance : les dossiers dont la limite
     * tombe dans les 24 heures et dont la preuve manque encore.
     *
     * Un seul rappel par dossier, garanti par l'index unique partiel : un cron
     * qui tourne toutes les heures ne doit pas envoyer vingt-quatre emails.
     */
    async enfilerRappelsPreuve(maintenant: Date): Promise<number> {
      return withDb(async () => {
        const fenetre = new Date(maintenant.getTime() + 24 * 60 * 60 * 1000);
        const organisationIds = await sql<{ id: string }[]>`SELECT id FROM organisation`;
        let enfiles = 0;
        for (const { id: organisationId } of organisationIds) {
          enfiles += await withOrg(sql, organisationId, async (tx) => {
            const lignes = await tx<
              { id: string; email: string; first_name: string; preuve_due_at: Date }[]
            >`
              SELECT c.id, a.email, c.first_name, c.preuve_due_at
              FROM coureur AS c
              JOIN account AS a ON a.id = c.account_id
              WHERE c.organisation_id = ${organisationId}
                AND c.status = ${COUREUR_STATUS_EN_CONSTITUTION}
                AND c.preuve_due_at IS NOT NULL
                AND c.preuve_due_at > ${maintenant}
                AND c.preuve_due_at <= ${fenetre}
                AND NOT EXISTS (
                  SELECT 1 FROM preuve AS p
                  WHERE p.coureur_id = c.id AND p.status = 'active'
                )
            `;
            let total = 0;
            for (const ligne of lignes) {
              const inseres = await tx<{ id: string }[]>`
                INSERT INTO email_outbox (organisation_id, destinataire, type, payload)
                VALUES (
                  ${organisationId}, ${ligne.email}, 'rappel_preuve',
                  ${tx.json({
                    coureurId: ligne.id,
                    prenom: ligne.first_name,
                    limite: ligne.preuve_due_at.toISOString(),
                  } as unknown as postgres.JSONValue)}
                )
                ON CONFLICT (organisation_id, (payload->>'coureurId'))
                  WHERE (type = 'rappel_preuve')
                DO NOTHING
                RETURNING id
              `;
              total += inseres.length;
            }
            return total;
          });
        }
        return enfiles;
      });
    },

    async listEpreuves(editionId: string, organisationId: string): Promise<EpreuveRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<
            { id: string; edition_id: string; slug: string; name: string; distance_km: number }[]
          >`
            SELECT id, edition_id, slug, name, distance_km::float8 AS distance_km
            FROM epreuve
            WHERE edition_id = ${editionId} AND organisation_id = ${organisationId}
            ORDER BY distance_km DESC
          `;
          return rows.map((row) => ({
            id: row.id,
            editionId: row.edition_id,
            slug: row.slug,
            nom: row.name,
            distanceKm: row.distance_km,
          }));
        }),
      );
    },

    async findDocuments(organisationId: string): Promise<DocumentRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<
            {
              id: string;
              organisation_id: string;
              slug: string;
              version: string;
              content: string;
              updated_at: Date;
            }[]
          >`
            SELECT id, organisation_id, slug, version, content, updated_at
            FROM document
            WHERE organisation_id = ${organisationId}
            ORDER BY slug ASC
          `;
          return rows.map((row) => ({
            id: row.id,
            organisationId: row.organisation_id,
            slug: row.slug,
            version: row.version,
            content: row.content,
            updatedAt: row.updated_at,
          }));
        }),
      );
    },

    async findCoureurByAccount(
      accountId: string,
      editionId: string,
      organisationId: string,
    ): Promise<CoureurRecord | null> {
      return withDb(() =>
        withOrg(sql, organisationId, (tx) =>
          selectCoureurByAccount(tx, accountId, editionId, organisationId),
        ),
      );
    },

    async upsertCoureur(input: UpsertCoureurInput): Promise<CoureurRecord> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // FOR UPDATE : le verrou sérialise les candidats à la dernière place.
          // Sans lui, dix formulaires envoyés dans la même seconde lisent tous
          // « zéro place occupée » et se croient tous admis — mesuré.
          const editionRows = await tx<
            { registration_closes_at: Date; capacite: number; delai_preuve_jours: number }[]
          >`
            SELECT registration_closes_at, capacite, delai_preuve_jours
            FROM edition WHERE id = ${input.editionId}
            FOR UPDATE
          `;
          const edition = editionRows[0];
          if (!edition) {
            throw new Error('édition introuvable pour l’upsert du coureur');
          }
          if (!isRegistrationOpen(edition.registration_closes_at)) {
            throw new RegistrationClosedError(edition.registration_closes_at);
          }
          // Le dossier du coureur lui-même est exclu du décompte : modifier son
          // inscription ne doit pas lui coûter une seconde place.
          const occupeesRows = await tx<{ occupees: number }[]>`
            SELECT count(*)::int AS occupees
            FROM coureur
            WHERE edition_id = ${input.editionId}
              AND account_id <> ${input.accountId}
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          const statutSiNouveau = statutInitial(
            placesRestantes(edition.capacite, occupeesRows[0]?.occupees ?? 0),
          );
          // Échéance posée UNIQUEMENT pour qui tient une place : un coureur en
          // liste d'attente n'a rien à verser, lui donner un délai reviendrait
          // à lui réclamer un paiement pour une place qu'il n'a pas.
          const echeanceSiNouveau =
            statutSiNouveau === COUREUR_STATUS_EN_CONSTITUTION
              ? limitePreuve(new Date(), edition.delai_preuve_jours)
              : null;
          const rows = await tx<{ id: string }[]>`
            INSERT INTO coureur (
              organisation_id, account_id, edition_id, epreuve_id,
              first_name, last_name, phone,
              emergency_contact_name, emergency_contact_phone,
              birth_date, tshirt_size, genre, age, age_category, status, preuve_due_at
            )
            VALUES (
              ${input.organisationId}, ${input.accountId}, ${input.editionId}, ${input.epreuveId},
              ${input.prenom}, ${input.nom}, ${input.telephone},
              ${input.contactUrgenceNom}, ${input.contactUrgenceTelephone},
              ${input.dateNaissance}, ${input.tailleTshirt}, ${input.genre}, ${input.age},
              ${input.categorieAge}, ${statutSiNouveau}, ${echeanceSiNouveau}
            )
            ON CONFLICT (account_id, edition_id)
            DO UPDATE SET
              epreuve_id = EXCLUDED.epreuve_id,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              phone = EXCLUDED.phone,
              emergency_contact_name = EXCLUDED.emergency_contact_name,
              emergency_contact_phone = EXCLUDED.emergency_contact_phone,
              birth_date = EXCLUDED.birth_date,
              tshirt_size = EXCLUDED.tshirt_size,
              genre = EXCLUDED.genre,
              age = EXCLUDED.age,
              age_category = EXCLUDED.age_category,
              updated_at = now()
            WHERE coureur.status = ANY(${STATUTS_MODIFIABLES as string[]})
            RETURNING id
          `;
          const row = rows[0];
          if (!row) {
            throw new DossierValidatedError();
          }
          const fullRows = await tx<CoureurRow[]>`
            SELECT ${tx.unsafe(COUREUR_COLUMNS)}
            FROM ${tx.unsafe(COUREUR_SOURCE)}
            WHERE c.id = ${row.id}
            LIMIT 1
          `;
          const full = fullRows[0];
          if (!full) {
            throw new Error('relecture du coureur impossible après upsert');
          }
          // Notification « inscription reçue » : même transaction que l’événement
          // (un échec d’insertion fait échouer la soumission — cohérence).
          const emailRows = await tx<{ email: string }[]>`
            SELECT email FROM account WHERE id = ${input.accountId} LIMIT 1
          `;
          const destinataire = emailRows[0]?.email ?? '';
          if (destinataire === '') {
            console.warn(
              '[notifications] coureur %s sans email : ligne outbox « inscription_recue » non insérée',
              full.id,
            );
          } else {
            await insertOutboxEmail(tx, {
              organisationId: input.organisationId,
              destinataire,
              type: 'inscription_recue',
              payload: { prenom: full.first_name, epreuve: full.epreuve_nom },
            });
          }
          return toCoureurRecord(full);
        }),
      );
    },

    async acceptDocuments(input: AcceptDocumentsInput): Promise<AcceptancesSnapshot> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const editionRows = await tx<{ registration_closes_at: Date }[]>`
            SELECT registration_closes_at FROM edition
            WHERE id = ${input.editionId} AND organisation_id = ${input.organisationId}
          `;
          const edition = editionRows[0];
          if (!edition) {
            throw new Error('édition introuvable pour l’acceptation des documents');
          }
          if (!isRegistrationOpen(edition.registration_closes_at)) {
            throw new RegistrationClosedError(edition.registration_closes_at);
          }
          const coureurRows = await tx<{ id: string; status: string }[]>`
            SELECT id, status FROM coureur
            WHERE account_id = ${input.accountId}
              AND edition_id = ${input.editionId}
              AND organisation_id = ${input.organisationId}
            FOR UPDATE
          `;
          const coureur = coureurRows[0];
          if (!coureur) {
            throw new NoCoureurError();
          }
          if (coureur.status !== COUREUR_STATUS_EN_CONSTITUTION) {
            throw new DossierValidatedError();
          }
          const documentRows = await tx<{ slug: string; version: string }[]>`
            SELECT slug, version FROM document
            WHERE organisation_id = ${input.organisationId}
              AND slug IN ('decharge', 'reglement')
          `;
          const versions = new Map(documentRows.map((row) => [row.slug, row.version]));
          const dechargeVersion = versions.get('decharge');
          const reglementVersion = versions.get('reglement');
          if (dechargeVersion === undefined || reglementVersion === undefined) {
            throw new DocumentsMissingError();
          }
          const updatedRows = await tx<
            {
              decharge_accepted_at: Date;
              decharge_version: string;
              reglement_accepted_at: Date;
              reglement_version: string;
            }[]
          >`
            UPDATE coureur SET
              decharge_accepted_at = now(),
              decharge_version = ${dechargeVersion},
              reglement_accepted_at = now(),
              reglement_version = ${reglementVersion},
              updated_at = now()
            WHERE id = ${coureur.id} AND status = ${COUREUR_STATUS_EN_CONSTITUTION}
            RETURNING
              decharge_accepted_at, decharge_version,
              reglement_accepted_at, reglement_version
          `;
          const updated = updatedRows[0];
          if (!updated) {
            throw new DossierValidatedError();
          }
          return {
            dechargeAcceptedAt: updated.decharge_accepted_at,
            dechargeVersion: updated.decharge_version,
            reglementAcceptedAt: updated.reglement_accepted_at,
            reglementVersion: updated.reglement_version,
          };
        }),
      );
    },

    async findActivePreuveByAccount(
      accountId: string,
      editionId: string,
      organisationId: string,
    ): Promise<PreuveRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const row = await selectActivePreuve(tx, accountId, editionId, organisationId);
          return row ? toPreuveRecord(row) : null;
        }),
      );
    },

    async savePreuve(input: SavePreuveInput): Promise<SavePreuveResult> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const editionRows = await tx<{ registration_closes_at: Date }[]>`
            SELECT registration_closes_at FROM edition
            WHERE id = ${input.editionId} AND organisation_id = ${input.organisationId}
          `;
          const edition = editionRows[0];
          if (!edition) {
            throw new Error('édition introuvable pour le dépôt de preuve');
          }
          if (!isRegistrationOpen(edition.registration_closes_at)) {
            throw new RegistrationClosedError(edition.registration_closes_at);
          }
          const coureurRows = await tx<{ id: string; status: string }[]>`
            SELECT id, status FROM coureur
            WHERE account_id = ${input.accountId}
              AND edition_id = ${input.editionId}
              AND organisation_id = ${input.organisationId}
            FOR UPDATE
          `;
          const coureur = coureurRows[0];
          if (!coureur) {
            throw new NoCoureurError();
          }
          if (!canDepositPreuve(coureur.status)) {
            throw new DossierValidatedError();
          }
          const existing = await selectActivePreuve(
            tx,
            input.accountId,
            input.editionId,
            input.organisationId,
            true,
          );
          if (existing && existing.sha256 === input.file.sha256) {
            if (coureur.status === 'refusé') {
              // Octets identiques à la preuve déjà refusée : pas de « nouvelle preuve »,
              // le dossier reste refusé — le coureur doit déposer une version différente.
              throw new PreuveIdenticalRefusedError();
            }
            return { preuve: toPreuveRecord(existing), replaced: null };
          }
          let replaced: PreuveRecord | null = null;
          if (existing) {
            const replacedRows = await tx<PreuveRow[]>`
              UPDATE preuve SET status = 'replaced'
              WHERE id = ${existing.id} AND status = 'active'
              RETURNING id, organisation_id, coureur_id, storage_key, mime,
                        size_bytes, sha256, status, created_at
            `;
            const replacedRow = replacedRows[0];
            if (replacedRow) {
              replaced = toPreuveRecord(replacedRow);
            }
          }
          const insertedRows = await tx<PreuveRow[]>`
            INSERT INTO preuve (
              organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status
            )
            VALUES (
              ${input.organisationId}, ${coureur.id}, ${input.file.storageKey},
              ${input.file.mime}, ${input.file.sizeBytes}, ${input.file.sha256}, 'active'
            )
            RETURNING id, organisation_id, coureur_id, storage_key, mime,
                      size_bytes, sha256, status, created_at
          `;
          const inserted = insertedRows[0];
          if (!inserted) {
            throw new Error('insertion de la preuve impossible');
          }
          if (coureur.status === 'refusé') {
            // Cycle de correction : une nouvelle preuve rouvre le dossier.
            // Le motif reste exigé par le CHECK tant que le statut est « refusé » ;
            // le retour en constitution remet donc refusal_reason à NULL.
            await tx`
              UPDATE coureur
              SET status = ${COUREUR_STATUS_EN_CONSTITUTION}, refusal_reason = NULL, updated_at = now()
              WHERE id = ${coureur.id}
            `;
          }
          return { preuve: toPreuveRecord(inserted), replaced };
        }),
      );
    },

    async listCoureurs(input: ListCoureursInput): Promise<ListCoureursResult> {
      return withDb(async () =>
        withOrg(sql, input.organisationId, async (tx) => {
          const search = input.search?.trim() ?? '';
          const like = search.length > 0 ? `%${escapeLike(search)}%` : null;
          const rows = await tx<
            {
              coureur_id: string;
              first_name: string;
              last_name: string;
              email: string;
              epreuve_slug: string;
              epreuve_nom: string;
              status: string;
              dossard: number | null;
              refusal_reason: string | null;
              preuve_id: string | null;
              preuve_created_at: Date | null;
              decharge_accepted_at: Date | null;
              reglement_accepted_at: Date | null;
              created_at: Date;
              updated_at: Date;
              total_count: number;
            }[]
          >`
            SELECT c.id AS coureur_id, c.first_name, c.last_name, a.email,
                   e.slug AS epreuve_slug, e.name AS epreuve_nom,
                   c.status, c.dossard, c.refusal_reason,
                   p.id AS preuve_id, p.created_at AS preuve_created_at,
                   c.decharge_accepted_at, c.reglement_accepted_at,
                   c.created_at, c.updated_at,
                   count(*) OVER () AS total_count
            FROM coureur c
            JOIN account a ON a.id = c.account_id
            JOIN epreuve e ON e.id = c.epreuve_id
            LEFT JOIN preuve p ON p.coureur_id = c.id AND p.status = 'active'
            WHERE c.edition_id = ${input.editionId}
              AND c.organisation_id = ${input.organisationId}
              ${
                like === null
                  ? tx``
                  : tx`AND (
                        c.first_name ILIKE ${like}
                        OR c.last_name ILIKE ${like}
                        OR a.email ILIKE ${like}
                      )`
              }
            ORDER BY c.created_at DESC
            LIMIT ${LIST_COUREURS_LIMIT}
            OFFSET ${Math.max(0, Math.floor(input.offset ?? 0))}
          `;
          return {
            items: rows.map((row) => ({
              coureurId: row.coureur_id,
              prenom: row.first_name,
              nom: row.last_name,
              email: row.email,
              epreuveSlug: row.epreuve_slug,
              epreuveNom: row.epreuve_nom,
              status: row.status,
              dossard: row.dossard,
              refusalReason: row.refusal_reason,
              hasActivePreuve: row.preuve_id !== null,
              preuveDepositedAt: row.preuve_created_at,
              acceptationsCompletes:
                row.decharge_accepted_at !== null && row.reglement_accepted_at !== null,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            })),
            hasMore: (rows[0]?.total_count ?? 0) > LIST_COUREURS_LIMIT,
          };
        }),
      );
    },

    async findDossierDetail(input: {
      organisationId: string;
      editionId: string;
      coureurId: string;
    }): Promise<DossierDetail | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const coureurRows = await tx<CoureurRow[]>`
            SELECT ${tx.unsafe(COUREUR_COLUMNS)}
            FROM ${tx.unsafe(COUREUR_SOURCE)}
            WHERE c.id = ${input.coureurId}
              AND c.edition_id = ${input.editionId}
              AND c.organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          const coureurRow = coureurRows[0];
          if (!coureurRow) {
            return null;
          }
          const [emailRows, preuveRows, decideParRows] = await Promise.all([
            tx<{ email: string }[]>`
              SELECT email FROM account WHERE id = ${coureurRow.account_id} LIMIT 1
            `,
            tx<PreuveRow[]>`
              SELECT id, organisation_id, coureur_id, storage_key, mime,
                     size_bytes, sha256, status, created_at
              FROM preuve
              WHERE coureur_id = ${input.coureurId} AND status = 'active'
              LIMIT 1
            `,
            coureurRow.decided_by === null
              ? Promise.resolve([] as { email: string }[])
              : tx<{ email: string }[]>`
                  SELECT email FROM account WHERE id = ${coureurRow.decided_by} LIMIT 1
                `,
          ]);
          return {
            coureur: toCoureurRecord(coureurRow),
            email: emailRows[0]?.email ?? '',
            preuveActive: preuveRows[0] ? toPreuveRecord(preuveRows[0]) : null,
            decidePar:
              coureurRow.decided_at !== null && decideParRows[0]
                ? { email: decideParRows[0].email, decidedAt: coureurRow.decided_at }
                : null,
          };
        }),
      );
    },

    async decideDossier(input: DecideDossierInput): Promise<CoureurRecord> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const lockedRows = await tx<CoureurRow[]>`
            SELECT ${tx.unsafe(COUREUR_COLUMNS)}
            FROM ${tx.unsafe(COUREUR_SOURCE)}
            WHERE c.id = ${input.coureurId}
              AND c.edition_id = ${input.editionId}
              AND c.organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE OF c
          `;
          const locked = lockedRows[0];
          if (!locked) {
            throw new DossierNotFoundError();
          }
          let status: 'validé' | 'refusé';
          let refusalReason: string | null = null;
          if (input.decision === 'valider') {
            if (locked.status === 'validé') {
              // Re-validation idempotente : no-op, rien ne change.
              return toCoureurRecord(locked);
            }
            // Garde juridique (stories 1.4 + 1.6) : pas de dossard sans preuve de
            // paiement active NI sans les deux acceptations horodatées. Lecture dans
            // la même transaction que le FOR UPDATE : l'état ne peut pas glisser.
            const preuveActiveRows = await tx<{ id: string }[]>`
              SELECT id FROM preuve
              WHERE coureur_id = ${input.coureurId} AND status = 'active'
              LIMIT 1
            `;
            const piecesManquantes: PieceDossier[] = [];
            if (!preuveActiveRows[0]) {
              piecesManquantes.push('preuve');
            }
            if (locked.decharge_accepted_at === null) {
              piecesManquantes.push('decharge');
            }
            if (locked.reglement_accepted_at === null) {
              piecesManquantes.push('reglement');
            }
            if (piecesManquantes.length > 0) {
              throw new DossierIncompletError(piecesManquantes);
            }
            status = 'validé';
          } else if (input.decision === 'refuser') {
            const motif = input.refusalReason?.trim() ?? '';
            if (motif.length === 0) {
              throw new RefusalReasonRequiredError();
            }
            if (locked.status === 'validé') {
              throw new DossierValidatedError();
            }
            status = 'refusé';
            refusalReason = motif;
          } else {
            throw new Error('décision inconnue');
          }
          const updatedRows = await tx<{ id: string }[]>`
            UPDATE coureur
            SET status = ${status},
                refusal_reason = ${refusalReason},
                decided_by = ${input.decidedBy},
                decided_at = now(),
                updated_at = now()
            WHERE id = ${input.coureurId}
            RETURNING id
          `;
          if (!updatedRows[0]) {
            throw new Error('décision sans résultat');
          }
          const recordRows = await tx<CoureurRow[]>`
            SELECT ${tx.unsafe(COUREUR_COLUMNS)}
            FROM ${tx.unsafe(COUREUR_SOURCE)}
            WHERE c.id = ${input.coureurId}
            LIMIT 1
          `;
          const record = recordRows[0];
          if (!record) {
            throw new Error('relecture du coureur impossible après décision');
          }
          // Notification de décision : même transaction que l’événement ; la
          // re-validation idempotente (no-op) est revenue avant, sans insérer.
          const decisionEmailRows = await tx<{ email: string }[]>`
            SELECT email FROM account WHERE id = ${locked.account_id} LIMIT 1
          `;
          const decisionDestinataire = decisionEmailRows[0]?.email ?? '';
          if (decisionDestinataire === '') {
            console.warn(
              '[notifications] coureur %s sans email : ligne outbox « %s » non insérée',
              locked.id,
              status === 'validé' ? 'dossier_valide' : 'dossier_refuse',
            );
          } else {
            const payload =
              status === 'validé'
                ? { prenom: record.first_name, epreuve: record.epreuve_nom }
                : {
                    prenom: record.first_name,
                    epreuve: record.epreuve_nom,
                    motif: refusalReason ?? '',
                  };
            await insertOutboxEmail(tx, {
              organisationId: input.organisationId,
              destinataire: decisionDestinataire,
              type: status === 'validé' ? 'dossier_valide' : 'dossier_refuse',
              payload,
            });
          }
          return toCoureurRecord(record);
        }),
      );
    },

    async attribuerDossards(input: AttribuerDossardsInput): Promise<DossardsAttribution> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Story 3.4 — lot idempotent : seuls les VALIDÉS SANS dossard sont
          // ciblés. Verrou posé sur les lignes ciblées AVANT la lecture du max :
          // deux lots concurrents se sérialisent (READ COMMITTED re-évalue la
          // condition après le commit du premier — les dossards fraîchement
          // posés quittent le lot). Les déjà numérotés ne sont JAMAIS touchés :
          // pas de renumérotation, pas de réutilisation.
          const cibles = await tx<{ id: string }[]>`
            SELECT c.id
            FROM coureur c
            WHERE c.edition_id = ${input.editionId}
              AND c.organisation_id = ${input.organisationId}
              AND c.status = ${COUREUR_STATUS_VALIDE}
              AND c.dossard IS NULL
            ORDER BY c.created_at ASC, c.id ASC
            FOR UPDATE OF c
          `;
          if (cibles.length === 0) {
            return { attribues: 0, premier: null, dernier: null };
          }
          // Suite du max de l'édition (vu APRÈS le verrou : inclut un éventuel
          // lot concurrent commis entre-temps).
          const maxRows = await tx<{ max: number }[]>`
            SELECT COALESCE(MAX(dossard), 0)::int AS max
            FROM coureur
            WHERE edition_id = ${input.editionId}
              AND organisation_id = ${input.organisationId}
              AND dossard IS NOT NULL
          `;
          const base = maxRows[0]?.max ?? 0;
          // Plafond défendu AVANT toute écriture : un lot qui dépasserait 9999
          // échoue proprement (le lot entier, rien de partiellement posé).
          assertCapaciteDossards(base, cibles.length);
          // Numérotation séquentielle, ordre created_at — la UNIQUE partielle
          // SQL (0022) défend l'unicité en dernier recours.
          for (const [index, cible] of cibles.entries()) {
            const dossard = base + index + 1;
            await tx`
              UPDATE coureur SET dossard = ${dossard}, updated_at = now()
              WHERE id = ${cible.id} AND dossard IS NULL
            `;
          }
          return { attribues: cibles.length, premier: base + 1, dernier: base + cibles.length };
        }),
      );
    },

    // Story 4.1 — jeton e-dossard : créé paresseusement (première consultation
    // du coureur VALIDÉ) et UNE SEULE FOIS, jamais régénéré. Atomicité : le
    // FOR UPDATE pose le verrou coureur — deux consultations concurrentes se
    // sérialisent, la seconde relit le jeton posé par la première et le rend
    // tel quel. L'UPDATE garde `jeton_edossard IS NULL` en prédicat (défense
    // supplémentaire) ; la UNIQUE partielle SQL (0023) reste le dernier
    // recours contre un collision inter-coureurs (128 bits d'aléa : proche de
    // l'impossible, et une violation échoue proprement la transaction).
    async obtenirOuCreerJetonEdossard(
      input: ObtenirJetonEdossardInput,
    ): Promise<EdossardCoureurData | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const lockedRows = await tx<
            {
              id: string;
              status: string;
              dossard: number | null;
              first_name: string;
              last_name: string;
              jeton_edossard: string | null;
              epreuve_nom: string;
            }[]
          >`
            SELECT c.id, c.status, c.dossard, c.first_name, c.last_name,
                   c.jeton_edossard, e.name AS epreuve_nom
            FROM coureur c
            JOIN epreuve e ON e.id = c.epreuve_id
            WHERE c.account_id = ${input.accountId}
              AND c.edition_id = ${input.editionId}
              AND c.organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE OF c
          `;
          const locked = lockedRows[0];
          if (!locked) {
            return null;
          }
          // Seul un dossier VALIDÉ obtient un e-dossard — les autres états
          // (constitution, refusé) ne créent jamais de jeton.
          if (locked.status !== COUREUR_STATUS_VALIDE) {
            return null;
          }
          let jeton = locked.jeton_edossard;
          if (jeton === null) {
            // randomBytes(16) en base64url = 22 caractères (CHECK SQL 0023).
            const candidat = randomBytes(16).toString('base64url');
            const updatedRows = await tx<{ jeton_edossard: string }[]>`
              UPDATE coureur
              SET jeton_edossard = ${candidat}, updated_at = now()
              WHERE id = ${locked.id} AND jeton_edossard IS NULL
              RETURNING jeton_edossard
            `;
            jeton = updatedRows[0]?.jeton_edossard ?? null;
          }
          if (jeton === null) {
            throw new Error('jeton e-dossard non posé après création');
          }
          return {
            jeton,
            dossard: locked.dossard,
            prenom: locked.first_name,
            nom: locked.last_name,
            epreuveNom: locked.epreuve_nom,
          };
        }),
      );
    },

    async findPreuveByIdForOrganisation(
      preuveId: string,
      organisationId: string,
    ): Promise<PreuveRecord | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<PreuveRow[]>`
            SELECT id, organisation_id, coureur_id, storage_key, mime,
                   size_bytes, sha256, status, created_at
            FROM preuve
            WHERE id = ${preuveId}
              AND organisation_id = ${organisationId}
              AND status = 'active'
            LIMIT 1
          `;
          const row = rows[0];
          return row ? toPreuveRecord(row) : null;
        }),
      );
    },
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function createUnavailableStore(): InscriptionsStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    findCurrentEdition: unavailable,
    countPlacesOccupees: unavailable,
    readDefaultOrgPlaces: unavailable,
    expirerInscriptionsEchues: unavailable,
    enfilerRappelsPreuve: unavailable,
    listEpreuves: unavailable,
    findDocuments: unavailable,
    findCoureurByAccount: unavailable,
    upsertCoureur: unavailable,
    acceptDocuments: unavailable,
    findActivePreuveByAccount: unavailable,
    savePreuve: unavailable,
    listCoureurs: unavailable,
    findDossierDetail: unavailable,
    decideDossier: unavailable,
    attribuerDossards: unavailable,
    obtenirOuCreerJetonEdossard: unavailable,
    findPreuveByIdForOrganisation: unavailable,
  };
}

export function getInscriptionsStore(): InscriptionsStore {
  const globals = globalThis as typeof globalThis & {
    __azzelInscriptionsStore?: InscriptionsStore;
  };
  if (globals.__azzelInscriptionsStore) {
    return globals.__azzelInscriptionsStore;
  }
  // Garde de rôle applicatif (story 1.9) : la connexion doit être le rôle
  // soumis au RLS, sur CE store comme sur celui de l'IAM.
  // Pool applicatif partagé — voir `@/db/client`.
  const sql = getDbClient();
  const store =
    sql !== null
      ? protegerStore(sql, createInscriptionsStore(sql), isProductionRuntime())
      : createUnavailableStore();
  globals.__azzelInscriptionsStore = store;
  return store;
}
