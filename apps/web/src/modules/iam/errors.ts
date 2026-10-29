import { INVITATION_TTL_DAYS } from './constants';
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

export class ForbiddenError extends Error {
  constructor() {
    super('rôle insuffisant pour cette action');
    this.name = 'ForbiddenError';
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

/**
 * Production : la connexion applicative n'est pas le rôle azzel_app. Le
 * propriétaire a BYPASSRLS — tout le cloisonnement multi-organisation tomberait
 * en silence. On refuse de servir plutôt que d'avertir (story 1.9).
 */
export class AppRoleMisconfiguredError extends Error {
  constructor(readonly currentUser: string) {
    super(
      `connexion applicative en rôle « ${currentUser} » : le RLS serait contourné`,
    );
    this.name = 'AppRoleMisconfiguredError';
  }
}

/**
 * AZZEL_IP_HASH_SALT absent en production. Même principe que
 * AppRoleMisconfiguredError : un prérequis de configuration manquant fait
 * refuser le service, il ne se contente pas d'un avertissement.
 */
export class IpHashSaltMissingError extends Error {
  constructor() {
    super('AZZEL_IP_HASH_SALT absent : le quota par IP serait réversible');
    this.name = 'IpHashSaltMissingError';
  }
}

export class EmailSendError extends Error {
  constructor(cause?: unknown) {
    super("envoi de l'email impossible", { cause });
    this.name = 'EmailSendError';
  }
}

// --- Story 3.1 — parcours volontaire -----------------------------------------

/** Connexion par code demandée par un compte volontaire : refus + orientation. */
export class VolunteerCodeLoginRefusedError extends Error {
  constructor() {
    super('connexion par code refusée pour un compte volontaire');
    this.name = 'VolunteerCodeLoginRefusedError';
  }
}

/** Email ou mot de passe volontaire erroné : message générique (pas d'énumération). */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('email ou mot de passe incorrect');
    this.name = 'InvalidCredentialsError';
  }
}

/** Jeton d'invitation inconnu ou déjà consommé. */
export class InvitationInvalidError extends Error {
  constructor() {
    super('invitation inconnue ou déjà utilisée');
    this.name = 'InvitationInvalidError';
  }
}

/** Jeton d'invitation valide mais expiré (TTL 14 jours). */
export class InvitationExpiredError extends Error {
  constructor() {
    super('invitation expirée');
    this.name = 'InvitationExpiredError';
  }
}

/** Mot de passe hors bornes 8–128 à l'activation. */
export class PasswordInvalidError extends Error {
  constructor() {
    super('mot de passe hors bornes');
    this.name = 'PasswordInvalidError';
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
        action: 'Attendez quelques minutes avant de redemander un code.',
      }),
    };
  }
  if (error instanceof EmailInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.email_invalid',
        message: 'Cette adresse email ne semble pas valide.',
        action: 'Vérifiez votre adresse puis réessayez.',
      }),
    };
  }
  if (error instanceof InvalidCodeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.code_invalid',
        message: 'Code erroné ou expiré.',
        action: 'Vérifiez votre saisie ou demandez un nouveau code.',
      }),
    };
  }
  if (error instanceof CodeExhaustedError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.code_exhausted',
        message: 'Cinq tentatives sans succès : ce code n’est plus valable.',
        action: 'Demandez un nouveau code.',
      }),
    };
  }
  if (error instanceof ForbiddenError) {
    return {
      status: 403,
      envelope: createErrorEnvelope({
        code: 'iam.forbidden',
        message: 'Cette action est réservée aux organisateurs.',
        action: 'Connecte-toi avec un compte organisateur pour continuer.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'iam.unauthenticated',
        message: 'Votre session a expiré ou a été fermée.',
        action: 'Reconnectez-vous pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'iam.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessayez dans un instant.',
      }),
    };
  }
  if (error instanceof AppRoleMisconfiguredError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'iam.db_misconfigured',
        message: 'Service indisponible : configuration de la base incorrecte.',
        action: 'Prévenez l’organisation : la connexion applicative est mal configurée.',
      }),
    };
  }
  if (error instanceof IpHashSaltMissingError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'iam.ip_salt_misconfigured',
        message: 'Service indisponible : configuration du serveur incomplète.',
        action: 'Prévenez l’organisation : AZZEL_IP_HASH_SALT n’est pas défini.',
      }),
    };
  }
  if (error instanceof EmailSendError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'iam.email_send_failed',
        message: 'L’envoi du code a échoué.',
        action: 'Réessayez dans un instant.',
      }),
    };
  }
  if (error instanceof VolunteerCodeLoginRefusedError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.volontaire_code_refused',
        message: 'Ce compte est un compte volontaire : la connexion par code est réservée aux coureurs et organisateurs.',
        action: 'Connecte-toi avec ton mot de passe depuis la page /connexion-volontaire.',
      }),
    };
  }
  if (error instanceof InvalidCredentialsError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.invalid_credentials',
        message: 'Email ou mot de passe incorrect.',
        action: 'Vérifie ta saisie puis réessaie.',
      }),
    };
  }
  if (error instanceof InvitationInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.invitation_invalid',
        message: 'Ce lien d’invitation est inconnu ou a déjà été utilisé.',
        action: 'Demande à l’organisation de te renvoyer une invitation, ou appelle l’équipe.',
      }),
    };
  }
  if (error instanceof InvitationExpiredError) {
    return {
      status: 410,
      envelope: createErrorEnvelope({
        code: 'iam.invitation_expired',
        message: `Ce lien d’invitation a expiré (${INVITATION_TTL_DAYS} jours).`,
        action: 'Demande à l’organisation de te renvoyer une invitation, ou appelle l’équipe.',
      }),
    };
  }
  if (error instanceof PasswordInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'iam.password_invalid',
        message: 'Le mot de passe doit contenir entre 8 et 128 caractères.',
        action: 'Choisis un mot de passe plus long puis réessaie.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'iam.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessayez dans un instant.',
    }),
  };
}
