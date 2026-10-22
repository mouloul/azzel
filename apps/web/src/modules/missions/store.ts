import { randomBytes } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

import { withOrg } from '@/db/org-scope';
import { INVITATION_TTL_DAYS } from '@/modules/iam/constants';
import { DbUnavailableError } from '@/modules/iam/errors';
import { sha256Hex } from '@/modules/iam/service';
import { insertInvitation, revokePendingInvitations } from '@/modules/iam/store';
import { insertOutboxEmail } from '@/modules/notifications/outbox-store';
import { readDatabaseUrl } from '@/modules/iam/env';

import type { LigneValide, StatutInvitation } from './domain';
import { statutInvitation } from './domain';
import { VolontaireDejaActifError, VolontaireNotFoundError } from './errors';

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
    expire_le: Date | string;
    outbox_statut: string;
  } | null;
  created_at: Date;
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
