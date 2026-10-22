import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

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

/** Renvoi d'invitation à un compte ayant déjà défini son mot de passe. */
export class VolontaireDejaActifError extends Error {
  constructor() {
    super('volontaire déjà activé (mot de passe défini)');
    this.name = 'VolontaireDejaActifError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
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
        message: 'Le fichier dépasse la taille maximale (2 Mo).',
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
        message: 'Ce volontaire a déjà défini son mot de passe : l’invitation est inutile.',
        action: 'Aucune action nécessaire — le compte est déjà activé.',
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
