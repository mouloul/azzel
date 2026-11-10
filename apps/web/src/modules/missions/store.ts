import type postgres from 'postgres';
import type { Sql } from 'postgres';

import { getDbClient } from '@/db/client';
import { withOrg } from '@/db/org-scope';
import { DbUnavailableError } from '@/modules/iam/errors';
import { COUREUR_STATUS_VALIDE } from '@/modules/inscriptions/domain';
import { insertOutboxEmail } from '@/modules/notifications/outbox-store';

import type { LigneValide, MissionType, StatutInvitation } from './domain';
import { statutInvitation } from './domain';
import {
  AucuneEditionError,
  MissionArriveeUniqueError,
  MissionNotFoundError,
  SecteurNomDupliqueError,
  SecteurNotFoundError,
  SecteurOccupeError,
  VolontaireAffecteError,
  VolontaireDejaActifError,
  VolontaireEmailPrisError,
  VolontaireLieError,
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
  createdAt: Date;
}

// Story 3.2 — enregistrements secteurs / missions / affectations. La couverture
// n'est PAS un enregistrement : elle se dérive du nombre d'affectations.

export interface SauverVolontaireInput {
  organisationId: string;
  nom: string;
  email: string;
  telephone: string | null;
}

export interface VolontaireModifieRecord {
  volontaire: VolontaireRecord;
  /** Adresse changée sur un volontaire non activé → nouvelle invitation en file. */
  invitationRenvoyee: boolean;
}

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
  estArrivee: boolean;
  /** Story 5.2 — barrière horaire du checkpoint, null = pas d'alerte. */
  barriereLe: Date | null;
  createdAt: Date;
}

export interface AffectationRecord {
  missionId: string;
  volontaireId: string;
  volontaireNom: string;
  createdAt: Date;
}

// Stories 3.4/4.1 — coureurs numérotés de l'édition, pour la réplique annuaire
// v2. Identité minimale (NFR-7) : dossard + noms + jeton e-dossard, rien
// d'autre. Le contrat shared exige un jeton par coureur : les validés SANS
// jeton (jamais consulté leur e-dossard) restent hors réplique jusqu'à
// consultation — le scanneur ne verra jamais un jeton null.

