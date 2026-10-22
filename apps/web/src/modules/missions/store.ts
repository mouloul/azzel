import { randomBytes } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

import { withOrg } from '@/db/org-scope';
import { INVITATION_TTL_DAYS } from '@/modules/iam/constants';
import { DbUnavailableError } from '@/modules/iam/errors';
import { sha256Hex } from '@/modules/iam/service';
import { insertInvitation, revokePendingInvitations } from '@/modules/iam/store';
import { insertOutboxEmail } from '@/modules/notifications/outbox-store';
import { readDatabaseUrl } from '@/modules/iam/env';

import type { LigneValide, MissionType, StatutInvitation } from './domain';
import { statutInvitation } from './domain';
import {
  AucuneEditionError,
  MissionNotFoundError,
  SecteurNomDupliqueError,
  SecteurNotFoundError,
  SecteurOccupeError,
  VolontaireDejaActifError,
  VolontaireNotFoundError,
} from './errors';

// Story 3.1 — store volontaires : l'import crée comptes + fiches + invitations
// + emails en file DANS UNE SEULE transaction withOrg (atomique : un échec DB
// n'importe rien). Les rejets de validation sont calculés en amont (service) ;
// ici ne restent que les décisions qui dépendent de l'état de la base.

export interface ImportLigneOutcome {
  ligne: number;
  email: string;
  statut: 'créé' | 'ignoré' | 'rejeté';
  raison?: string;
}

export interface VolontaireRecord {
  id: string;
  nom: string;
  email: string;
  telephone: string | null;
  statutInvitation: StatutInvitation;
  expireLe: Date | null;
  createdAt: Date;
}

// Story 3.2 — enregistrements secteurs / missions / affectations. La couverture
// n'est PAS un enregistrement : elle se dérive du nombre d'affectations.

export interface EditionCouranteRecord {
  id: string;
  nom: string;
}

export interface SecteurRecord {
  id: string;
  editionId: string;
  nom: string;
  lieu: string;
  contact: string | null;
  createdAt: Date;
}

export interface MissionRecord {
  id: string;
  secteurId: string;
  type: MissionType;
  titre: string;
  debutLe: Date;
  finLe: Date;
  consignes: string | null;
  createdAt: Date;
}

export interface AffectationRecord {
  missionId: string;
  volontaireId: string;
  volontaireNom: string;
  createdAt: Date;
}

export interface MissionsEtatRecords {
  secteurs: SecteurRecord[];
  missions: MissionRecord[];
  affectations: AffectationRecord[];
}

export interface SauverSecteurInput {
  organisationId: string;
  editionId?: string;
  nom: string;
  lieu: string;
  contact: string | null;
}

export interface SauverMissionInput {
  organisationId: string;
  secteurId: string;
  type: MissionType;
  titre: string;
  debutLe: Date;
  finLe: Date;
  consignes: string | null;
}

/** Mission du volontaire en conflit horaire avec l'affectation en cours. */
export interface MissionConflitRecord {
  missionId: string;
  secteurNom: string;
  type: MissionType;
  titre: string;
  debutLe: Date;
  finLe: Date;
}

export interface MissionsStore {
  importVolontaires(input: {
    organisationId: string;
    lignes: LigneValide[];
    maintenant: Date;
  }): Promise<ImportLigneOutcome[]>;
  listVolontaires(organisationId: string): Promise<VolontaireRecord[]>;
  renvoyerInvitation(input: {
    organisationId: string;
    volontaireId: string;
    maintenant: Date;
  }): Promise<{ email: string; expireLe: Date }>;
  // Story 3.2 — secteurs, missions typées, affectations.
  findCurrentEdition(organisationId: string): Promise<EditionCouranteRecord | null>;
  createSecteur(input: SauverSecteurInput): Promise<SecteurRecord>;
  updateSecteur(secteurId: string, input: SauverSecteurInput): Promise<SecteurRecord | null>;
  deleteSecteur(secteurId: string, organisationId: string): Promise<boolean>;
  createMission(input: SauverMissionInput): Promise<MissionRecord>;
  updateMission(missionId: string, input: SauverMissionInput): Promise<MissionRecord | null>;
  deleteMission(missionId: string, organisationId: string): Promise<boolean>;
  listMissionsEtat(
    organisationId: string,
    editionId: string,
  ): Promise<MissionsEtatRecords>;
  findVolontaireIdByAccount(
    organisationId: string,
    accountId: string,
  ): Promise<string | null>;
  affecter(input: {
    organisationId: string;
    missionId: string;
    volontaireId: string;
  }): Promise<{ cree: boolean; conflits: MissionConflitRecord[] }>;
  desaffecter(input: {
    organisationId: string;
    missionId: string;
    volontaireId: string;
  }): Promise<boolean>;
}

