import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

import type { TemoignageField, TemoignageFieldErrors } from './domain';

export { DbUnavailableError, UnauthenticatedError };

/** Champs d'erreur nommés renvoyés par l'API : témoignage + URL trailer. */
export type RetourImagesFieldErrors = TemoignageFieldErrors & { trailerUrl?: string };

export class InvalidTemoignageFieldsError extends Error {
  constructor(readonly fields: TemoignageFieldErrors) {
    super('champs témoignage manquants ou invalides');
    this.name = 'InvalidTemoignageFieldsError';
  }
}

export class InvalidTrailerUrlError extends Error {
  constructor(readonly field: RetourImagesFieldErrors) {
    super('adresse de vidéo invalide');
    this.name = 'InvalidTrailerUrlError';
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

export class TemoignageNotFoundError extends Error {
  constructor() {
    super('témoignage introuvable pour cette organisation');
    this.name = 'TemoignageNotFoundError';
  }
}

export class TemoignagesLimitError extends Error {
  constructor(readonly max: number) {
    super(`nombre maximum de témoignages atteint (${max})`);
    this.name = 'TemoignagesLimitError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  fields?: RetourImagesFieldErrors;
}

export function toRetourImagesApiError(error: unknown): ApiError {
  if (error instanceof InvalidTemoignageFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.invalid_fields',
        message: 'Certains champs du témoignage sont manquants ou invalides.',
        action: 'Corrige les champs signalés puis réessaie.',
      }),
    };
  }
  if (error instanceof InvalidTrailerUrlError) {
    return {
      status: 400,
      fields: error.field,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.invalid_trailer_url',
        message: 'L’adresse de la vidéo est invalide.',
        action: 'Saisis une adresse https:// ou laisse le champ vide.',
      }),
    };
  }
  if (error instanceof TemoignageNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.not_found',
        message: 'Ce témoignage n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des témoignages.',
      }),
    };
  }
  if (error instanceof TemoignagesLimitError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.limit_reached',
        message: `Nombre maximum de témoignages atteint (${error.max} par organisation).`,
        action: 'Supprime un témoignage avant d’en ajouter un nouveau.',
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.body_too_large',
        message: 'La requête est trop volumineuse.',
        action: 'Raccourcis les champs puis réessaie.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.retour-images.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.retour-images.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
