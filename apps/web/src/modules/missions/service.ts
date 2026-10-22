import type { SessionRecord } from '@/modules/iam/store';

import {
  LIBELLES_STATUT_INVITATION,
  validerLigne,
  type RapportImport,
  type RapportLigne,
  type LigneFichier,
  type LigneValide,
  type StatutInvitation,
} from './domain';
import {
  ImportFileInvalidError,
  ImportFileTooLargeError,
  VolontaireNotFoundError,
} from './errors';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_LINES,
  buildModeleXlsx,
  parseImportFile,
} from './import-format';
import { getMissionsStore, type MissionsStore } from './store';

// Story 3.1 — service volontaires : armer 150–200 villageois sans saisie
// manuelle. Le rapport est OBLIGATOIRE ligne par ligne (créé / ignoré / rejeté
// + raison) : jamais d'import silencieux.

export interface VolontaireSummary {
  id: string;
  nom: string;
  email: string;
  telephone: string | null;
  statutInvitation: StatutInvitation;
  statutInvitationLabel: string;
  expireLe: string | null;
  createdAt: string;
}

export interface VolontairesAdminState {
  volontaires: VolontaireSummary[];
}

export interface MissionsServiceDeps {
  store?: MissionsStore;
}

export interface ImportFileInput {
  bytes: Uint8Array;
  filename: string;
}

export async function getVolontairesAdminState(
  session: SessionRecord,
  deps: MissionsServiceDeps = {},
): Promise<VolontairesAdminState> {
  const store = deps.store ?? getMissionsStore();
  const records = await store.listVolontaires(session.organisationId);
  return {
    volontaires: records.map((record) => ({
      id: record.id,
      nom: record.nom,
      email: record.email,
      telephone: record.telephone,
      statutInvitation: record.statutInvitation,
      statutInvitationLabel: LIBELLES_STATUT_INVITATION[record.statutInvitation],
      expireLe: record.expireLe !== null ? record.expireLe.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
    })),
  };
}

/** Rapport d'une ligne rejetée par validation (fichier, format, doublon, quota). */
function rejette(ligne: LigneFichier, raison: string): RapportLigne {
  return { ligne: ligne.ligne, nom: ligne.nom.trim(), email: ligne.email.trim(), statut: 'rejeté', raison };
}

/**
 * Import complet : lecture du fichier → validation ligne par ligne → dédoublonnage
 * → limite 500 lignes → transaction unique (comptes + fiches + invitations +
 * emails en file) pour les lignes valides. Les lignes au-delà de 500 sont
 * rejetées ligne par ligne (« valides importées quand même »).
 */
export async function importVolontaires(
  session: SessionRecord,
  file: ImportFileInput,
  deps: MissionsServiceDeps = {},
): Promise<RapportImport> {
  const store = deps.store ?? getMissionsStore();
  if (file.bytes.length === 0) {
    // Vide ≠ trop lourd : fichier absent/vidé par le navigateur → « vérifie le
    // fichier », pas le message 2 Mo.
    throw new ImportFileInvalidError();
  }
  if (file.bytes.length > MAX_IMPORT_BYTES) {
    throw new ImportFileTooLargeError(MAX_IMPORT_BYTES);
  }
  const lignesFichier = await parseImportFile(file.bytes, file.filename);
  if (lignesFichier.length === 0) {
    // Fichier vide / en-tête seul : aucune donnée → 400 « vérifie le fichier ».
    throw new ImportFileInvalidError();
  }

  const rejets: RapportLigne[] = [];
  const valides: LigneValide[] = [];
  const emailsDejaVus = new Set<string>();

  for (const ligne of lignesFichier) {
    // Limite de volumétrie : au-delà de 500 lignes de données, rejet ligne par
    // ligne — les 500 premières sont bien traitées.
    if (valides.length + rejets.length >= MAX_IMPORT_LINES) {
      rejets.push(rejette(ligne, `fichier limité à ${MAX_IMPORT_LINES} lignes`));
      continue;
    }
    const verdict = validerLigne(ligne);
    if (!verdict.ok) {
      rejets.push(rejette(ligne, verdict.raison));
      continue;
    }
    if (emailsDejaVus.has(verdict.valeur.email)) {
      rejets.push(rejette(ligne, 'doublon dans le fichier'));
      continue;
    }
    emailsDejaVus.add(verdict.valeur.email);
    valides.push(verdict.valeur);
  }

  const rapports: RapportLigne[] = [];
  if (valides.length > 0) {
    // Décisions dépendant de la base (déjà volontaire, autre rôle) : dans LA
    // transaction, avec les créations — tout ou rien.
    const outcomes = await store.importVolontaires({
      organisationId: session.organisationId,
      lignes: valides,
      maintenant: new Date(),
    });
    const parLigne = new Map(outcomes.map((outcome) => [outcome.ligne, outcome]));
    for (const valide of valides) {
      const outcome = parLigne.get(valide.ligne);
      if (!outcome) {
        throw new Error(`issue d’import manquante pour la ligne ${valide.ligne}`);
      }
      rapports.push({
        ligne: outcome.ligne,
        nom: valide.nom,
        email: valide.email,
        statut: outcome.statut,
        raison: outcome.raison,
      });
    }
  }

  const lignes = [...rapports, ...rejets].sort((a, b) => a.ligne - b.ligne);
  return {
    lignes,
    resume: {
      crees: lignes.filter((ligne) => ligne.statut === 'créé').length,
      ignores: lignes.filter((ligne) => ligne.statut === 'ignoré').length,
      rejetes: lignes.filter((ligne) => ligne.statut === 'rejeté').length,
      invitationsEnFile: lignes.filter((ligne) => ligne.statut === 'créé').length,
    },
  };
}

/** Renvoi manuel d'une invitation (jamais automatique au re-import). */
export async function renvoyerInvitation(
  session: SessionRecord,
  volontaireId: string,
  deps: MissionsServiceDeps = {},
): Promise<{ email: string; expireLe: string }> {
  const store = deps.store ?? getMissionsStore();
  const resultat = await store.renvoyerInvitation({
    organisationId: session.organisationId,
    volontaireId,
    maintenant: new Date(),
  });
  return { email: resultat.email, expireLe: resultat.expireLe.toISOString() };
}

/** Gabarit .xlsx téléchargeable (en-tête Nom / Email / Téléphone). */
export async function buildModeleImport(): Promise<Uint8Array> {
  return buildModeleXlsx();
}

export { VolontaireNotFoundError };
