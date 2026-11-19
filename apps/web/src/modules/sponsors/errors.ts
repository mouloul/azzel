import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

import type { SponsorFieldErrors } from './domain';
import { signalerErreurInattendue } from '@/lib/observabilite';

export { DbUnavailableError, UnauthenticatedError };

export class InvalidSponsorFieldsError extends Error {
  constructor(readonly fields: SponsorFieldErrors) {
    super('champs sponsor manquants ou invalides');
    this.name = 'InvalidSponsorFieldsError';
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

export class SponsorNotFoundError extends Error {
  constructor() {
    super('sponsor introuvable pour cette organisation');
    this.name = 'SponsorNotFoundError';
  }
}

export class SponsorModeInvalidError extends Error {
  constructor() {
    super('mode sponsors inconnu : A ou B');
    this.name = 'SponsorModeInvalidError';
  }
}

export class SponsorsLimitError extends Error {
  constructor(readonly max: number) {
    super(`nombre maximum de sponsors atteint (${max})`);
    this.name = 'SponsorsLimitError';
  }
}

export class SponsorSignatureConflictError extends Error {
  constructor() {
    super('un autre sponsor est déjà signature (index unique)');
    this.name = 'SponsorSignatureConflictError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  fields?: SponsorFieldErrors;
}

export function toSponsorsApiError(error: unknown): ApiError {
  if (error instanceof InvalidSponsorFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.invalid_fields',
        message: 'Certains champs du sponsor sont manquants ou invalides.',
        action: 'Corrige les champs signalés puis réessaie.',
      }),
    };
  }
  if (error instanceof SponsorNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.not_found',
        message: 'Ce sponsor n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des sponsors.',
      }),
    };
  }
  if (error instanceof SponsorModeInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.mode_invalid',
        message: 'Mode inconnu : choisis l’option A ou l’option B.',
        action: 'Choisis l’option A (signature) ou B (plusieurs partenaires) puis réessaie.',
      }),
    };
  }
  if (error instanceof SponsorsLimitError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.limit_reached',
        message: `Nombre maximum de sponsors atteint (${error.max} par organisation).`,
        action: 'Supprime un sponsor avant d’en ajouter un nouveau.',
      }),
    };
  }
  if (error instanceof SponsorSignatureConflictError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.signature_conflict',
        message: 'Un autre sponsor vient de devenir signature.',
        action: 'Recharge la liste puis réessaie.',
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.body_too_large',
        message: 'La requête est trop volumineuse.',
        action: 'Raccourcis les champs puis réessaie.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.sponsors.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  signalerErreurInattendue('sponsors', error);
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.sponsors.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
