import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError } from '@/modules/iam/errors';

export { DbUnavailableError };

// Story 6.2 — erreurs du module tracking (suivi GPS coureurs + canal sync).
// Calque du module chrono : la sync est authentifiée par Bearer APPAREIL,
// pas par session — un appareil révoqué reçoit un 401 DÉDIÉ (jamais confondu
// avec un jeton inconnu). Enveloppes tracking.* (tutoiement coureur).

/** Bearer absent/mal formé ou jeton inconnu en base (hash sans ligne). */
export class JetonAppareilInvalideError extends Error {
  constructor() {
    super('jeton d’appareil coureur inconnu');
    this.name = 'JetonAppareilInvalideError';
  }
}

/** Appareil révoqué : sync refusée (AD-5 — assistance humaine). */
export class AppareilRevokedError extends Error {
  constructor() {
    super('appareil coureur révoqué');
    this.name = 'AppareilRevokedError';
  }
}

/** Corps de requête sync illisible (JSON invalide, forme attendue absente). */
export class CorpsSyncInvalideError extends Error {
  constructor() {
    super('corps de requête sync positions illisible');
    this.name = 'CorpsSyncInvalideError';
  }
}

/** Corps sync au-delà d'1 Mo (garde DoS AVANT request.json()) : 413. */
export class CorpsSyncTropGrandError extends Error {
  constructor(readonly maxOctets: number) {
    super(`corps de requête sync positions trop volumineux (${maxOctets} octets maximum)`);
    this.name = 'CorpsSyncTropGrandError';
  }
}

/** Lot au-delà de SYNC_POSITION_MAX_LOT : 413, le client découpe en moitiés. */
export class LotTropGrandError extends Error {
  constructor(readonly maxPositions: number) {
    super(`lot sync positions trop grand (${maxPositions} positions maximum)`);
    this.name = 'LotTropGrandError';
  }
}

/** Identifiant d'appareil client invalide (absent, vide, trop long). */
export class AppareilClientInvalideError extends Error {
  constructor() {
    super('identifiant d’appareil coureur invalide');
    this.name = 'AppareilClientInvalideError';
  }
}

/**
 * Contrat du lot incohérent : l'appareilId transporté ne correspond PAS à
 * l'appareil résolu par le Bearer — la clé d'idempotence recalculée par le
 * serveur serait forgée (l'appareil propose, le serveur dispose : un
 * appareilId étranger ne passe JAMAIS).
 */
export class PositionInvalideError extends Error {
  constructor() {
    super('appareil du lot incohérent avec le jeton');
    this.name = 'PositionInvalideError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
}

/**
 * Mapper de la surface tracking : enveloppes tracking.* (tutoiement coureur)
 * — l'app native n'affiche jamais un code iam.* ni volontaires.* sur ce canal.
 */
export function toTrackingApiError(error: unknown): ApiError {
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'tracking.db_unavailable',
        message: 'Connexion indisponible.',
        action:
          'Réessaie dans un instant — tes positions restent sur ton téléphone, rien n’est perdu.',
      }),
    };
  }
  if (error instanceof JetonAppareilInvalideError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'tracking.jeton_invalide',
        message: 'Ce téléphone n’est pas enregistré pour la synchronisation.',
        action: 'Rouvre l’app en ligne : l’enregistrement se refait tout seul.',
      }),
    };
  }
  if (error instanceof AppareilRevokedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'tracking.appareil_revoked',
        message: 'Ce téléphone a été révoqué par l’organisation.',
        action: 'Appelle l’équipe : la synchronisation ne redémarrera pas sans elle.',
      }),
    };
  }
  if (error instanceof CorpsSyncInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'tracking.corps_invalide',
        message: 'La requête est illisible.',
        action: 'Rien n’est perdu : la synchronisation réessaiera au prochain passage en ligne.',
      }),
    };
  }
  if (error instanceof CorpsSyncTropGrandError) {
    return {
      status: 413,
      envelope: createErrorEnvelope({
        code: 'tracking.corps_trop_grand',
        message: `Envoi trop volumineux (${error.maxOctets} octets maximum).`,
        action: 'La synchronisation découpe automatiquement — ce message n’a rien à casser.',
      }),
    };
  }
  if (error instanceof LotTropGrandError) {
    return {
      status: 413,
      envelope: createErrorEnvelope({
        code: 'tracking.lot_trop_grand',
        message: `Lot trop grand : ${error.maxPositions} positions maximum par envoi.`,
        action: 'La synchronisation découpe automatiquement — ce message n’a rien à casser.',
      }),
    };
  }
  if (error instanceof AppareilClientInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'tracking.appareil_client_invalide',
        message: 'L’identifiant de ton téléphone est manquant ou trop long.',
        action: 'Redémarre l’app puis réessaie.',
      }),
    };
  }
  if (error instanceof PositionInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'tracking.position_invalide',
        message: 'Les positions envoyées ne correspondent pas à ce téléphone.',
        action: 'Redémarre l’app : l’enregistrement se refait proprement.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'tracking.erreur_inconnue',
      message: 'La synchronisation a échoué côté serveur.',
      action: 'Rien n’est perdu : réessaie, ou appelle l’équipe si ça persiste.',
    }),
  };
}
