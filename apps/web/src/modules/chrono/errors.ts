import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError } from '@/modules/iam/errors';

import type { AbandonFieldErrors, AnnulationFieldErrors } from './domain';

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

// Story 5.3 — erreurs de la saisie d'abandon (surface PC course, vouvoiement,
// enveloppes admin.course.* via toCourseApiError).

/** Champs abandon manquants ou invalides (dossard, lieu, motif, heure) : 400 + fields. */
export class InvalidAbandonFieldsError extends Error {
  constructor(readonly fields: AbandonFieldErrors) {
    super('champs abandon manquants ou invalides');
    this.name = 'InvalidAbandonFieldsError';
  }
}

/** Dossard non résolu dans l'org/édition courante : erreur champ dossard (400). */
export class AbandonDossardInconnuError extends Error {
  constructor() {
    super('dossard inconnu pour cette organisation');
    this.name = 'AbandonDossardInconnuError';
  }
}

/** Coureur jamais retiré : un abandon sans retrait n'a pas de sens course (409). */
export class AbandonPasPartiError extends Error {
  constructor() {
    super('coureur non retiré');
    this.name = 'AbandonPasPartiError';
  }
}

/** Coureur déjà arrivé (passage arbitré au checkpoint arrivée) : 409. */
export class AbandonDejaArriveError extends Error {
  constructor() {
    super('coureur déjà arrivé');
    this.name = 'AbandonDejaArriveError';
  }
}

/** AD-3 : un abandon existe déjà pour ce coureur — le PREMIER reçu gagne (409). */
export class AbandonDejaAbandonneError extends Error {
  constructor() {
    super('coureur déjà abandonné');
    this.name = 'AbandonDejaAbandonneError';
  }
}

/**
 * Borne basse de chronologie : heure d'abandon antérieure à la réception du
 * retrait du coureur (lue dans la même transaction) : 400 champ heure.
 */
export class AbandonAvantDepartError extends Error {
  constructor() {
    super('heure d’abandon antérieure au départ du coureur');
    this.name = 'AbandonAvantDepartError';
  }
}

/** Corps JSON de POST /api/admin/course/abandon illisible : 400. */
export class CorpsAbandonInvalideError extends Error {
  constructor() {
    super('corps de requête abandon illisible');
    this.name = 'CorpsAbandonInvalideError';
  }
}

/** Corps abandon au-delà de la garde taille (défense DoS avant request.json()) : 413. */
export class CorpsAbandonTropGrandError extends Error {
  constructor(readonly maxOctets: number) {
    super(`corps de requête abandon trop volumineux (${maxOctets} octets maximum)`);
    this.name = 'CorpsAbandonTropGrandError';
  }
}

// Story 5.4 — erreurs de l'annulation auditable des passages (surface PC
// course, vouvoiement, enveloppes admin.course.* via toCourseApiError).

/** Champs annulation manquants ou invalides (evenementId, motif) : 400 + fields. */
export class InvalidAnnulationFieldsError extends Error {
  constructor(readonly fields: AnnulationFieldErrors) {
    super('champs annulation manquants ou invalides');
    this.name = 'InvalidAnnulationFieldsError';
  }
}

/**
 * Événement introuvable dans l'org/édition courante (id inconnu, non-UUID,
 * autre organisation via RLS) : 404.
 */
export class AnnulationEvenementIntrouvableError extends Error {
  constructor() {
    super('passage introuvable pour cette organisation');
    this.name = 'AnnulationEvenementIntrouvableError';
  }
}

/** V1 : seuls les PASSAGES sont annulables — un retrait est refusé (409). */
export class AnnulationRetraitRefuseError extends Error {
  constructor() {
    super('seuls les passages peuvent être annulés');
    this.name = 'AnnulationRetraitRefuseError';
  }
}

/** Corps JSON de POST /api/admin/course/annulation illisible : 400. */
export class CorpsAnnulationInvalideError extends Error {
  constructor() {
    super('corps de requête annulation illisible');
    this.name = 'CorpsAnnulationInvalideError';
  }
}

/** Corps annulation au-delà de la garde taille (avant request.json()) : 413. */
export class CorpsAnnulationTropGrandError extends Error {
  constructor(readonly maxOctets: number) {
    super(`corps de requête annulation trop volumineux (${maxOctets} octets maximum)`);
    this.name = 'CorpsAnnulationTropGrandError';
  }
}

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
  /** Erreurs champ (400) — la route les ajoute au corps de réponse. */
  fields?: AbandonFieldErrors & AnnulationFieldErrors;
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

