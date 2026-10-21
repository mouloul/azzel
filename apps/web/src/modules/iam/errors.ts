import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

export class EmailInvalidError extends Error {
  constructor() {
    super('email invalide');
    this.name = 'EmailInvalidError';
  }
}

export class RateLimitedError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`trop de demandes, réessayer dans ${retryAfterSec} s`);
    this.name = 'RateLimitedError';
  }
}

export class InvalidCodeError extends Error {
  constructor() {
    super('code erroné ou expiré');
    this.name = 'InvalidCodeError';
  }
}

export class CodeExhaustedError extends Error {
  constructor() {
    super('trop de tentatives, code invalidé');
    this.name = 'CodeExhaustedError';
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('session absente, expirée ou révoquée');
    this.name = 'UnauthenticatedError';
  }
}

export class DbUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('connexion à la base indisponible', { cause });
    this.name = 'DbUnavailableError';
  }
}

export class EmailSendError extends Error {
  constructor(cause?: unknown) {
    super("envoi de l'email impossible", { cause });
    this.name = 'EmailSendError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  retryAfterSec?: number;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof RateLimitedError) {
    return {
      status: 429,
      retryAfterSec: error.retryAfterSec,
      envelope: createErrorEnvelope({
        code: 'iam.rate_limited',
        message: 'Trop de codes demandés pour cette adresse.',
        action: 'Attends quelques minutes avant de redemander un code.',
      }),
    };
  }
  if (error instanceof EmailInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.email_invalid',
        message: 'Cette adresse email ne semble pas valide.',
        action: 'Vérifie ton adresse puis réessaie.',
      }),
    };
  }
  if (error instanceof InvalidCodeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.code_invalid',
        message: 'Code erroné ou expiré.',
        action: 'Vérifie ta saisie ou demande un nouveau code.',
      }),
    };
  }
  if (error instanceof CodeExhaustedError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.code_exhausted',
        message: 'Cinq tentatives sans succès : ce code n’est plus valable.',
        action: 'Demande un nouveau code.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'iam.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'iam.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  if (error instanceof EmailSendError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'iam.email_send_failed',
        message: 'L’envoi du code a échoué.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'iam.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
