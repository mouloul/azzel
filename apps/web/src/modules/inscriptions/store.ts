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
  COUREUR_STATUS_EN_VALIDATION,
  COUREUR_STATUS_REFUSE,
  COUREUR_STATUS_VALIDE,
  STATUTS_MODIFIABLES,
  COUREUR_STATUS_EXPIREE,
  COUREUR_STATUS_LISTE_ATTENTE,
  estReprise,
  hebergementAccorde,
  limitePreuve,
  STATUTS_OCCUPANT_UNE_PLACE,
  placesRestantes,
  statutApresModification,
  statutInitial,
  LIST_COUREURS_LIMIT,
  canDepositPreuve,
  isRegistrationOpen,
  peutAccepterDocuments,
} from './domain';
import {
  DbUnavailableError,
  DossardsEpuisesError,
  DossierAReprendreError,
  DossierEnValidationError,
  DossierHorsValidationError,
  DossierIncompletError,
  DossierListeAttenteError,
  AcceptationsManquantesError,
  DossierNotFoundError,
  DossierValidatedError,
  DocumentsMissingError,
  NoCoureurError,
  NumeroTransactionDejaUtiliseError,
  PreuveIdenticalRefusedError,
  RegistrationClosedError,
  RefusalReasonRequiredError,
  type PieceDossier,
} from './errors';
import { WILAYA_ETRANGER } from './provenance';

/** Réglages modifiables d'une édition. Tous facultatifs : on n'envoie que ce qu'on change. */
export interface ReglagesEdition {
  capacite?: number;
  seuilAffichagePlaces?: number;
  capaciteHebergement?: number;
  prixDossardDa?: number;
  prixHebergementDa?: number;
  delaiPreuveJours?: number;
  /** 0 ou 1. */
  dateCoursePublique?: number;
}

/** Comptes de versement de l'événement ; null = non renseigné. */
export interface ComptesPaiement {
  ccp: string | null;
  titulaireCcp: string | null;
  baridimob: string | null;
  titulaireBaridimob: string | null;
}

export interface UpdateComptesPaiementInput {
  organisationId: string;
  editionId: string;
  comptes: ComptesPaiement;
}

export interface UpdateReglagesInput {
  organisationId: string;
  editionId: string;
  /** Auteur du changement : le journal doit pouvoir répondre « qui ». */
  accountId: string;
  reglages: ReglagesEdition;
}

export interface CoureurEnAttente {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  epreuveNom: string;
  hebergement: boolean;
  inscritLe: Date;
}

export interface AttribuerPlaceInput {
  organisationId: string;
  coureurId: string;
  maintenant: Date;
}

/** « complet » : aucune place libre au moment de l'attribution. */
export type ResultatAttribution = 'attribuee' | 'complet' | 'introuvable';