/**
 * Story 5.1 — mapper de la surface PC course (page + GET /api/admin/course/etat) :
 * vouvoiement, namespace admin.course.*. La page n'affiche l'écran d'erreur
 * qu'à l'OUVERTURE : en cours de polling, c'est le CLIENT qui garde le dernier
 * état (jamais blanc, NFR-5).
 *
 * Story 5.3 — porte aussi la saisie d'abandon (POST /api/admin/course/abandon) :
 * erreurs champ (400 + fields), refus de course (409), gardes de corps (400/413).
 *
 * Story 5.4 — porte aussi l'annulation auditable (POST
 * /api/admin/course/annulation) : 404 introuvable (RLS comprise), 409 retrait
 * refusé, erreurs champ (400 + fields), gardes de corps (400/413).
 */
export function toCourseApiError(error: unknown): ApiError {
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessayez dans un instant — le tableau de bord reprendra de lui-même.',
      }),
    };
  }
  if (error instanceof InvalidAbandonFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_champs_invalides',
        message: 'Certains champs de l’abandon sont manquants ou invalides.',
        action: 'Corrigez les champs signalés puis réessayez.',
      }),
    };
  }
  if (error instanceof AbandonDossardInconnuError) {
    return {
      status: 400,
      fields: { dossard: 'Dossard inconnu sur l’édition en cours.' },
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_dossard_inconnu',
        message: 'Aucun coureur validé ne porte ce dossard sur l’édition en cours.',
        action: 'Vérifiez le numéro de dossard puis réessayez.',
      }),
    };
  }
  if (error instanceof AbandonAvantDepartError) {
    return {
      status: 400,
      fields: { heure: 'L’heure d’abandon ne peut pas être avant le départ du coureur.' },
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_avant_depart',
        message: 'L’heure d’abandon saisie est antérieure au départ de ce coureur.',
        action: 'Vérifiez l’heure saisie — un abandon ne peut pas précéder le retrait du dossard.',
      }),
    };
  }
  if (error instanceof AbandonPasPartiError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_pas_parti',
        message: 'Ce coureur n’est pas parti : un abandon sans retrait de dossard n’a pas de sens de course.',
        action: 'Vérifiez le dossard — si le retrait vient d’être scanné, il arrivera avec la prochaine synchronisation.',
      }),
    };
  }
  if (error instanceof AbandonDejaArriveError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_deja_arrive',
        message: 'Ce coureur est déjà arrivé : son parcours est terminé.',
        action: 'Aucune action nécessaire — vérifiez le dossard saisi.',
      }),
    };
  }
  if (error instanceof AbandonDejaAbandonneError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_deja_abandonne',
        message: 'Ce coureur a déjà été déclaré abandonné : le premier enregistrement reçu fait foi.',
        action: 'Aucune action nécessaire — l’abandon déjà enregistré reste le bon.',
      }),
    };
  }
  if (error instanceof CorpsAbandonInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_corps_invalide',
        message: 'La requête est illisible.',
        action: 'Rechargez la page puis réessayez.',
      }),
    };
  }
  if (error instanceof CorpsAbandonTropGrandError) {
    return {
      status: 413,
      envelope: createErrorEnvelope({
        code: 'admin.course.abandon_corps_trop_grand',
        message: `Envoi trop volumineux (${error.maxOctets} octets maximum).`,
        action: 'Raccourcissez le lieu puis réessayez.',
      }),
    };
  }
  if (error instanceof InvalidAnnulationFieldsError) {
    return {
      status: 400,
      fields: error.fields,
      envelope: createErrorEnvelope({
        code: 'admin.course.annulation_champs_invalides',
        message: 'Certains champs de l’annulation sont manquants ou invalides.',
        action: 'Corrigez les champs signalés puis réessayez.',
      }),
    };
  }
  if (error instanceof AnnulationEvenementIntrouvableError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.course.annulation_introuvable',
        message: 'Ce passage n’existe pas ou n’appartient pas à votre organisation.',
        action: 'Rechargez le tableau de bord — la ligne a peut-être déjà disparu.',
      }),
    };
  }
  if (error instanceof AnnulationRetraitRefuseError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.course.annulation_retrait_refuse',
        message: 'Seuls les passages peuvent être annulés.',
        action:
          'La correction d’un retrait de dossard est une opération de guichet — contactez l’équipe si le besoin se confirme.',
      }),
    };
  }
  if (error instanceof CorpsAnnulationInvalideError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.course.annulation_corps_invalide',
        message: 'La requête est illisible.',
        action: 'Rechargez la page puis réessayez.',
      }),
    };
  }
  if (error instanceof CorpsAnnulationTropGrandError) {
    return {
      status: 413,
      envelope: createErrorEnvelope({
        code: 'admin.course.annulation_corps_trop_grand',
        message: `Envoi trop volumineux (${error.maxOctets} octets maximum).`,
        action: 'Raccourcissez le motif puis réessayez.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.course.erreur_inconnue',
      message: 'Le tableau de bord n’a pas pu être calculé.',
      action: 'Réessayez dans un instant.',
    }),
  };
}
