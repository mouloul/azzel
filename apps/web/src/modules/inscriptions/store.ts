import postgres, { type Sql } from 'postgres';

import { readDatabaseUrl } from '@/modules/iam/env';

import { COUREUR_STATUS_EN_CONSTITUTION, isRegistrationOpen } from './domain';
import {
  DbUnavailableError,
  DocumentsMissingError,
  DossierValidatedError,
  NoCoureurError,
  RegistrationClosedError,
} from './errors';

export interface EditionRecord {
  id: string;
  organisationId: string;
  slug: string;
  nom: string;
  dateCourse: string;
  registrationClosesAt: Date;
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
  age: number;
  categorieAge: string;
  status: string;
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

export interface InscriptionsStore {
  findCurrentEdition(organisationId: string): Promise<EditionRecord | null>;
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
  age: number;
  age_category: string;
  status: string;
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
    age: row.age,
    categorieAge: row.age_category,
    status: row.status,
    dechargeAcceptedAt: row.decharge_accepted_at,
    dechargeVersion: row.decharge_version,
    reglementAcceptedAt: row.reglement_accepted_at,
    reglementVersion: row.reglement_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function selectCoureurByAccount(
  sql: Sql,
  accountId: string,
  editionId: string,
  organisationId: string,
): Promise<CoureurRecord | null> {
  const rows = await sql<CoureurRow[]>`
    SELECT
      c.id, c.organisation_id, c.account_id, c.edition_id, c.epreuve_id,
      c.first_name, c.last_name, c.phone,
      c.emergency_contact_name, c.emergency_contact_phone,
      c.birth_date::text AS birth_date, c.tshirt_size, c.age, c.age_category, c.status,
      c.decharge_accepted_at, c.decharge_version,
      c.reglement_accepted_at, c.reglement_version,
      c.created_at, c.updated_at,
      e.slug AS epreuve_slug, e.name AS epreuve_nom, e.distance_km::float8 AS distance_km
    FROM coureur c
    JOIN epreuve e ON e.id = c.epreuve_id
    WHERE c.account_id = ${accountId} AND c.edition_id = ${editionId} AND c.organisation_id = ${organisationId}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toCoureurRecord(row) : null;
}

export function createInscriptionsStore(sql: Sql): InscriptionsStore {
  return {
    async findCurrentEdition(organisationId: string): Promise<EditionRecord | null> {
      return withDb(async () => {
        const rows = await sql<
          {
            id: string;
            organisation_id: string;
            slug: string;
            name: string;
            race_date: string;
            registration_closes_at: Date;
          }[]
        >`
          SELECT id, organisation_id, slug, name, race_date::text AS race_date, registration_closes_at
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
        };
      });
    },

    async listEpreuves(editionId: string, organisationId: string): Promise<EpreuveRecord[]> {
      return withDb(async () => {
        const rows = await sql<
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
      });
    },

    async findDocuments(organisationId: string): Promise<DocumentRecord[]> {
      return withDb(async () => {
        const rows = await sql<
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
      });
    },

    async findCoureurByAccount(
      accountId: string,
      editionId: string,
      organisationId: string,
    ): Promise<CoureurRecord | null> {
      return withDb(() =>
        selectCoureurByAccount(sql, accountId, editionId, organisationId),
      );
    },

    async upsertCoureur(input: UpsertCoureurInput): Promise<CoureurRecord> {
      return withDb(() =>
        sql.begin(async (tx) => {
          const editionRows = await tx<{ registration_closes_at: Date }[]>`
            SELECT registration_closes_at FROM edition WHERE id = ${input.editionId}
          `;
          const edition = editionRows[0];
          if (!edition) {
            throw new Error('édition introuvable pour l’upsert du coureur');
          }
          if (!isRegistrationOpen(edition.registration_closes_at)) {
            throw new RegistrationClosedError(edition.registration_closes_at);
          }
          const rows = await tx<{ id: string }[]>`
            INSERT INTO coureur (
              organisation_id, account_id, edition_id, epreuve_id,
              first_name, last_name, phone,
              emergency_contact_name, emergency_contact_phone,
              birth_date, tshirt_size, age, age_category
            )
            VALUES (
              ${input.organisationId}, ${input.accountId}, ${input.editionId}, ${input.epreuveId},
              ${input.prenom}, ${input.nom}, ${input.telephone},
              ${input.contactUrgenceNom}, ${input.contactUrgenceTelephone},
              ${input.dateNaissance}, ${input.tailleTshirt}, ${input.age}, ${input.categorieAge}
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
              age = EXCLUDED.age,
              age_category = EXCLUDED.age_category,
              updated_at = now()
            WHERE coureur.status = ${COUREUR_STATUS_EN_CONSTITUTION}
            RETURNING id
          `;
          const row = rows[0];
          if (!row) {
            throw new DossierValidatedError();
          }
          const fullRows = await tx<CoureurRow[]>`
            SELECT
              c.id, c.organisation_id, c.account_id, c.edition_id, c.epreuve_id,
              c.first_name, c.last_name, c.phone,
              c.emergency_contact_name, c.emergency_contact_phone,
              c.birth_date::text AS birth_date, c.tshirt_size, c.age, c.age_category, c.status,
              c.decharge_accepted_at, c.decharge_version,
              c.reglement_accepted_at, c.reglement_version,
              c.created_at, c.updated_at,
              e.slug AS epreuve_slug, e.name AS epreuve_nom, e.distance_km::float8 AS distance_km
            FROM coureur c
            JOIN epreuve e ON e.id = c.epreuve_id
            WHERE c.id = ${row.id}
            LIMIT 1
          `;
          const full = fullRows[0];
          if (!full) {
            throw new Error('relecture du coureur impossible après upsert');
          }
          return toCoureurRecord(full);
        }),
      );
    },

    async acceptDocuments(input: AcceptDocumentsInput): Promise<AcceptancesSnapshot> {
      return withDb(() =>
        sql.begin(async (tx) => {
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
      return withDb(async () => {
        const row = await selectActivePreuve(sql, accountId, editionId, organisationId);
        return row ? toPreuveRecord(row) : null;
      });
    },

    async savePreuve(input: SavePreuveInput): Promise<SavePreuveResult> {
      return withDb(() =>
        sql.begin(async (tx) => {
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
          if (coureur.status !== COUREUR_STATUS_EN_CONSTITUTION) {
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
          return { preuve: toPreuveRecord(inserted), replaced };
        }),
      );
    },
  };
}

function createUnavailableStore(): InscriptionsStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    findCurrentEdition: unavailable,
    listEpreuves: unavailable,
    findDocuments: unavailable,
    findCoureurByAccount: unavailable,
    upsertCoureur: unavailable,
    acceptDocuments: unavailable,
    findActivePreuveByAccount: unavailable,
    savePreuve: unavailable,
  };
}

export function getInscriptionsStore(): InscriptionsStore {
  const globals = globalThis as typeof globalThis & {
    __azzelInscriptionsStore?: InscriptionsStore;
  };
  if (globals.__azzelInscriptionsStore) {
    return globals.__azzelInscriptionsStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createInscriptionsStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelInscriptionsStore = store;
  return store;
}