export interface LigneJournalReglage {
  champ: string;
  ancienneValeur: number;
  nouvelleValeur: number;
  modifieLe: Date;
  modifiePar: string | null;
}

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
  /** La date exacte est-elle montrée au public ? Sinon : la saison seulement. */
  dateCoursePublique: boolean;
  /** Absent = aucun compte renseigné. */
  comptesPaiement?: ComptesPaiement;
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
  /** Code de wilaya ('15') ou 'ETR'. Nullable : dossiers antérieurs à la question. */
  wilaya: string | null;
  /** Code ISO du pays de résidence, présent si et seulement si wilaya = 'ETR'. */
  pays: string | null;
  /** Échéance de dépôt de la preuve, figée à l'inscription. Null en liste d'attente. */
  preuveDueAt: Date | null;
  expiredAt: Date | null;
  hebergement: boolean;
  age: number;
  categorieAge: string;
  status: string;
  /** Numéro de dossard : posé à la validation du dossier (nullable avant). */
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
  wilaya: string;
  /** Ignoré hors 'ETR' : la base exige pays NULL pour toute autre provenance. */
  pays: string | null;
  hebergement: boolean;
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
  /** null : preuve antérieure à la saisie du numéro. */
  numeroTransaction: string | null;
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
  /** Déjà normalisé (voir numero-transaction.ts). */
  numeroTransaction?: string | null;
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
  countHebergementsOccupes(editionId: string, organisationId: string): Promise<number>;
  readDefaultOrgPlaces(): Promise<{ capacite: number; seuil: number; occupees: number } | null>;
  readDefaultOrgDateCourse(): Promise<{ raceDate: string; publique: boolean } | null>;
  expirerInscriptionsEchues(maintenant: Date): Promise<BilanExpiration>;
  enfilerRappelsPreuve(maintenant: Date): Promise<number>;
  updateReglagesEdition(input: UpdateReglagesInput): Promise<EditionRecord>;
  updateComptesPaiement(input: UpdateComptesPaiementInput): Promise<void>;
  listListeAttente(editionId: string, organisationId: string): Promise<CoureurEnAttente[]>;
  attribuerPlace(input: AttribuerPlaceInput): Promise<ResultatAttribution>;
  listJournalReglages(
    editionId: string,
    organisationId: string,
    limit: number,
  ): Promise<LigneJournalReglage[]>;
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
  numero_transaction: string | null;
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
    numeroTransaction: row.numero_transaction,
  };
}

type Queryable = Sql | postgres.TransactionSql;

/**
 * Erreur levée quand le coureur tente une action que le statut de son dossier
 * n'autorise pas. Le message doit dire POURQUOI : « déjà validé » adressé à un
 * coureur refusé ou en attente de décision l'enverrait chercher une erreur
 * qui n'existe pas.
 */
function erreurStatutFige(status: string): Error {
  if (status === COUREUR_STATUS_EN_VALIDATION) {
    return new DossierEnValidationError();
  }
  if (estReprise(status)) {
    return new DossierAReprendreError(status);
  }
  if (status === COUREUR_STATUS_LISTE_ATTENTE) {
    return new DossierListeAttenteError();
  }
  return new DossierValidatedError();
}

/** Sérialise toute attribution de numéro de l'édition (validation unitaire ou lot). */
async function verrouillerNumerotation(
  sql: Queryable,
  organisationId: string,
  editionId: string,
): Promise<void> {
  await sql`
    SELECT id FROM edition
    WHERE id = ${editionId} AND organisation_id = ${organisationId}
    FOR UPDATE
  `;
}

/** Numéro suivant de l'édition : incrémental, jamais réutilisé, plafonné. */
async function prochainDossard(
  sql: Queryable,
  organisationId: string,
  editionId: string,
): Promise<number> {
  await verrouillerNumerotation(sql, organisationId, editionId);
  const maxRows = await sql<{ max: number }[]>`
    SELECT COALESCE(MAX(dossard), 0)::int AS max
    FROM coureur
    WHERE edition_id = ${editionId}
      AND organisation_id = ${organisationId}
      AND dossard IS NOT NULL
  `;
  const base = maxRows[0]?.max ?? 0;
  assertCapaciteDossards(base, 1);
  return base + 1;
}

