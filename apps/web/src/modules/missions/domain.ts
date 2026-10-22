// Story 3.1 — domaine volontaires : validation ligne à ligne du fichier importé.
// Les rejets sont des DÉCISIONS de validation (rapport ligne par ligne), pas des
// erreurs : jamais d'import silencieux (EXPERIENCE.md).
//
// Ce module est importé côté CLIENT (manager admin) : AUCUNE dépendance serveur
// (exceljs, postgres, node:crypto) — la règle email est réimplémentée localement
// à l'identique de iam/service (≤ 254 + forme local@domaine.tld).

export function normaliserEmail(valeur: string): string {
  return valeur.trim().toLowerCase();
}

export function estEmailValide(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const MAX_NOM_LENGTH = 120;

export const MAX_EMAIL_LENGTH = 254;

export const MAX_TELEPHONE_LENGTH = 32;

// Bornes d'import (constantes SANS exceljs : le domaine est importable côté
// client, import-format ne l'est pas — exceljs reste serveur uniquement).
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const MAX_IMPORT_LINES = 500;

export const IMPORT_ACCEPT_ATTRIBUTE = '.xlsx,.csv';

// Téléphone facultatif : vide accepté ; sinon chiffres, + en tête, espaces,
// points ou tirets autorisés (formats algériens et internationaux).
export const TELEPHONE_PATTERN = /^\+?[0-9][0-9 .()-]{4,30}$/;

export type ImportStatut = 'créé' | 'ignoré' | 'rejeté';

export interface LigneFichier {
  /** Numéro de la ligne DANS LE FICHIER source (1-based, en-tête compris). */
  ligne: number;
  nom: string;
  email: string;
  telephone: string;
}

export interface LigneValide {
  ligne: number;
  nom: string;
  email: string;
  telephone: string | null;
}

export interface RapportLigne {
  ligne: number;
  nom: string;
  email: string;
  statut: ImportStatut;
  raison?: string;
}

export interface RapportResume {
  crees: number;
  ignores: number;
  rejetes: number;
  invitationsEnFile: number;
}

export interface RapportImport {
  lignes: RapportLigne[];
  resume: RapportResume;
}

/** Statut d'invitation affiché côté admin — source : l'outbox (join invitation). */
export type StatutInvitation = 'en_file' | 'envoyee' | 'echec' | 'expiree' | 'active' | 'aucune';

export const LIBELLES_STATUT_INVITATION: Record<StatutInvitation, string> = {
  en_file: 'En file',
  envoyee: 'Envoyée',
  echec: 'Échec',
  expiree: 'Expirée',
  active: 'Activé',
  aucune: 'À renvoyer',
};

export function estTelephoneValide(telephone: string): boolean {
  return telephone.length <= MAX_TELEPHONE_LENGTH && TELEPHONE_PATTERN.test(telephone);
}

export function validerLigne(ligne: LigneFichier): { ok: true; valeur: LigneValide } | { ok: false; raison: string } {
  const nom = ligne.nom.trim();
  if (nom.length === 0) {
    return { ok: false, raison: 'nom manquant' };
  }
  if (nom.length > MAX_NOM_LENGTH) {
    return { ok: false, raison: `nom trop long (${MAX_NOM_LENGTH} caractères maximum)` };
  }
  const email = normaliserEmail(ligne.email);
  if (email.length === 0) {
    return { ok: false, raison: 'email manquant' };
  }
  if (email.length > MAX_EMAIL_LENGTH || !estEmailValide(email)) {
    return { ok: false, raison: 'email invalide' };
  }
  const telephoneBrut = ligne.telephone.trim();
  if (telephoneBrut.length > 0 && !estTelephoneValide(telephoneBrut)) {
    return { ok: false, raison: 'téléphone invalide' };
  }
  return {
    ok: true,
    valeur: { ligne: ligne.ligne, nom, email, telephone: telephoneBrut.length > 0 ? telephoneBrut : null },
  };
}

/**
 * Statut d'invitation dérivé : mot de passe posé → activé ; puis expiration,
 * échec d'envoi, envoyée, en file. L'outbox reste l'unique source de vérité du
 * transport ; expire_le celle de la durée de vie du jeton.
 */
export function statutInvitation(input: {
  passwordSetAt: Date | null;
  invitation: { consommeLe: Date | null; expireLe: Date; outboxStatut: string } | null;
  maintenant?: Date;
}): StatutInvitation {
  if (input.passwordSetAt !== null || input.invitation?.consommeLe != null) {
    return 'active';
  }
  if (input.invitation === null) {
    return 'aucune';
  }
  const maintenant = input.maintenant ?? new Date();
  if (input.invitation.expireLe.getTime() <= maintenant.getTime()) {
    return 'expiree';
  }
  if (input.invitation.outboxStatut === 'failed') {
    return 'echec';
  }
  if (input.invitation.outboxStatut === 'sent') {
    return 'envoyee';
  }
  return 'en_file';
}
