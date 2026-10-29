import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

import { MAX_IMPORT_LIBELLE, type MissionFieldErrors, type SecteurFieldErrors } from './domain';

export { DbUnavailableError, UnauthenticatedError };

// Story 3.1 — erreurs de l'import volontaires. Les lignes invalides ne sont PAS
// des erreurs : elles vivent dans le rapport ligne par ligne (jamais d'import
// silencieux). Ces erreurs-là concernent le FICHIER ou l'accès.

export class ImportFileInvalidError extends Error {
  constructor() {
    super('fichier d’import illisible');
    this.name = 'ImportFileInvalidError';
  }
}

export class ImportFileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`fichier d’import trop volumineux (${maxBytes} octets maximum)`);
    this.name = 'ImportFileTooLargeError';
  }
}

export class InvalidBodyError extends Error {
  constructor() {
    super('corps de requête illisible');
    this.name = 'InvalidBodyError';
  }
}

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super('corps de requête trop volumineux');
    this.name = 'BodyTooLargeError';
  }
}

export class VolontaireNotFoundError extends Error {
  constructor() {
    super('volontaire introuvable pour cette organisation');
    this.name = 'VolontaireNotFoundError';
  }
}

/** Renvoi d'invitation à un volontaire déjà activé (première connexion faite). */
export class VolontaireDejaActifError extends Error {
  constructor() {
    super('volontaire déjà activé (première connexion faite)');
    this.name = 'VolontaireDejaActifError';
  }
}

// Story 3.2 — secteurs, missions typées, affectations.

/** Champs secteur invalides (nom, lieu, contact) — erreurs champ, jamais 500. */
export class InvalidSecteurFieldsError extends Error {
  constructor(readonly fields: SecteurFieldErrors) {
    super('champs secteur manquants ou invalides');
    this.name = 'InvalidSecteurFieldsError';
  }
}

export class SecteurNotFoundError extends Error {
  constructor() {
    super('secteur introuvable pour cette organisation');
    this.name = 'SecteurNotFoundError';
  }
}

/** Secteur portant encore des missions : suppression refusée (409). */
export class SecteurOccupeError extends Error {
  constructor(readonly nombreMissions: number) {
    super(`secteur portant encore ${nombreMissions} mission(s)`);
    this.name = 'SecteurOccupeError';
  }
}

/** UNIQUE (edition_id, nom) violé : le nom est déjà pris sur cette édition. */
export class SecteurNomDupliqueError extends Error {
  constructor() {
    super('un secteur porte déjà ce nom sur cette édition');
    this.name = 'SecteurNomDupliqueError';
  }
}

export class InvalidMissionFieldsError extends Error {
  constructor(readonly fields: MissionFieldErrors) {
    super('champs mission manquants ou invalides');
    this.name = 'InvalidMissionFieldsError';
  }
}

export class MissionNotFoundError extends Error {
  constructor() {
    super('mission introuvable pour cette organisation');
    this.name = 'MissionNotFoundError';
  }
}

/** Story 5.1 — un seul checkpoint d'arrivée par édition (erreur champ estArrivee). */
export class MissionArriveeUniqueError extends Error {
  constructor() {
    super('un seul checkpoint d’arrivée par édition');
    this.name = 'MissionArriveeUniqueError';
  }
}

/** Corps d'affectation illisible (missionId / volontaireId absents). */
export class InvalidAffectationError extends Error {
  constructor() {
    super('corps d’affectation invalide');
    this.name = 'InvalidAffectationError';
  }
}

// Gardes de corps JSON des routes missions (3.2) : namespace admin.missions.* —
// les InvalidBodyError/BodyTooLargeError de 3.1 restent propres à l'import.

export class InvalidMissionsBodyError extends Error {
  constructor() {
    super('corps de requête missions illisible');
    this.name = 'InvalidMissionsBodyError';
  }
}

export class MissionsBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`corps de requête missions trop volumineux (${maxBytes} octets maximum)`);
    this.name = 'MissionsBodyTooLargeError';
  }
}