async function selectActivePreuve(
  sql: Queryable,
  accountId: string,
  editionId: string,
  organisationId: string,
  forUpdate = false,
): Promise<PreuveRow | null> {
  const rows = await sql<PreuveRow[]>`
    SELECT p.id, p.organisation_id, p.coureur_id, p.storage_key, p.mime,
           p.size_bytes, p.sha256, p.status, p.created_at, p.numero_transaction
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
  wilaya: string | null;
  pays: string | null;
  hebergement: boolean;
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
  // SQLSTATE côté serveur : délai dépassé (57014), arrêt (57P01), démarrage
  // (57P03), connexions saturées (53300).
  '57014',
  '57P01',
  '57P03',
  '53300',
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
    wilaya: row.wilaya,
    pays: row.pays,
    hebergement: row.hebergement,
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
  c.birth_date::text AS birth_date, c.tshirt_size, c.genre, c.wilaya, c.pays, c.age, c.age_category, c.status,
  c.preuve_due_at, c.expired_at, c.hebergement,
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
              date_course_publique: number;
              compte_ccp: string | null;
              compte_baridimob: string | null;
              titulaire_ccp: string | null;
              titulaire_baridimob: string | null;
            }[]
          >`
            SELECT id, organisation_id, slug, name, race_date::text AS race_date,
                   registration_closes_at, capacite, seuil_affichage_places,
                   capacite_hebergement, prix_dossard_da, prix_hebergement_da,
                   delai_preuve_jours, date_course_publique,
                   compte_ccp, titulaire_ccp, compte_baridimob, titulaire_baridimob
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
            dateCoursePublique: row.date_course_publique === 1,
            comptesPaiement: {
              ccp: row.compte_ccp,
              titulaireCcp: row.titulaire_ccp,
              baridimob: row.compte_baridimob,
              titulaireBaridimob: row.titulaire_baridimob,
            },
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

    async countHebergementsOccupes(
      editionId: string,
      organisationId: string,
    ): Promise<number> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ occupes: number }[]>`
            SELECT count(*)::int AS occupes
            FROM coureur
            WHERE edition_id = ${editionId}
              AND hebergement
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          return rows[0]?.occupes ?? 0;
        }),
      );
    },

    async readDefaultOrgDateCourse(): Promise<{ raceDate: string; publique: boolean } | null> {
      return withDb(async () => {
        // Lecture publique pré-session, même exception documentée que les
        // sponsors : l'organisation par défaut est résolue hors GUC, puis la
        // lecture est scopée.
        const organisationId = await findOrganisationIdBySlug(sql, DEFAULT_ORGANISATION_SLUG);
        if (!organisationId) {
          return null;
        }
        return withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ race_date: string; date_course_publique: number }[]>`
            SELECT race_date::text AS race_date, date_course_publique
            FROM edition
            WHERE organisation_id = ${organisationId}
            ORDER BY race_date DESC
            LIMIT 1
          `;
          const row = rows[0];
          return row ? { raceDate: row.race_date, publique: row.date_course_publique === 1 } : null;
        });
      });
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
     * partiel (organisation, coureur, échéance) absorbe un éventuel doublon
     * d'email. L'échéance fait partie de la clé : un dossier repris (nouvelle
     * échéance) qui expire de nouveau est prévenu de nouveau.
     */
    async expirerInscriptionsEchues(maintenant: Date): Promise<BilanExpiration> {
      return withDb(async () => {
        const organisationIds = await sql<{ id: string }[]>`SELECT id FROM organisation`;
        let expirees = 0;
        let emailsEnfiles = 0;
        for (const { id: organisationId } of organisationIds) {
          const bilan = await withOrg(sql, organisationId, async (tx) => {
            const lignes = await tx<
              {
                id: string;
                email: string;
                first_name: string;
                edition_nom: string;
                preuve_due_at: Date;
              }[]
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
              RETURNING c.id, a.email, c.first_name, e.name AS edition_nom, c.preuve_due_at
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
                    echeance: ligne.preuve_due_at.toISOString(),
                  } as unknown as postgres.JSONValue)}
                )
                ON CONFLICT (organisation_id, (payload->>'coureurId'), (payload->>'echeance'))
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
     * Un seul rappel par dossier ET par échéance, garanti par l'index unique
     * partiel : un cron qui tourne toutes les heures ne doit pas envoyer
     * vingt-quatre emails, mais un dossier repris (nouvelle échéance) est
     * rappelé de nouveau.
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
                    echeance: ligne.preuve_due_at.toISOString(),
                  } as unknown as postgres.JSONValue)}
                )
                ON CONFLICT (organisation_id, (payload->>'coureurId'), (payload->>'echeance'))
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

    /**
     * Applique les réglages et journalise CHAQUE champ réellement modifié.
     *
     * Sous verrou : les anciennes valeurs sont lues et réécrites dans la même
     * transaction, sinon deux organisateurs qui enregistrent en même temps
     * produiraient un journal qui ne correspond à aucun état réel.
     */
    async updateComptesPaiement(input: UpdateComptesPaiementInput): Promise<void> {
      await withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          await tx`
            UPDATE edition
            SET compte_ccp = ${input.comptes.ccp},
                titulaire_ccp = ${input.comptes.titulaireCcp},
                compte_baridimob = ${input.comptes.baridimob},
                titulaire_baridimob = ${input.comptes.titulaireBaridimob}
            WHERE id = ${input.editionId}
          `;
        }),
      );
    },

    async updateReglagesEdition(input: UpdateReglagesInput): Promise<EditionRecord> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const avantRows = await tx<Record<string, number>[]>`
            SELECT capacite, seuil_affichage_places, capacite_hebergement,
                   prix_dossard_da, prix_hebergement_da, delai_preuve_jours, date_course_publique
            FROM edition WHERE id = ${input.editionId}
            FOR UPDATE
          `;
          const avant = avantRows[0];
          if (!avant) {
            throw new Error('édition introuvable pour la mise à jour des réglages');
          }
          const colonnes: [keyof ReglagesEdition, string][] = [
            ['capacite', 'capacite'],
            ['seuilAffichagePlaces', 'seuil_affichage_places'],
            ['capaciteHebergement', 'capacite_hebergement'],
            ['prixDossardDa', 'prix_dossard_da'],
            ['prixHebergementDa', 'prix_hebergement_da'],
            ['delaiPreuveJours', 'delai_preuve_jours'],
            ['dateCoursePublique', 'date_course_publique'],
          ];
          for (const [champ, colonne] of colonnes) {
            const nouvelle = input.reglages[champ];
            const ancienne = avant[colonne];
            // Champ absent de l'envoi, ou valeur identique : rien à écrire et
            // surtout rien à journaliser — une ligne « 600 → 600 » ferait
            // croire à une décision qui n'a pas eu lieu.
            if (nouvelle === undefined || ancienne === undefined || nouvelle === ancienne) {
              continue;
            }
            await tx`
              UPDATE edition SET ${tx.unsafe(colonne)} = ${nouvelle}
              WHERE id = ${input.editionId}
            `;
            await tx`
              INSERT INTO edition_reglage_journal (
                organisation_id, edition_id, champ, ancienne_valeur,
                nouvelle_valeur, modifie_par
              )
              VALUES (
                ${input.organisationId}, ${input.editionId}, ${champ},
                ${ancienne}, ${nouvelle}, ${input.accountId}
              )
            `;
          }
          const apres = await tx<Record<string, unknown>[]>`
            SELECT id, organisation_id, slug, name, race_date::text AS race_date,
                   registration_closes_at, capacite, seuil_affichage_places,
                   capacite_hebergement, prix_dossard_da, prix_hebergement_da,
                   delai_preuve_jours, date_course_publique
            FROM edition WHERE id = ${input.editionId}
          `;
          const row = apres[0] as {
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
            date_course_publique: number;
          };
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
            dateCoursePublique: row.date_course_publique === 1,
          };
        }),
      );
    },

    /** File d'attente, du plus ancien au plus récent : l'ordre d'arrivée. */
    async listListeAttente(
      editionId: string,
      organisationId: string,
    ): Promise<CoureurEnAttente[]> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<
            {
              id: string;
              first_name: string;
              last_name: string;
              email: string;
              epreuve_nom: string;
              hebergement: boolean;
              created_at: Date;
            }[]
          >`
            SELECT c.id, c.first_name, c.last_name, a.email,
                   e.name AS epreuve_nom, c.hebergement, c.created_at
            FROM coureur AS c
            JOIN account AS a ON a.id = c.account_id
            JOIN epreuve AS e ON e.id = c.epreuve_id
            WHERE c.edition_id = ${editionId}
              AND c.organisation_id = ${organisationId}
              AND c.status = ${COUREUR_STATUS_LISTE_ATTENTE}
            ORDER BY c.created_at ASC, c.id ASC
          `;
          return rows.map((row) => ({
            id: row.id,
            prenom: row.first_name,
            nom: row.last_name,
            email: row.email,
            epreuveNom: row.epreuve_nom,
            hebergement: row.hebergement,
            inscritLe: row.created_at,
          }));
        }),
      );
    },

    /**
     * Donne une place à un coureur en attente, sous le même verrou que les
     * inscriptions : l'organisation ne doit pas pouvoir créer une place qui
     * n'existe pas en cliquant pendant qu'un coureur s'inscrit.
     *
     * Le délai de preuve repart de l'attribution : le coureur n'est pas puni
     * d'avoir attendu.
     */
    async attribuerPlace(input: AttribuerPlaceInput): Promise<ResultatAttribution> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const coureurs = await tx<{ edition_id: string; status: string }[]>`
            SELECT edition_id, status FROM coureur
            WHERE id = ${input.coureurId} AND organisation_id = ${input.organisationId}
          `;
          const coureur = coureurs[0];
          if (!coureur || coureur.status !== COUREUR_STATUS_LISTE_ATTENTE) {
            return 'introuvable';
          }
          const editions = await tx<{ capacite: number; delai_preuve_jours: number }[]>`
            SELECT capacite, delai_preuve_jours FROM edition
            WHERE id = ${coureur.edition_id}
            FOR UPDATE
          `;
          const edition = editions[0];
          if (!edition) {
            return 'introuvable';
          }
          const occupees = await tx<{ occupees: number }[]>`
            SELECT count(*)::int AS occupees FROM coureur
            WHERE edition_id = ${coureur.edition_id}
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          if (placesRestantes(edition.capacite, occupees[0]?.occupees ?? 0) <= 0) {
            return 'complet';
          }
          await tx`
            UPDATE coureur
            SET status = ${COUREUR_STATUS_EN_CONSTITUTION},
                preuve_due_at = ${limitePreuve(input.maintenant, edition.delai_preuve_jours)},
                updated_at = now()
            WHERE id = ${input.coureurId}
          `;
          return 'attribuee';
        }),
      );
    },

    async listJournalReglages(
      editionId: string,
      organisationId: string,
      limit: number,
    ): Promise<LigneJournalReglage[]> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<
            {
              champ: string;
              ancienne_valeur: number;
              nouvelle_valeur: number;
              modifie_le: Date;
              email: string | null;
            }[]
          >`
            SELECT j.champ, j.ancienne_valeur, j.nouvelle_valeur, j.modifie_le, a.email
            FROM edition_reglage_journal AS j
            LEFT JOIN account AS a ON a.id = j.modifie_par
            WHERE j.edition_id = ${editionId}
              AND j.organisation_id = ${organisationId}
            ORDER BY j.modifie_le DESC
            LIMIT ${limit}
          `;
          return rows.map((row) => ({
            champ: row.champ,
            ancienneValeur: row.ancienne_valeur,
            nouvelleValeur: row.nouvelle_valeur,
            modifieLe: row.modifie_le,
            modifiePar: row.email,
          }));
        }),
      );
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
            {
              registration_closes_at: Date;
              capacite: number;
              delai_preuve_jours: number;
              capacite_hebergement: number;
            }[]
          >`
            SELECT registration_closes_at, capacite, delai_preuve_jours,
                   capacite_hebergement
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
          // Dossier existant verrouillé : son statut décide si l'enregistrement
          // est une simple correction, une reprise (refusé, expiré) ou un refus
          // (figé). Lu APRÈS le verrou d'édition, il ne peut plus glisser — une
          // décision de l'organisation verrouille la même ligne.
          const existantRows = await tx<{ id: string; status: string }[]>`
            SELECT id, status FROM coureur
            WHERE account_id = ${input.accountId}
              AND edition_id = ${input.editionId}
              AND organisation_id = ${input.organisationId}
            FOR UPDATE
          `;
          const existant = existantRows[0] ?? null;
          // Le dossier du coureur lui-même est exclu du décompte : modifier son
          // inscription ne doit pas lui coûter une seconde place.
          const occupeesRows = await tx<{ occupees: number }[]>`
            SELECT count(*)::int AS occupees
            FROM coureur
            WHERE edition_id = ${input.editionId}
              AND account_id <> ${input.accountId}
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          const restantes = placesRestantes(edition.capacite, occupeesRows[0]?.occupees ?? 0);
          const statutSiNouveau = statutInitial(restantes);
          let reprise = false;
          let statutReprise = statutSiNouveau;
          if (existant !== null) {
            const apres = statutApresModification(existant.status, restantes);
            if (apres === null) {
              throw erreurStatutFige(existant.status);
            }
            reprise = estReprise(existant.status);
            statutReprise = apres;
          }
          // Même verrou, même exclusion de soi : renoncer puis redemander
          // l'hébergement ne doit pas compter deux lits.
          const litsRows = await tx<{ occupes: number }[]>`
            SELECT count(*)::int AS occupes
            FROM coureur
            WHERE edition_id = ${input.editionId}
              AND account_id <> ${input.accountId}
              AND hebergement
              AND status = ANY(${STATUTS_OCCUPANT_UNE_PLACE as string[]})
          `;
          const hebergement = hebergementAccorde(
            input.hebergement,
            placesRestantes(edition.capacite_hebergement, litsRows[0]?.occupes ?? 0),
          );
          // Échéance posée UNIQUEMENT pour qui tient une place : un coureur en
          // liste d'attente n'a rien à verser, lui donner un délai reviendrait
          // à lui réclamer un paiement pour une place qu'il n'a pas. Une
          // reprise repart de zéro : nouvelle échéance à J+délai, comme une
          // inscription neuve.
          // Pays forcé à NULL hors étranger : la base l'exige (CHECK 0044), et
          // un pays resté d'une saisie précédente ne doit pas faire échouer
          // l'envoi d'un coureur qui a changé d'avis.
          const pays = input.wilaya === WILAYA_ETRANGER ? input.pays : null;
          const echeance = (statut: string): Date | null =>
            statut === COUREUR_STATUS_EN_CONSTITUTION
              ? limitePreuve(new Date(), edition.delai_preuve_jours)
              : null;
          const echeanceSiNouveau = echeance(statutSiNouveau);
          const echeanceReprise = echeance(statutReprise);
          const rows = await tx<{ id: string }[]>`
            INSERT INTO coureur (
              organisation_id, account_id, edition_id, epreuve_id,
              first_name, last_name, phone,
              emergency_contact_name, emergency_contact_phone,
              birth_date, tshirt_size, genre, wilaya, pays,
              age, age_category, status, preuve_due_at,
              hebergement
            )
            VALUES (
              ${input.organisationId}, ${input.accountId}, ${input.editionId}, ${input.epreuveId},
              ${input.prenom}, ${input.nom}, ${input.telephone},
              ${input.contactUrgenceNom}, ${input.contactUrgenceTelephone},
              ${input.dateNaissance}, ${input.tailleTshirt}, ${input.genre},
              ${input.wilaya}, ${pays},
              ${input.age}, ${input.categorieAge}, ${statutSiNouveau}, ${echeanceSiNouveau},
              ${hebergement}
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
              wilaya = EXCLUDED.wilaya,
              pays = EXCLUDED.pays,
              hebergement = EXCLUDED.hebergement,
              age = EXCLUDED.age,
              age_category = EXCLUDED.age_category,
              -- Reprise (refusé, expiré) : le dossier repart du début du cycle.
              -- Le motif de refus tombe (le CHECK l'exige hors « refusé ») ;
              -- expired_at reste, trace de l'expiration passée.
              status = CASE WHEN ${reprise}::boolean
                THEN ${statutReprise}::text ELSE coureur.status END,
              preuve_due_at = CASE WHEN ${reprise}::boolean
                THEN ${echeanceReprise}::timestamptz ELSE coureur.preuve_due_at END,
              refusal_reason = CASE WHEN ${reprise}::boolean
                THEN NULL ELSE coureur.refusal_reason END,
              updated_at = now()
            WHERE coureur.status = ANY(${STATUTS_MODIFIABLES as string[]})
            RETURNING id
          `;
          const row = rows[0];
          if (!row) {
            // Filet : le verrou ci-dessus rend ce cas impossible, sauf ligne
            // créée entre-temps par un chemin qui ne prend pas le verrou.
            throw new DossierValidatedError();
          }
          if (reprise && existant?.status === COUREUR_STATUS_REFUSE) {
            // La preuve refusée cesse d'être active : le coureur doit en
            // déposer une nouvelle. Marquée « refusée » (et non « replaced »)
            // pour que le dépôt du MÊME fichier reste reconnu et refusé.
            await tx`
              UPDATE preuve SET status = 'refusée'
              WHERE coureur_id = ${row.id} AND status = 'active'
            `;
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
          if (!peutAccepterDocuments(coureur.status)) {
            throw erreurStatutFige(coureur.status);
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
            WHERE id = ${coureur.id}
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
          const coureurRows = await tx<
            { id: string; status: string; acceptations_completes: boolean }[]
          >`
            SELECT id, status,
                   (decharge_accepted_at IS NOT NULL AND reglement_accepted_at IS NOT NULL)
                     AS acceptations_completes
            FROM coureur
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
            throw erreurStatutFige(coureur.status);
          }
          // Acceptations AVANT la preuve (PO, 11/11/2026) : un dossier ne part
          // pas à l'examen sans décharge ni règlement — il y resterait bloqué.
          if (!coureur.acceptations_completes) {
            throw new AcceptationsManquantesError();
          }
          // Octets identiques à une preuve déjà refusée : ce n'est pas une
          // « nouvelle preuve ». Le dossier repris doit recevoir un autre
          // justificatif, sinon le même reçu repasserait à l'examen en boucle.
          const dejaRefusee = await tx<{ id: string }[]>`
            SELECT id FROM preuve
            WHERE coureur_id = ${coureur.id}
              AND status = 'refusée'
              AND sha256 = ${input.file.sha256}
            LIMIT 1
          `;
          if (dejaRefusee.length > 0) {
            throw new PreuveIdenticalRefusedError();
          }
          // Le dépôt fait passer le dossier en validation, dans la même
          // transaction que la preuve : jamais de preuve active sur un dossier
          // qui attendrait encore son justificatif.
          const passerEnValidation = async (): Promise<void> => {
            if (coureur.status === COUREUR_STATUS_EN_CONSTITUTION) {
              await tx`
                UPDATE coureur
                SET status = ${COUREUR_STATUS_EN_VALIDATION}, updated_at = now()
                WHERE id = ${coureur.id} AND status = ${COUREUR_STATUS_EN_CONSTITUTION}
              `;
            }
          };
          const existing = await selectActivePreuve(
            tx,
            input.accountId,
            input.editionId,
            input.organisationId,
            true,
          );
          const numeroTransaction = input.numeroTransaction ?? null;
          if (existing && existing.sha256 === input.file.sha256) {
            // Même fichier, même numéro : rejeu, rien à écrire. Même fichier avec
            // un numéro corrigé : c'est une vraie mise à jour, on continue.
            if (existing.numero_transaction === numeroTransaction) {
              await passerEnValidation();
              return { preuve: toPreuveRecord(existing), replaced: null };
            }
          }
          if (numeroTransaction !== null) {
            // Un reçu ne justifie qu'un dossier. Contrôle explicite pour répondre
            // proprement ; l'index unique reste le filet en cas de dépôts simultanés.
            const pris = await tx<{ id: string }[]>`
              SELECT id FROM preuve
              WHERE organisation_id = ${input.organisationId}
                AND numero_transaction = ${numeroTransaction}
                AND status = 'active'
                AND coureur_id <> ${coureur.id}
              LIMIT 1
            `;
            if (pris.length > 0) {
              throw new NumeroTransactionDejaUtiliseError();
            }
          }
          let replaced: PreuveRecord | null = null;
          if (existing) {
            const replacedRows = await tx<PreuveRow[]>`
              UPDATE preuve SET status = 'replaced'
              WHERE id = ${existing.id} AND status = 'active'
              RETURNING id, organisation_id, coureur_id, storage_key, mime,
                        size_bytes, sha256, status, created_at, numero_transaction
            `;
            const replacedRow = replacedRows[0];
            if (replacedRow) {
              replaced = toPreuveRecord(replacedRow);
            }
          }
          let insertedRows: PreuveRow[];
          try {
            insertedRows = await tx<PreuveRow[]>`
              INSERT INTO preuve (
                organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status,
                numero_transaction
              )
              VALUES (
                ${input.organisationId}, ${coureur.id}, ${input.file.storageKey},
                ${input.file.mime}, ${input.file.sizeBytes}, ${input.file.sha256}, 'active',
                ${numeroTransaction}
              )
              RETURNING id, organisation_id, coureur_id, storage_key, mime,
                        size_bytes, sha256, status, created_at, numero_transaction
            `;
          } catch (error) {
            if (
              (error as { constraint_name?: string }).constraint_name ===
              'preuve_numero_transaction_actif_uidx'
            ) {
              throw new NumeroTransactionDejaUtiliseError();
            }
            throw error;
          }
          const inserted = insertedRows[0];
          if (!inserted) {
            throw new Error('insertion de la preuve impossible');
          }
          await passerEnValidation();
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
                     size_bytes, sha256, status, created_at, numero_transaction
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
          let dossardAttribue: number | null = null;
          if (input.decision === 'valider' && locked.status === COUREUR_STATUS_VALIDE) {
            // Re-validation idempotente : no-op, rien ne change.
            return toCoureurRecord(locked);
          }
          if (input.decision === 'refuser' && locked.status === COUREUR_STATUS_VALIDE) {
            throw new DossierValidatedError();
          }
          if (
            (input.decision === 'valider' || input.decision === 'refuser') &&
            locked.status !== COUREUR_STATUS_EN_VALIDATION
          ) {
            // L'organisation ne décide que d'un dossier qui attend sa décision :
            // en constitution, rien n'est encore à examiner ; refusé, expiré ou
            // en liste d'attente, la place n'est plus (ou pas encore) tenue.
            throw new DossierHorsValidationError(locked.status);
          }
          if (input.decision === 'valider') {
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
            // Le numéro naît avec la validation : suite du max de l'édition, lu
            // sous le verrou d'édition pour que deux validations simultanées
            // ne tirent pas le même numéro (la UNIQUE partielle 0022 reste le
            // dernier recours). Un coureur déjà numéroté ne change jamais.
            if (locked.dossard === null) {
              dossardAttribue = await prochainDossard(tx, input.organisationId, input.editionId);
            }
          } else if (input.decision === 'refuser') {
            const motif = input.refusalReason?.trim() ?? '';
            if (motif.length === 0) {
              throw new RefusalReasonRequiredError();
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
                dossard = COALESCE(dossard, ${dossardAttribue}::int),
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
          await verrouillerNumerotation(tx, input.organisationId, input.editionId);
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
                   size_bytes, sha256, status, created_at, numero_transaction
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
    countHebergementsOccupes: unavailable,
    readDefaultOrgPlaces: unavailable,
    readDefaultOrgDateCourse: unavailable,
    expirerInscriptionsEchues: unavailable,
    enfilerRappelsPreuve: unavailable,
    updateReglagesEdition: unavailable,
    updateComptesPaiement: unavailable,
    listListeAttente: unavailable,
    attribuerPlace: unavailable,
    listJournalReglages: unavailable,
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
