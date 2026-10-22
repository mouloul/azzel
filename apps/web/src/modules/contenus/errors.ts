import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

import type { ContenuFieldErrors } from './domain';

export { DbUnavailableError, UnauthenticatedError };

export class InvalidContenuFieldsError extends Error {
  constructor(readonly fields: ContenuFieldErrors) {
    super('champs contenu manquants ou invalides');
    this.name = 'InvalidContenuFieldsError';
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

export class ContenuNotFoundError extends Error {
  constructor() {
    super('bloc de contenu introuvable pour cette organisation');
    this.name = 'ContenuNotFoundError';
  }
}

/** Verrou optimiste : le bloc a été modifié depuis la lecture du client. */
export class ContenuConflitError extends Error {
  constructor() {
    super('bloc de contenu modifié depuis la lecture');
    this.name = 'ContenuConflitError';
  }
}

/** URL GPX fournie pour un bloc dont l'épreuve n'existe pas dans l'organisation. */
export class EpreuveAbsenteError extends Error {
  constructor() {
    super('épreuve associée absente de cette organisation');
    this.name = 'EpreuveAbsenteError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  fields?: ContenuFieldErrors;
}

export function toContenusApiError(error: unknown): ApiError {
  if (error instanceof InvalidContenuFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.invalid_fields',
        message: 'Certains champs du contenu sont manquants ou invalides.',
        action: 'Corrige les champs signalés puis réessaie.',
      }),
    };
  }
  if (error instanceof ContenuNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.not_found',
        message: 'Ce bloc de contenu n’existe pas.',
        action: 'Reviens à la liste des contenus.',
      }),
    };
  }
  if (error instanceof ContenuConflitError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.conflit',
        message: 'Ce bloc a été modifié depuis ta lecture.',
        action: 'Recharge la page, relis le bloc puis réessaie.',
      }),
    };
  }
  if (error instanceof EpreuveAbsenteError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.epreuve_absente',
        message: 'Aucune épreuve de cette organisation n’est associée à ce bloc : l’adresse GPX ne peut pas être enregistrée.',
        action: 'Retire l’adresse du tracé ou vérifie les épreuves de l’organisation.',
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.body_too_large',
        message: 'La requête est trop volumineuse.',
        action: 'Raccourcis le contenu puis réessaie.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.contenus.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.contenus.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