/** Aucune édition pour l'organisation : impossible de rattacher un secteur. */
export class AucuneEditionError extends Error {
  constructor() {
    super('aucune édition pour cette organisation');
    this.name = 'AucuneEditionError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  fields?: SecteurFieldErrors | MissionFieldErrors;
}

export function toMissionsApiError(error: unknown): ApiError {
  if (error instanceof ImportFileInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.import_invalide',
        message: 'Ce fichier est illisible : format attendu .xlsx ou .csv encodé en UTF-8 (3 colonnes : nom, email, téléphone), au moins une ligne.',
        action: 'Vérifie le fichier, réenregistre-le en « CSV UTF-8 » depuis Excel si besoin, ou repars du gabarit téléchargeable.',
      }),
    };
  }
  if (error instanceof ImportFileTooLargeError || error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.import_trop_lourd',
        message: `Le fichier dépasse la taille maximale (${MAX_IMPORT_LIBELLE}).`,
        action: 'Allège le fichier (retire des lignes ou des colonnes inutiles) puis réessaie.',
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof VolontaireNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.not_found',
        message: 'Ce volontaire n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des volontaires.',
      }),
    };
  }
  if (error instanceof VolontaireDejaActifError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.deja_actif',
        message: 'Ce volontaire s’est déjà connecté : l’invitation est inutile.',
        action: 'Aucune action nécessaire — le compte est déjà activé.',
      }),
    };
  }
  if (error instanceof InvalidSecteurFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.missions.secteur_invalid',
        message: 'Certains champs du secteur sont manquants ou invalides.',
        action: 'Corrige les champs signalés puis réessaie.',
      }),
    };
  }
  if (error instanceof SecteurNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.missions.secteur_not_found',
        message: 'Ce secteur n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des secteurs.',
      }),
    };
  }
  if (error instanceof SecteurOccupeError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.missions.secteur_occupe',
        message: `Ce secteur porte encore ${error.nombreMissions} mission(s) : il faut les supprimer d’abord.`,
        action: 'Retire ses missions d’abord, puis supprime le secteur.',
      }),
    };
  }
  if (error instanceof SecteurNomDupliqueError) {
    return {
      status: 409,
      fields: { nom: 'Un secteur porte déjà ce nom sur cette édition.' },
      envelope: createErrorEnvelope({
        code: 'admin.missions.secteur_duplique',
        message: 'Un secteur porte déjà ce nom sur cette édition.',
        action: 'Choisis un autre nom, ou modifie le secteur existant.',
      }),
    };
  }
  if (error instanceof InvalidMissionFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.missions.mission_invalid',
        message: 'Certains champs de la mission sont manquants ou invalides.',
        action: 'Corrige les champs signalés puis réessaie.',
      }),
    };
  }
  if (error instanceof MissionNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.missions.mission_not_found',
        message: 'Cette mission n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des missions.',
      }),
    };
  }
  if (error instanceof MissionArriveeUniqueError) {
    return {
      status: 409,
      fields: { estArrivee: 'Un seul checkpoint d’arrivée par édition — décoche d’abord l’autre mission.' },
      envelope: createErrorEnvelope({
        code: 'admin.missions.arrivee_unique',
        message: 'Un seul checkpoint d’arrivée par édition.',
        action: 'Décoche d’abord la mission actuellement marquée arrivée, puis réessaie.',
      }),
    };
  }
  if (error instanceof InvalidAffectationError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.missions.affectation_invalid',
        message: 'La demande d’affectation est incomplète.',
        action: 'Choisis une mission et un volontaire puis réessaie.',
      }),
    };
  }
  if (error instanceof InvalidMissionsBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.missions.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof MissionsBodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.missions.body_too_large',
        message: `La requête dépasse la taille maximale (${error.maxBytes / 1024} Ko).`,
        action: 'Raccourcis les champs (consignes comprises) puis réessaie.',
      }),
    };
  }
  if (error instanceof AucuneEditionError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.missions.aucune_edition',
        message: 'Ton organisation n’a aucune édition : aucun secteur ne peut être créé.',
        action: 'Crée d’abord une édition, puis reviens découper les secteurs.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.volontaires.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.volontaires.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