export function genererJetonInvitation(): string {
  return randomBytes(32).toString('base64url');
}

export function dateExpiration(maintenant: Date): Date {
  return new Date(maintenant.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function creerInvitation(
  tx: postgres.TransactionSql,
  input: { organisationId: string; accountId: string; email: string; nom: string; maintenant: Date },
): Promise<void> {
  // Une nouvelle invitation révoque les précédentes non consommées du compte —
  // et annule leurs emails encore en file (statut 'cancelled', 0019).
  await revokePendingInvitations(tx, {
    organisationId: input.organisationId,
    accountId: input.accountId,
  });
  const jeton = genererJetonInvitation();
  // L'email est mis en file DANS la transaction (échec SMTP jamais bloquant :
  // l'envoi reste différé, rejeu worker/CLI) ; le payload porte le jeton brut.
  const emailOutboxId = await insertOutboxEmail(tx, {
    organisationId: input.organisationId,
    destinataire: input.email,
    type: 'invitation_volontaire',
    payload: { nom: input.nom, jeton },
  });
  await insertInvitation(tx, {
    organisationId: input.organisationId,
    accountId: input.accountId,
    jetonHash: sha256Hex(jeton),
    emailOutboxId,
    expireLe: dateExpiration(input.maintenant),
  });
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

interface VolontaireRow {
  id: string;
  nom: string;
  email: string;
  telephone: string | null;
  password_set_at: Date | null;
  invitation: {
    consomme_le: Date | string | null;
    expire_le: string;
    outbox_statut: string;
  } | null;
  created_at: Date;
}

interface SecteurRow {
  id: string;
  edition_id: string;
  nom: string;
  lieu: string;
  contact: string | null;
  created_at: Date;
}

interface MissionRow {
  id: string;
  secteur_id: string;
  type: MissionType;
  titre: string;
  debut_le: Date;
  fin_le: Date;
  consignes: string | null;
  created_at: Date;
}

interface AffectationRow {
  mission_id: string;
  volontaire_id: string;
  volontaire_nom: string;
  created_at: Date;
}

const SECTEUR_COLUMNS = 'id, edition_id, nom, lieu, contact, created_at';

// Requête mission SANS jointure : colonnes non qualifiées possibles.
const MISSION_COLUMNS = 'id, secteur_id, type, titre, debut_le, fin_le, consignes, created_at';

// Requête mission AVEC jointure secteur (listMissionsEtat) : tout qualifier —
// id/created_at existent dans les deux tables.
const MISSION_COLUMNS_JOINT =
  'm.id, m.secteur_id, m.type, m.titre, m.debut_le, m.fin_le, m.consignes, m.created_at';

function toSecteurRecord(row: SecteurRow): SecteurRecord {
  return {
    id: row.id,
    editionId: row.edition_id,
    nom: row.nom,
    lieu: row.lieu,
    contact: row.contact,
    createdAt: row.created_at,
  };
}

function toMissionRecord(row: MissionRow): MissionRecord {
  return {
    id: row.id,
    secteurId: row.secteur_id,
    type: row.type,
    titre: row.titre,
    debutLe: row.debut_le,
    finLe: row.fin_le,
    consignes: row.consignes,
    createdAt: row.created_at,
  };
}

// Violation de l'UNIQUE (edition_id, nom) : refus propre champ nom, pas un 500.
// postgres.js expose le champ sous constraint_name (et le nom dans le message).
function estViolationSecteurNomUnique(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidat = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  if (candidat.code !== '23505') {
    return false;
  }
  const nomContrainte =
    typeof candidat.constraint_name === 'string'
      ? candidat.constraint_name
      : typeof candidat.constraint === 'string'
        ? candidat.constraint
        : typeof candidat.message === 'string'
          ? candidat.message
          : '';
  return nomContrainte.includes('secteur_edition_id_nom_key');
}

const LISTE_COLUMNS = `
  v.id, v.nom, v.telephone, v.created_at, a.email, a.password_set_at,
  (
    SELECT json_build_object(
      'consomme_le', i.consomme_le, 'expire_le', i.expire_le, 'outbox_statut', o.statut
    )
    FROM invitation i
    JOIN email_outbox o ON o.id = i.email_outbox_id
    WHERE i.account_id = v.account_id
    ORDER BY i.created_at DESC
    LIMIT 1
  ) AS invitation
`;

export function createMissionsStore(sql: Sql): MissionsStore {
  return {
    async importVolontaires(input: {
      organisationId: string;
      lignes: LigneValide[];
      maintenant: Date;
    }): Promise<ImportLigneOutcome[]> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const outcomes: ImportLigneOutcome[] = [];
          for (const ligne of input.lignes) {
            const existantes = await tx<{ id: string; role: string }[]>`
              SELECT id, role FROM account
              WHERE organisation_id = ${input.organisationId} AND email = ${ligne.email}
              LIMIT 1
            `;
            const existante = existantes[0];
            if (existante) {
              // Rôle unique par compte : déjà volontaire → ignoré (invitation
              // NON renvoyée — re-import silencieux interdit) ; autre rôle →
              // rejeté avec raison explicite.
              if (existante.role === 'volontaire') {
                outcomes.push({
                  ligne: ligne.ligne,
                  email: ligne.email,
                  statut: 'ignoré',
                  raison: 'déjà volontaire — invitation non renvoyée',
                });
              } else if (existante.role === 'organisateur') {
                outcomes.push({
                  ligne: ligne.ligne,
                  email: ligne.email,
                  statut: 'rejeté',
                  raison: 'un compte organisateur existe déjà',
                });
              } else {
                outcomes.push({
                  ligne: ligne.ligne,
                  email: ligne.email,
                  statut: 'rejeté',
                  raison: 'un compte coureur existe déjà',
                });
              }
              continue;
            }
            const comptes = await tx<{ id: string }[]>`
              INSERT INTO account (organisation_id, email, role)
              VALUES (${input.organisationId}, ${ligne.email}, 'volontaire')
              RETURNING id
            `;
            const compte = comptes[0];
            if (!compte) {
              throw new Error('insertion du compte volontaire sans résultat');
            }
            await tx`
              INSERT INTO volontaire (organisation_id, account_id, nom, telephone)
              VALUES (${input.organisationId}, ${compte.id}, ${ligne.nom}, ${ligne.telephone})
            `;
            await creerInvitation(tx, {
              organisationId: input.organisationId,
              accountId: compte.id,
              email: ligne.email,
              nom: ligne.nom,
              maintenant: input.maintenant,
            });
            outcomes.push({ ligne: ligne.ligne, email: ligne.email, statut: 'créé' });
          }
          return outcomes;
        }),
      );
    },

    async listVolontaires(organisationId: string): Promise<VolontaireRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<VolontaireRow[]>`
            SELECT ${tx.unsafe(LISTE_COLUMNS)}
            FROM volontaire v
            JOIN account a ON a.id = v.account_id
            WHERE v.organisation_id = ${organisationId}
            ORDER BY v.created_at ASC, v.id ASC
          `;
          return rows.map((row) => {
            // json_build_object relit les timestamptz en ISO : normalisation.
            const brute = row.invitation;
            const expireLe = brute === null ? null : new Date(brute.expire_le);
            const consommeLe =
              brute === null || brute.consomme_le === null
                ? null
                : new Date(brute.consomme_le);
            const statut: StatutInvitation = statutInvitation({
              passwordSetAt: row.password_set_at,
              invitation:
                brute === null || expireLe === null
                  ? null
                  : {
                      consommeLe,
                      expireLe,
                      outboxStatut: brute.outbox_statut,
                    },
            });
            return {
              id: row.id,
              nom: row.nom,
              email: row.email,
              telephone: row.telephone,
              statutInvitation: statut,
              expireLe,
              createdAt: row.created_at,
            };
          });
        }),
      );
    },

    async renvoyerInvitation(input: {
      organisationId: string;
      volontaireId: string;
      maintenant: Date;
    }): Promise<{ email: string; expireLe: Date }> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<
            { account_id: string; nom: string; email: string; password_set_at: Date | null }[]
          >`
            SELECT v.account_id, v.nom, a.email, a.password_set_at
            FROM volontaire v
            JOIN account a ON a.id = v.account_id
            WHERE v.id = ${input.volontaireId} AND v.organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE OF v
          `;
          const volontaire = rows[0];
          if (!volontaire) {
            throw new VolontaireNotFoundError();
          }
          if (volontaire.password_set_at !== null) {
            throw new VolontaireDejaActifError();
          }
          await creerInvitation(tx, {
            organisationId: input.organisationId,
            accountId: volontaire.account_id,
            email: volontaire.email,
            nom: volontaire.nom,
            maintenant: input.maintenant,
          });
          return {
            email: volontaire.email,
            expireLe: dateExpiration(input.maintenant),
          };
        }),
      );
    },

    // -----------------------------------------------------------------
    // Story 3.2 — secteurs / missions typées / affectations.
    // -----------------------------------------------------------------

    async findCurrentEdition(organisationId: string): Promise<EditionCouranteRecord | null> {
      // Pattern findCurrentEdition d'inscriptions, répliqué LOCALEMENT (aucun
      // import cross-module) : la plus proche date_course = la plus récente.
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ id: string; name: string }[]>`
            SELECT id, name FROM edition
            WHERE organisation_id = ${organisationId}
            ORDER BY race_date DESC
            LIMIT 1
          `;
          const row = rows[0];
          return row ? { id: row.id, nom: row.name } : null;
        }),
      );
    },

    async createSecteur(input: SauverSecteurInput): Promise<SecteurRecord> {
      const editionId = input.editionId;
      if (!editionId) {
        throw new AucuneEditionError();
      }
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          let rows: SecteurRow[];
          try {
            rows = await tx<SecteurRow[]>`
              INSERT INTO secteur (organisation_id, edition_id, nom, lieu, contact)
              VALUES (${input.organisationId}, ${editionId}, ${input.nom}, ${input.lieu}, ${input.contact})
              RETURNING ${tx.unsafe(SECTEUR_COLUMNS)}
            `;
          } catch (error) {
            if (estViolationSecteurNomUnique(error)) {
              throw new SecteurNomDupliqueError();
            }
            throw error;
          }
          const row = rows[0];
          if (!row) {
            throw new Error('insertion du secteur impossible');
          }
          return toSecteurRecord(row);
        }),
      );
    },

    async updateSecteur(
      secteurId: string,
      input: SauverSecteurInput,
    ): Promise<SecteurRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          let rows: SecteurRow[];
          try {
            rows = await tx<SecteurRow[]>`
              UPDATE secteur SET nom = ${input.nom}, lieu = ${input.lieu}, contact = ${input.contact}
              WHERE id = ${secteurId} AND organisation_id = ${input.organisationId}
              RETURNING ${tx.unsafe(SECTEUR_COLUMNS)}
            `;
          } catch (error) {
            if (estViolationSecteurNomUnique(error)) {
              throw new SecteurNomDupliqueError();
            }
            throw error;
          }
          const row = rows[0];
          return row ? toSecteurRecord(row) : null;
        }),
      );
    },

    async deleteSecteur(secteurId: string, organisationId: string): Promise<boolean> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          // Verrou sur la ligne secteur AVANT le comptage : un INSERT mission
          // prend un FOR KEY SHARE sur le secteur référencé — incompatible avec
          // ce FOR UPDATE. Une mission insérée entre le comptage et le DELETE
          // ne peut donc plus partir en cascade silencieuse en contournant le
          // refus 409 (l'insertion concurrente attend notre commit).
          const verrouillee = await tx<{ id: string }[]>`
            SELECT id FROM secteur
            WHERE id = ${secteurId} AND organisation_id = ${organisationId}
            LIMIT 1
            FOR UPDATE
          `;
          if (!verrouillee[0]) {
            return false;
          }
          // Refus CLAIR si le secteur porte encore des missions : la cascade
          // SQL n'est qu'un filet (FK ON DELETE CASCADE), jamais l'outil métier.
          const occupees = await tx<{ count: number }[]>`
            SELECT count(*)::int AS count FROM mission
            WHERE secteur_id = ${secteurId} AND organisation_id = ${organisationId}
          `;
          const nombreMissions = occupees[0]?.count ?? 0;
          if (nombreMissions > 0) {
            throw new SecteurOccupeError(nombreMissions);
          }
          const rows = await tx<{ id: string }[]>`
            DELETE FROM secteur
            WHERE id = ${secteurId} AND organisation_id = ${organisationId}
            RETURNING id
          `;
          return rows.length > 0;
        }),
      );
    },

    async createMission(input: SauverMissionInput): Promise<MissionRecord> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          // Le secteur doit exister ET appartenir à l'organisation (défense en
          // profondeur : la FK vérifie l'existence, le WHERE l'appartenance).
          const secteurs = await tx<{ id: string }[]>`
            SELECT id FROM secteur
            WHERE id = ${input.secteurId} AND organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          if (!secteurs[0]) {
            throw new SecteurNotFoundError();
          }
          const rows = await tx<MissionRow[]>`
            INSERT INTO mission (organisation_id, secteur_id, type, titre, debut_le, fin_le, consignes)
            VALUES (${input.organisationId}, ${input.secteurId}, ${input.type}, ${input.titre},
                    ${input.debutLe}, ${input.finLe}, ${input.consignes})
            RETURNING ${tx.unsafe(MISSION_COLUMNS)}
          `;
          const row = rows[0];
          if (!row) {
            throw new Error('insertion de la mission impossible');
          }
          return toMissionRecord(row);
        }),
      );
    },

    async updateMission(
      missionId: string,
      input: SauverMissionInput,
    ): Promise<MissionRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const secteurs = await tx<{ id: string }[]>`
            SELECT id FROM secteur
            WHERE id = ${input.secteurId} AND organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          if (!secteurs[0]) {
            throw new SecteurNotFoundError();
          }
          const rows = await tx<MissionRow[]>`
            UPDATE mission SET
              secteur_id = ${input.secteurId},
              type = ${input.type},
              titre = ${input.titre},
              debut_le = ${input.debutLe},
              fin_le = ${input.finLe},
              consignes = ${input.consignes}
            WHERE id = ${missionId} AND organisation_id = ${input.organisationId}
            RETURNING ${tx.unsafe(MISSION_COLUMNS)}
          `;
          const row = rows[0];
          return row ? toMissionRecord(row) : null;
        }),
      );
    },

    async deleteMission(missionId: string, organisationId: string): Promise<boolean> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          // Les affectations partent avec la mission (FK ON DELETE CASCADE).
          const rows = await tx<{ id: string }[]>`
            DELETE FROM mission
            WHERE id = ${missionId} AND organisation_id = ${organisationId}
            RETURNING id
          `;
          return rows.length > 0;
        }),
      );
    },

    async listMissionsEtat(
      organisationId: string,
      editionId: string,
    ): Promise<MissionsEtatRecords> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const [secteurRows, missionRows, affectationRows] = await Promise.all([
            tx<SecteurRow[]>`
              SELECT ${tx.unsafe(SECTEUR_COLUMNS)} FROM secteur
              WHERE organisation_id = ${organisationId} AND edition_id = ${editionId}
              ORDER BY created_at ASC, id ASC
            `,
            tx<MissionRow[]>`
              SELECT ${tx.unsafe(MISSION_COLUMNS_JOINT)}
              FROM mission m
              JOIN secteur s ON s.id = m.secteur_id
              WHERE m.organisation_id = ${organisationId} AND s.edition_id = ${editionId}
              ORDER BY m.debut_le ASC, m.created_at ASC, m.id ASC
            `,
            tx<AffectationRow[]>`
              SELECT af.mission_id, af.volontaire_id, v.nom AS volontaire_nom, af.created_at
              FROM affectation af
              JOIN mission m ON m.id = af.mission_id
              JOIN secteur s ON s.id = m.secteur_id
              JOIN volontaire v ON v.id = af.volontaire_id
              WHERE af.organisation_id = ${organisationId} AND s.edition_id = ${editionId}
              ORDER BY af.created_at ASC, af.id ASC
            `,
          ]);
          return {
            secteurs: secteurRows.map(toSecteurRecord),
            missions: missionRows.map(toMissionRecord),
            affectations: affectationRows.map((row) => ({
              missionId: row.mission_id,
              volontaireId: row.volontaire_id,
              volontaireNom: row.volontaire_nom,
              createdAt: row.created_at,
            })),
          };
        }),
      );
    },

    async findVolontaireIdByAccount(
      organisationId: string,
      accountId: string,
    ): Promise<string | null> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ id: string }[]>`
            SELECT id FROM volontaire
            WHERE organisation_id = ${organisationId} AND account_id = ${accountId}
            LIMIT 1
          `;
          return rows[0]?.id ?? null;
        }),
      );
    },

    async affecter(input: {
      organisationId: string;
      missionId: string;
      volontaireId: string;
    }): Promise<{ cree: boolean; conflits: MissionConflitRecord[] }> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const missions = await tx<
            { id: string; secteur_id: string; debut_le: Date; fin_le: Date }[]
          >`
            SELECT m.id, m.secteur_id, m.debut_le, m.fin_le
            FROM mission m
            WHERE m.id = ${input.missionId} AND m.organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE OF m
          `;
          const mission = missions[0];
          if (!mission) {
            throw new MissionNotFoundError();
          }
          const secteurs = await tx<{ id: string; edition_id: string }[]>`
            SELECT id, edition_id FROM secteur
            WHERE id = ${mission.secteur_id} AND organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          const secteur = secteurs[0];
          if (!secteur) {
            throw new MissionNotFoundError();
          }
          const volontaires = await tx<{ id: string }[]>`
            SELECT id FROM volontaire
            WHERE id = ${input.volontaireId} AND organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE
          `;
          if (!volontaires[0]) {
            throw new VolontaireNotFoundError();
          }
          // Verrou volontaire posé AVANT l'insertion : deux affectations
          // concurrentes chevauchantes du MÊME volontaire se sérialisent —
          // la seconde attend le commit de la première et VOIT son affectation
          // dans la requête de conflits (READ COMMITTED sinon : aveuglement
          // mutuel, avertissement perdu). Volontaires distincts : jamais bloqués.
          // Doublon ignoré proprement (UNIQUE mission_id + volontaire_id) :
          // ré-affecter le même volontaire est idempotent, jamais une erreur.
          const inserees = await tx<{ id: string }[]>`
            INSERT INTO affectation (organisation_id, mission_id, volontaire_id)
            VALUES (${input.organisationId}, ${input.missionId}, ${input.volontaireId})
            ON CONFLICT (mission_id, volontaire_id) DO NOTHING
            RETURNING id
          `;
          // Chevauchement AVERTI, jamais bloqué : a.debut < b.fin AND b.debut <
          // a.fin, même volontaire, même édition (autres secteurs inclus),
          // mission cible exclue (elle se chevauche avec elle-même).
          const conflitRows = await tx<
            {
              mission_id: string;
              secteur_nom: string;
              type: MissionType;
              titre: string;
              debut_le: Date;
              fin_le: Date;
            }[]
          >`
            SELECT m.id AS mission_id, s.nom AS secteur_nom, m.type, m.titre,
                   m.debut_le, m.fin_le
            FROM affectation af
            JOIN mission m ON m.id = af.mission_id
            JOIN secteur s ON s.id = m.secteur_id
            WHERE af.volontaire_id = ${input.volontaireId}
              AND af.organisation_id = ${input.organisationId}
              AND s.edition_id = ${secteur.edition_id}
              AND m.id <> ${input.missionId}
              AND m.debut_le < ${mission.fin_le}
              AND ${mission.debut_le} < m.fin_le
            ORDER BY m.debut_le ASC
          `;
          const conflits: MissionConflitRecord[] = conflitRows.map((row) => ({
            missionId: row.mission_id,
            secteurNom: row.secteur_nom,
            type: row.type,
            titre: row.titre,
            debutLe: row.debut_le,
            finLe: row.fin_le,
          }));
          return { cree: inserees.length > 0, conflits };
        }),
      );
    },

    async desaffecter(input: {
      organisationId: string;
      missionId: string;
      volontaireId: string;
    }): Promise<boolean> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<{ id: string }[]>`
            DELETE FROM affectation
            WHERE mission_id = ${input.missionId}
              AND volontaire_id = ${input.volontaireId}
              AND organisation_id = ${input.organisationId}
            RETURNING id
          `;
          return rows.length > 0;
        }),
      );
    },
  };
}

function createUnavailableStore(): MissionsStore {
  const unavailable = (): never => {
    throw new DbUnavailableError(new Error('DATABASE_URL absente'));
  };
  return {
    importVolontaires: unavailable,
    listVolontaires: unavailable,
    renvoyerInvitation: unavailable,
    findCurrentEdition: unavailable,
    createSecteur: unavailable,
    updateSecteur: unavailable,
    deleteSecteur: unavailable,
    createMission: unavailable,
    updateMission: unavailable,
    deleteMission: unavailable,
    listMissionsEtat: unavailable,
    findVolontaireIdByAccount: unavailable,
    affecter: unavailable,
    desaffecter: unavailable,
  };
}

export function getMissionsStore(): MissionsStore {
  const globals = globalThis as typeof globalThis & {
    __azzelMissionsStore?: MissionsStore;
  };
  if (globals.__azzelMissionsStore) {
    return globals.__azzelMissionsStore;
  }
  const databaseUrl = readDatabaseUrl();
  const store = databaseUrl
    ? createMissionsStore(
        postgres(databaseUrl, { max: 5, connect_timeout: 5, idle_timeout: 20 }),
      )
    : createUnavailableStore();
  globals.__azzelMissionsStore = store;
  return store;
}