export interface CoureurAnnuaireRecord {
  dossard: number;
  nom: string;
  prenom: string;
  jeton: string;
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
  estArrivee: boolean;
  barriereLe: Date | null;
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

/**
 * Décision D2 (revue 3.2) — conflit révélé par la MODIFICATION d'une mission
 * affectée : même forme que le conflit d'affectation + le volontaire concerné.
 */
export interface ConflitModificationRecord extends MissionConflitRecord {
  volontaireId: string;
  volontaireNom: string;
}

export interface MissionModifieeRecord {
  mission: MissionRecord;
  /** Vide si horaires/secteur inchangés ou aucun volontaire en conflit. */
  conflits: ConflitModificationRecord[];
}

export interface MissionsStore {
  importVolontaires(input: {
    organisationId: string;
    lignes: LigneValide[];
  }): Promise<ImportLigneOutcome[]>;
  listVolontaires(organisationId: string): Promise<VolontaireRecord[]>;
  /** Story 3.5 — null = volontaire absent de CETTE organisation (jamais une fuite). */
  updateVolontaire(
    volontaireId: string,
    input: SauverVolontaireInput,
  ): Promise<VolontaireModifieRecord | null>;
  /** Story 3.5 — false = volontaire déjà absent (idempotent côté appelant). */
  deleteVolontaire(volontaireId: string, organisationId: string): Promise<boolean>;
  renvoyerInvitation(input: {
    organisationId: string;
    volontaireId: string;
  }): Promise<{ email: string }>;
  // Story 3.2 — secteurs, missions typées, affectations.
  findCurrentEdition(organisationId: string): Promise<EditionCouranteRecord | null>;
  createSecteur(input: SauverSecteurInput): Promise<SecteurRecord>;
  updateSecteur(secteurId: string, input: SauverSecteurInput): Promise<SecteurRecord | null>;
  deleteSecteur(secteurId: string, organisationId: string): Promise<boolean>;
  createMission(input: SauverMissionInput): Promise<MissionRecord>;
  updateMission(
    missionId: string,
    input: SauverMissionInput,
  ): Promise<MissionModifieeRecord | null>;
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
  listCoureursAnnuaire(
    organisationId: string,
    editionId: string,
  ): Promise<CoureurAnnuaireRecord[]>;
}

/**
 * Met en file l'email d'invitation (payload { nom } — AUCUN jeton : le lien
 * pointe vers /connexion) et en fait l'invitation courante du volontaire
 * (volontaire.invitation_outbox_id, source unique du statut admin). L'email
 * précédent encore pending/failed passe 'cancelled' (0019) : un seul email
 * d'invitation en attente par volontaire. Échec SMTP jamais bloquant : l'envoi
 * reste différé (rejeu worker/CLI).
 */
async function mettreEnFileInvitation(
  tx: postgres.TransactionSql,
  input: { organisationId: string; volontaireId: string; email: string; nom: string },
): Promise<void> {
  await tx`
    UPDATE email_outbox o
    SET statut = 'cancelled'
    FROM volontaire v
    WHERE v.id = ${input.volontaireId}
      AND v.organisation_id = ${input.organisationId}
      AND o.id = v.invitation_outbox_id
      AND o.organisation_id = ${input.organisationId}
      AND o.statut IN ('pending', 'failed')
  `;
  const emailOutboxId = await insertOutboxEmail(tx, {
    organisationId: input.organisationId,
    destinataire: input.email,
    type: 'invitation_volontaire',
    payload: { nom: input.nom },
  });
  await tx`
    UPDATE volontaire SET invitation_outbox_id = ${emailOutboxId}
    WHERE id = ${input.volontaireId} AND organisation_id = ${input.organisationId}
  `;
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

interface VolontaireRow {
  id: string;
  nom: string;
  email: string;
  telephone: string | null;
  activated_at: Date | null;
  outbox_statut: string | null;
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
  est_arrivee: boolean;
  barriere_le: Date | null;
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
const MISSION_COLUMNS =
  'id, secteur_id, type, titre, debut_le, fin_le, consignes, est_arrivee, barriere_le, created_at';

// Requête mission AVEC jointure secteur (listMissionsEtat) : tout qualifier —
// id/created_at existent dans les deux tables.
const MISSION_COLUMNS_JOINT =
  'm.id, m.secteur_id, m.type, m.titre, m.debut_le, m.fin_le, m.consignes, m.est_arrivee, m.barriere_le, m.created_at';

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
    estArrivee: row.est_arrivee,
    barriereLe: row.barriere_le,
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

/** Détail d'erreur postgres.js : constraint_name, à défaut constraint, à défaut message. */
function detailContrainte(error: unknown): { code: string; contrainte: string } | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidat = error as {
    code?: unknown;
    constraint?: unknown;
    constraint_name?: unknown;
    message?: unknown;
  };
  if (typeof candidat.code !== 'string') {
    return null;
  }
  const contrainte =
    typeof candidat.constraint_name === 'string'
      ? candidat.constraint_name
      : typeof candidat.constraint === 'string'
        ? candidat.constraint
        : typeof candidat.message === 'string'
          ? candidat.message
          : '';
  return { code: candidat.code, contrainte };
}

// Story 3.5 — UNIQUE (organisation_id, email) d'account : l'adresse voulue est
// déjà portée par un compte (quel que soit son rôle) → refus champ, pas un 500.
function estViolationAccountEmailUnique(error: unknown): boolean {
  const detail = detailContrainte(error);
  return detail?.code === '23505' && detail.contrainte.includes('account_organisation_id_email_key');
}

// Story 3.5 — le compte reste référencé par une donnée de course (dossier
// décidé, journal de réglages…) : refus lisible, jamais une 500 opaque.
function estViolationCleEtrangere(error: unknown): boolean {
  return detailContrainte(error)?.code === '23503';
}

/**
 * Story 5.1 — « au plus UN checkpoint d'arrivée par édition ». Garde MÉTIER
 * (mission n'a pas de edition_id direct : une contrainte SQL croisant secteur
 * serait fragile). Le FOR UPDATE sur la ligne édition SÉRIALISE les cochages
 * concurrents de la même édition : deux créations/éditions simultanées ne
 * peuvent pas passer toutes deux le comptage (la seconde voit le commit de la
 * première). `missionId` exclut la mission elle-même en édition (re-cocher
 * l'arrivée existante reste idempotent).
 */
async function assertArriveeUnique(
  tx: postgres.TransactionSql,
  input: {
    organisationId: string;
    editionId: string;
    missionId: string | null;
    estArrivee: boolean;
  },
): Promise<void> {
  if (!input.estArrivee) {
    // Décocher ne verrouille RIEN : retour AVANT le FOR UPDATE édition.
    return;
  }
  await tx`SELECT id FROM edition WHERE id = ${input.editionId} FOR UPDATE`;
  const dejaCochees = await tx<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM mission m
    JOIN secteur s ON s.id = m.secteur_id
    WHERE m.organisation_id = ${input.organisationId}
      AND s.edition_id = ${input.editionId}
      AND m.est_arrivee
      AND m.type = 'scan_checkpoint'
      AND (${input.missionId}::uuid IS NULL OR m.id <> ${input.missionId}::uuid)
  `;
  if ((dejaCochees[0]?.count ?? 0) > 0) {
    throw new MissionArriveeUniqueError();
  }
}

/**
 * Chevauchement AVERTI, jamais bloqué : a.debut < b.fin AND b.debut < a.fin,
 * même volontaire, même édition (autres secteurs inclus), mission de
 * référence exclue (elle se chevauche avec elle-même). Requête UNIQUE partagée
 * par l'affectation et la modification de mission (D2).
 */
async function chercherConflits(
  tx: postgres.TransactionSql,
  input: {
    organisationId: string;
    volontaireId: string;
    editionId: string;
    missionId: string;
    debutLe: Date;
    finLe: Date;
  },
): Promise<MissionConflitRecord[]> {
  const rows = await tx<
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
      AND s.edition_id = ${input.editionId}
      AND m.id <> ${input.missionId}
      AND m.debut_le < ${input.finLe}
      AND ${input.debutLe} < m.fin_le
    ORDER BY m.debut_le ASC
  `;
  return rows.map((row) => ({
    missionId: row.mission_id,
    secteurNom: row.secteur_nom,
    type: row.type,
    titre: row.titre,
    debutLe: row.debut_le,
    finLe: row.fin_le,
  }));
}

// Statut admin : activated_at (première connexion) + statut outbox de
// l'invitation courante (volontaire.invitation_outbox_id) — source unique.
const LISTE_COLUMNS = `
  v.id, v.nom, v.telephone, v.created_at, a.email, a.activated_at,
  o.statut AS outbox_statut
`;

function toVolontaireRecord(row: VolontaireRow): VolontaireRecord {
  return {
    id: row.id,
    nom: row.nom,
    email: row.email,
    telephone: row.telephone,
    statutInvitation: statutInvitation({
      activatedAt: row.activated_at,
      outboxStatut: row.outbox_statut,
    }),
    createdAt: row.created_at,
  };
}

export function createMissionsStore(sql: Sql): MissionsStore {
  return {
    async importVolontaires(input: {
      organisationId: string;
      lignes: LigneValide[];
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
            const fiches = await tx<{ id: string }[]>`
              INSERT INTO volontaire (organisation_id, account_id, nom, telephone)
              VALUES (${input.organisationId}, ${compte.id}, ${ligne.nom}, ${ligne.telephone})
              RETURNING id
            `;
            const fiche = fiches[0];
            if (!fiche) {
              throw new Error('insertion de la fiche volontaire sans résultat');
            }
            await mettreEnFileInvitation(tx, {
              organisationId: input.organisationId,
              volontaireId: fiche.id,
              email: ligne.email,
              nom: ligne.nom,
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
            LEFT JOIN email_outbox o ON o.id = v.invitation_outbox_id
            WHERE v.organisation_id = ${organisationId}
            ORDER BY v.created_at ASC, v.id ASC
          `;
          return rows.map(toVolontaireRecord);
        }),
      );
    },

    async updateVolontaire(
      volontaireId: string,
      input: SauverVolontaireInput,
    ): Promise<VolontaireModifieRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<
            { id: string; account_id: string; email: string; activated_at: Date | null }[]
          >`
            SELECT v.id, v.account_id, a.email, a.activated_at
            FROM volontaire v
            JOIN account a ON a.id = v.account_id
            WHERE v.id = ${volontaireId} AND v.organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE OF v
          `;
          const actuel = rows[0];
          if (!actuel) {
            return null;
          }
          const adresseChangee = actuel.email !== input.email;
          await tx`
            UPDATE volontaire
            SET nom = ${input.nom}, telephone = ${input.telephone}
            WHERE id = ${actuel.id} AND organisation_id = ${input.organisationId}
          `;
          if (adresseChangee) {
            try {
              await tx`
                UPDATE account SET email = ${input.email}
                WHERE id = ${actuel.account_id} AND organisation_id = ${input.organisationId}
              `;
            } catch (error) {
              if (estViolationAccountEmailUnique(error)) {
                throw new VolontaireEmailPrisError();
              }
              throw error;
            }
            // login_code est indexé par EMAIL, pas par compte : un code encore
            // valide émis pour l'ancienne adresse ouvrirait un compte NEUF
            // (verifyCodeAndStartSession fait un INSERT … ON CONFLICT) pour une
            // adresse que l'organisation vient de détacher.
            await tx`
              UPDATE login_code SET invalidated_at = now()
              WHERE organisation_id = ${input.organisationId}
                AND email = ${actuel.email}
                AND consumed_at IS NULL
                AND invalidated_at IS NULL
            `;
          }
          // L'invitation ne repart QUE si l'adresse a changé ET que la personne
          // ne s'est jamais connectée : en renvoyer une à un volontaire déjà
          // activé serait un faux signal dans la liste admin.
          const invitationRenvoyee = adresseChangee && actuel.activated_at === null;
          if (invitationRenvoyee) {
            await mettreEnFileInvitation(tx, {
              organisationId: input.organisationId,
              volontaireId: actuel.id,
              email: input.email,
              nom: input.nom,
            });
          }
          const relus = await tx<VolontaireRow[]>`
            SELECT ${tx.unsafe(LISTE_COLUMNS)}
            FROM volontaire v
            JOIN account a ON a.id = v.account_id
            LEFT JOIN email_outbox o ON o.id = v.invitation_outbox_id
            WHERE v.id = ${actuel.id} AND v.organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          const relu = relus[0];
          if (!relu) {
            throw new Error('relecture du volontaire modifié sans résultat');
          }
          return { volontaire: toVolontaireRecord(relu), invitationRenvoyee };
        }),
      );
    },

    async deleteVolontaire(volontaireId: string, organisationId: string): Promise<boolean> {
      return withDb(() =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<{ id: string; account_id: string; email: string }[]>`
            SELECT v.id, v.account_id, a.email
            FROM volontaire v
            JOIN account a ON a.id = v.account_id
            WHERE v.id = ${volontaireId} AND v.organisation_id = ${organisationId}
            LIMIT 1
            FOR UPDATE OF v
          `;
          const volontaire = rows[0];
          if (!volontaire) {
            return false;
          }
          // affectation.volontaire_id est en ON DELETE CASCADE : supprimer sans
          // garde viderait les missions et ferait basculer leur couverture à
          // « vacante » sans que personne ne le voie. Refus chiffré (pattern
          // SecteurOccupeError) — le FOR UPDATE ci-dessus sérialise une
          // affectation concurrente contre cette suppression.
          const comptes = await tx<{ nombre: number }[]>`
            SELECT count(*)::int AS nombre FROM affectation
            WHERE volontaire_id = ${volontaire.id} AND organisation_id = ${organisationId}
          `;
          const nombreAffectations = comptes[0]?.nombre ?? 0;
          if (nombreAffectations > 0) {
            throw new VolontaireAffecteError(nombreAffectations);
          }
          // La file d'envoi ne doit pas expédier l'invitation d'une personne
          // qu'on vient de retirer. Les lignes déjà 'sent' restent : elles
          // tracent ce qui a réellement été envoyé.
          await tx`
            UPDATE email_outbox o
            SET statut = 'cancelled'
            FROM volontaire v
            WHERE v.id = ${volontaire.id}
              AND v.organisation_id = ${organisationId}
              AND o.id = v.invitation_outbox_id
              AND o.organisation_id = ${organisationId}
              AND o.statut IN ('pending', 'failed')
          `;
          await tx`
            UPDATE login_code SET invalidated_at = now()
            WHERE organisation_id = ${organisationId}
              AND email = ${volontaire.email}
              AND consumed_at IS NULL
              AND invalidated_at IS NULL
          `;
          // Le compte, pas seulement la fiche : la fiche seule laisserait
          // l'adresse occupée (UNIQUE) et le bug entier. volontaire suit par
          // account_id ON DELETE CASCADE, session aussi.
          try {
            await tx`
              DELETE FROM account
              WHERE id = ${volontaire.account_id} AND organisation_id = ${organisationId}
            `;
          } catch (error) {
            if (estViolationCleEtrangere(error)) {
              throw new VolontaireLieError();
            }
            throw error;
          }
          return true;
        }),
      );
    },

    async renvoyerInvitation(input: {
      organisationId: string;
      volontaireId: string;
    }): Promise<{ email: string }> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const rows = await tx<
            { id: string; nom: string; email: string; activated_at: Date | null }[]
          >`
            SELECT v.id, v.nom, a.email, a.activated_at
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
          // Déjà connecté au moins une fois : rien à renvoyer (409).
          if (volontaire.activated_at !== null) {
            throw new VolontaireDejaActifError();
          }
          await mettreEnFileInvitation(tx, {
            organisationId: input.organisationId,
            volontaireId: volontaire.id,
            email: volontaire.email,
            nom: volontaire.nom,
          });
          return { email: volontaire.email };
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
          const secteurs = await tx<{ id: string; edition_id: string }[]>`
            SELECT id, edition_id FROM secteur
            WHERE id = ${input.secteurId} AND organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          const secteur = secteurs[0];
          if (!secteur) {
            throw new SecteurNotFoundError();
          }
          await assertArriveeUnique(tx, {
            organisationId: input.organisationId,
            editionId: secteur.edition_id,
            missionId: null,
            estArrivee: input.estArrivee,
          });
          const rows = await tx<MissionRow[]>`
            INSERT INTO mission (organisation_id, secteur_id, type, titre, debut_le, fin_le, consignes, est_arrivee, barriere_le)
            VALUES (${input.organisationId}, ${input.secteurId}, ${input.type}, ${input.titre},
                    ${input.debutLe}, ${input.finLe}, ${input.consignes}, ${input.estArrivee}, ${input.barriereLe})
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
    ): Promise<MissionModifieeRecord | null> {
      return withDb(() =>
        withOrg(sql, input.organisationId, async (tx) => {
          const secteurs = await tx<{ id: string; edition_id: string }[]>`
            SELECT id, edition_id FROM secteur
            WHERE id = ${input.secteurId} AND organisation_id = ${input.organisationId}
            LIMIT 1
          `;
          const secteur = secteurs[0];
          if (!secteur) {
            throw new SecteurNotFoundError();
          }
          await assertArriveeUnique(tx, {
            organisationId: input.organisationId,
            editionId: secteur.edition_id,
            missionId,
            estArrivee: input.estArrivee,
          });
          // État AVANT modification : les conflits ne sont recalculés que si
          // horaires ou secteur bougent (renommer ne réveille aucun avertissement).
          const avant = await tx<{ secteur_id: string; debut_le: Date; fin_le: Date }[]>`
            SELECT secteur_id, debut_le, fin_le FROM mission
            WHERE id = ${missionId} AND organisation_id = ${input.organisationId}
            LIMIT 1
            FOR UPDATE
          `;
          const rows = await tx<MissionRow[]>`
            UPDATE mission SET
              secteur_id = ${input.secteurId},
              type = ${input.type},
              titre = ${input.titre},
              debut_le = ${input.debutLe},
              fin_le = ${input.finLe},
              consignes = ${input.consignes},
              est_arrivee = ${input.estArrivee},
              barriere_le = ${input.barriereLe}
            WHERE id = ${missionId} AND organisation_id = ${input.organisationId}
            RETURNING ${tx.unsafe(MISSION_COLUMNS)}
          `;
          const row = rows[0];
          const precedente = avant[0];
          if (!row || !precedente) {
            return null;
          }
          const mission = toMissionRecord(row);
          const deplacee =
            precedente.secteur_id !== mission.secteurId ||
            precedente.debut_le.getTime() !== mission.debutLe.getTime() ||
            precedente.fin_le.getTime() !== mission.finLe.getTime();
          const conflits: ConflitModificationRecord[] = [];
          if (deplacee) {
            // Chevauchement AVERTI, jamais bloquant (D2) : la modification est
            // déjà faite ; chaque volontaire affecté est confronté à ses autres
            // missions avec la MÊME requête que l'affectation.
            const affectes = await tx<{ id: string; nom: string }[]>`
              SELECT v.id, v.nom
              FROM affectation af
              JOIN volontaire v ON v.id = af.volontaire_id
              WHERE af.mission_id = ${missionId} AND af.organisation_id = ${input.organisationId}
              ORDER BY v.nom ASC, v.id ASC
            `;
            for (const volontaire of affectes) {
              const trouves = await chercherConflits(tx, {
                organisationId: input.organisationId,
                volontaireId: volontaire.id,
                editionId: secteur.edition_id,
                missionId,
                debutLe: mission.debutLe,
                finLe: mission.finLe,
              });
              for (const conflit of trouves) {
                conflits.push({ ...conflit, volontaireId: volontaire.id, volontaireNom: volontaire.nom });
              }
            }
          }
          return { mission, conflits };
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
          // Chevauchement AVERTI, jamais bloqué (requête partagée, cf.
          // chercherConflits) : mission cible exclue.
          const conflits = await chercherConflits(tx, {
            organisationId: input.organisationId,
            volontaireId: input.volontaireId,
            editionId: secteur.edition_id,
            missionId: input.missionId,
            debutLe: mission.debut_le,
            finLe: mission.fin_le,
          });
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

    // Stories 3.4/4.1 — lecture locale cross-table (pattern findCurrentEdition,
    // aucun import du module inscriptions) : la surface volontaires réplique
    // l'annuaire v2 des coureurs VALIDÉS numérotés AVEC jeton e-dossard de
    // l'édition courante, triés par dossard. Org-scopée withOrg/RLS comme
    // toute requête métier.
    async listCoureursAnnuaire(
      organisationId: string,
      editionId: string,
    ): Promise<CoureurAnnuaireRecord[]> {
      return withDb(async () =>
        withOrg(sql, organisationId, async (tx) => {
          const rows = await tx<
            { dossard: number; nom: string; prenom: string; jeton: string }[]
          >`
            SELECT dossard, last_name AS nom, first_name AS prenom,
                   jeton_edossard AS jeton
            FROM coureur
            WHERE edition_id = ${editionId}
              AND organisation_id = ${organisationId}
              AND status = ${COUREUR_STATUS_VALIDE}
              AND dossard IS NOT NULL
              AND jeton_edossard IS NOT NULL
            ORDER BY dossard ASC
          `;
          return rows.map((row) => ({
            dossard: row.dossard,
            nom: row.nom,
            prenom: row.prenom,
            jeton: row.jeton,
          }));
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
    updateVolontaire: unavailable,
    deleteVolontaire: unavailable,
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
    listCoureursAnnuaire: unavailable,
  };
}

export function getMissionsStore(): MissionsStore {
  const globals = globalThis as typeof globalThis & {
    __azzelMissionsStore?: MissionsStore;
  };
  if (globals.__azzelMissionsStore) {
    return globals.__azzelMissionsStore;
  }
  // Pool applicatif partagé — voir `@/db/client`.
  const sql = getDbClient();
  const store = sql !== null ? createMissionsStore(sql) : createUnavailableStore();
  globals.__azzelMissionsStore = store;
  return store;
}
