import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

import { formatDateFrUtc, type FieldErrors } from './domain';

export { DbUnavailableError, UnauthenticatedError };

export class InvalidFieldsError extends Error {
  constructor(readonly fields: FieldErrors) {
    super('champs manquants ou invalides');
    this.name = 'InvalidFieldsError';
  }
}

export class RegistrationClosedError extends Error {
  constructor(readonly closedAt: Date) {
    super('inscriptions fermées');
    this.name = 'RegistrationClosedError';
  }
}

export class DossierValidatedError extends Error {
  constructor() {
    super('dossier déjà validé');
    this.name = 'DossierValidatedError';
  }
}

export class InvalidBodyError extends Error {
  constructor() {
    super('corps de requête illisible');
    this.name = 'InvalidBodyError';
  }
}

export class BodyTooLargeError extends Error {
  constructor() {
    super('corps de requête trop volumineux');
    this.name = 'BodyTooLargeError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  fields?: FieldErrors;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof InvalidFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'inscriptions.invalid_fields',
        message: 'Certains champs obligatoires sont manquants ou invalides.',
        action: 'Corrige les champs signalés puis valide à nouveau.',
      }),
    };
  }
  if (error instanceof RegistrationClosedError) {
    return {
      status: 403,
      envelope: createErrorEnvelope({
        code: 'inscriptions.closed',
        message: `Les inscriptions sont fermées depuis le ${formatDateFrUtc(error.closedAt.toISOString())}.`,
        action: 'Contacte l’organisation pour savoir si une inscription tardive est possible.',
      }),
    };
  }
  if (error instanceof DossierValidatedError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'inscriptions.dossier_valide',
        message: 'Ton dossier a déjà été validé : il ne peut plus être modifié ici.',
        action: 'Contacte l’organisation pour toute modification.',
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'inscriptions.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'inscriptions.body_too_large',
        message: 'La requête est trop volumineuse.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'inscriptions.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour t’inscrire.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'inscriptions.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'inscriptions.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
