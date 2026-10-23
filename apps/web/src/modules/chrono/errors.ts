import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError } from '@/modules/iam/errors';

export { DbUnavailableError };

// Story 4.5 — erreurs du module chrono (ingestion terrain + canal sync).
// La surface sync est authentifiée par Bearer APPAREIL, pas par session : un
// appareil révoqué reçoit un 401 DÉDIÉ (jamais confondu avec un jeton inconnu,
// jamais d'auto-réenregistrement silencieux — assistance humaine, AD-5).

/** Bearer absent/mal formé ou jeton inconnu en base (hash sans ligne). */
export class JetonAppareilInvalideError extends Error {
  constructor() {
    super('jeton d’appareil inconnu');
    this.name = 'JetonAppareilInvalideError';
  }
}

/** Appareil révoqué : sync refusée, l’appareil doit appeler le PC (AD-5). */
export class AppareilRevokedError extends Error {
  constructor() {
    super('appareil révoqué');
    this.name = 'AppareilRevokedError';
  }
}

/** Corps de requête sync illisible (JSON invalide, forme attendue absente). */
export class CorpsSyncInvalideError extends Error {
  constructor() {
    super('corps de requête sync illisible');
    this.name = 'CorpsSyncInvalideError';
  }
}

/** Corps sync au-delà d'1 Mo (garde DoS AVANT request.json()) : 413. */
export class CorpsSyncTropGrandError extends Error {
  constructor(readonly maxOctets: number) {
    super(`corps de requête sync trop volumineux (${maxOctets} octets maximum)`);
    this.name = 'CorpsSyncTropGrandError';
  }
}

/** Lot au-delà de SYNC_TERRAIN_MAX_LOT : 413, le client reprend par tranches. */
export class LotTropGrandError extends Error {
  constructor(readonly maxEvenements: number) {
    super(`lot sync trop grand (${maxEvenements} événements maximum)`);
    this.name = 'LotTropGrandError';
  }
}

/** Identifiant d'appareil client invalide (absent, vide, trop long). */
export class AppareilClientInvalideError extends Error {
  constructor() {
    super('identifiant d’appareil invalide');
    this.name = 'AppareilClientInvalideError';
  }
}

export class AppareilNotFoundError extends Error {
  constructor() {
    super('appareil introuvable pour cette organisation');
    this.name = 'AppareilNotFoundError';
  }
}

/** Plafond d'appareils enregistrés atteint pour l'organisation : 409. */
export class PlafondAppareilsError extends Error {
  constructor(readonly plafond: number) {
    super(`plafond d’appareils atteint (${plafond})`);
    this.name = 'PlafondAppareilsError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
}

/**
 * Mapper de la surface chrono : enveloppes volontaires.* (tutoiement, terrain)
 * pour le canal sync — la PWA scanneuse ne doit jamais voir un code admin.*.
 */
export function toChronoApiError(error: unknown): ApiError {
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'volontaires.db_unavailable',
        message: 'Connexion indisponible.',
        action:
          'Réessaie dans un instant — tes scans restent en file sur l’appareil, rien n’est perdu.',
      }),
    };
  }
  if (error instanceof JetonAppareilInvalideError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'volontaires.sync.jeton_invalide',
        message: 'Cet appareil n’est pas enregistré pour la synchronisation.',
        action: 'Rouvre ta fiche volontaire en ligne : l’enregistrement se refait tout seul.',
      }),
    };
  }
  if (error instanceof AppareilRevokedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'volontaires.sync.appareil_revoked',
        message: 'Cet appareil a été révoqué par le PC.',
        action: 'Appelle le PC : la synchronisation ne redémarrera pas sans lui.',
      }),
    };
  }
  if (error instanceof CorpsSyncInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'volontaires.sync.corps_invalide',
        message: 'La requête est illisible.',
        action: 'Rien n’est perdu : la synchronisation réessaiera au prochain passage en ligne.',
      }),
    };
  }
  if (error instanceof CorpsSyncTropGrandError) {
    return {
      status: 413,
      envelope: createErrorEnvelope({
        code: 'volontaires.sync.corps_trop_grand',
        message: `Envoi trop volumineux (${error.maxOctets} octets maximum).`,
        action: 'La synchronisation découpe automatiquement — ce message n’a rien à casser.',
      }),
    };
  }
  if (error instanceof PlafondAppareilsError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.appareils.plafond',
        message: `Le nombre maximum d’appareils de scan est atteint (${error.plafond}).`,
        action: 'Appelle le PC : lui seul peut retirer les anciens appareils.',
      }),
    };
  }
  if (error instanceof LotTropGrandError) {
    return {
      status: 413,
      envelope: createErrorEnvelope({
        code: 'volontaires.sync.lot_trop_grand',
        message: `Lot trop grand : ${error.maxEvenements} événements maximum par envoi.`,
        action: 'La synchronisation découpe automatiquement — ce message n’a rien à casser.',
      }),
    };
  }
  if (error instanceof AppareilNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.appareils.not_found',
        message: 'Cet appareil n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des appareils.',
      }),
    };
  }
  if (error instanceof AppareilClientInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'volontaires.appareil.client_invalide',
        message: 'L’identifiant d’appareil est manquant ou trop long.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'volontaires.sync.erreur_inconnue',
      message: 'La synchronisation a échoué côté serveur.',
      action: 'Rien n’est perdu : réessaie, ou appelle le PC si ça persiste.',
    }),
  };
}

/**
 * Mapper de la surface PC (routes /api/admin/appareils) : vouvoiement,
 * namespace admin.appareils.* — le PC ne reçoit jamais une enveloppe
 * volontaires.sync.* (ton terrain tutoyé).
 */
export function toChronoAdminApiError(error: unknown): ApiError {
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessayez dans un instant.',
      }),
    };
  }
  if (error instanceof AppareilNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.appareils.not_found',
        message: 'Cet appareil n’existe pas ou n’appartient pas à votre organisation.',
        action: 'Revenez à la liste des appareils.',
      }),
    };
  }
  if (error instanceof PlafondAppareilsError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.appareils.plafond',
        message: `Le nombre maximum d’appareils de scan est atteint (${error.plafond}).`,
        action: 'Révoquez les appareils obsolètes avant d’en enregistrer un nouveau.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.appareils.erreur_inconnue',
      message: 'L’opération a échoué côté serveur.',
      action: 'Réessayez, ou contactez l’équipe si ça persiste.',
    }),
  };
}
