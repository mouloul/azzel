import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';

import { formatDateFrUtc, type FieldErrors } from './domain';
import { ACCEPTED_PROOF_FORMATS_LABEL, MAX_PROOF_BYTES, formatKiloBytes } from './proof-format';

export { DbUnavailableError, UnauthenticatedError };

export class InvalidFieldsError extends Error {
  constructor(readonly fields: FieldErrors) {
    super('champs manquants ou invalides');
    this.name = 'InvalidFieldsError';
  }
}

/**
 * Réglages d'édition invalides (administration). Distincte de
 * InvalidFieldsError, qui porte les champs du formulaire d'inscription : ce
 * ne sont pas les mêmes champs, et les confondre ferait remonter « capacite »
 * comme une erreur de saisie coureur.
 */
export class ReglagesInvalidesError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super('réglages invalides');
    this.name = 'ReglagesInvalidesError';
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

export class BothAcceptancesRequiredError extends Error {
  constructor() {
    super('les deux acceptations sont obligatoires');
    this.name = 'BothAcceptancesRequiredError';
  }
}

export class NoCoureurError extends Error {
  constructor() {
    super('aucun coureur pour cette session');
    this.name = 'NoCoureurError';
  }
}

export class DocumentsMissingError extends Error {
  constructor() {
    super('documents decharge/reglement manquants');
    this.name = 'DocumentsMissingError';
  }
}

export class BodyTooLargeError extends Error {
  constructor() {
    super('corps de requête trop volumineux');
    this.name = 'BodyTooLargeError';
  }
}

export class ProofFormatError extends Error {
  constructor() {
    super('format de preuve non accepté');
    this.name = 'ProofFormatError';
  }
}

export class ProofTooLargeError extends Error {
  constructor(readonly sizeBytes: number) {
    super('preuve trop volumineuse après compression');
    this.name = 'ProofTooLargeError';
  }
}

export class NoEditionError extends Error {
  constructor() {
    super('aucune édition configurée');
    this.name = 'NoEditionError';
  }
}

export class DecisionInvalidError extends Error {
  constructor() {
    super('décision inconnue : valider ou refuser');
    this.name = 'DecisionInvalidError';
  }
}

export class RefusalReasonRequiredError extends Error {
  constructor() {
    super('motif de refus obligatoire');
    this.name = 'RefusalReasonRequiredError';
  }
}

export class RefusalReasonTooLongError extends Error {
  constructor(readonly max: number) {
    super('motif de refus trop long');
    this.name = 'RefusalReasonTooLongError';
  }
}

/**
 * Pièces exigées avant la validation d'un dossier (story 1.6 : « coureur en
 * constitution + preuve active » ; story 1.4 : les deux acceptations sont la
 * valeur juridique du dossier). Jamais de dossard sans décharge signée.
 */
export type PieceDossier = 'preuve' | 'decharge' | 'reglement';

const LIBELLES_PIECES: Record<PieceDossier, string> = {
  preuve: 'la preuve de paiement',
  decharge: 'la décharge acceptée',
  reglement: 'le règlement intérieur accepté',
};

export function formatPiecesManquantes(pieces: readonly PieceDossier[]): string {
  const libelles = pieces.map((piece) => LIBELLES_PIECES[piece]);
  if (libelles.length <= 1) {
    return libelles[0] ?? '';
  }
  return `${libelles.slice(0, -1).join(', ')} et ${libelles[libelles.length - 1]}`;
}

export class DossierIncompletError extends Error {
  constructor(readonly pieces: readonly PieceDossier[]) {
    super(`dossier incomplet : ${pieces.join(', ')}`);
    this.name = 'DossierIncompletError';
  }
}

export class DossierNotFoundError extends Error {
  constructor() {
    super('dossier introuvable pour cette organisation');
    this.name = 'DossierNotFoundError';
  }
}

/** Édition ayant épuisé ses numéros (base + lot > 9999) — jamais un CHECK SQL brut. */
export class DossardsEpuisesError extends Error {
  constructor() {
    super('numéros de dossard épuisés pour l’édition');
    this.name = 'DossardsEpuisesError';
  }
}

export class PreuveNotFoundError extends Error {
  constructor() {
    super('preuve introuvable pour cette organisation');
    this.name = 'PreuveNotFoundError';
  }
}

export class PreuveStorageError extends Error {
  constructor(readonly storageKey: string) {
    super('fichier de preuve illisible sur le stockage');
    this.name = 'PreuveStorageError';
  }
}

export class PreuveIdenticalRefusedError extends Error {
  constructor() {
    super('preuve identique à celle déjà refusée');
    this.name = 'PreuveIdenticalRefusedError';
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
  return sharedApiError(error, {
    prefix: 'inscriptions',
    unauthenticatedAction: 'Reconnecte-toi pour t’inscrire.',
    dossierValideMessage: 'Ton dossier a déjà été validé : il ne peut plus être modifié ici.',
    dossierValideAction: 'Contacte l’organisation pour toute modification.',
  });
}

interface SharedErrorMapperConfig {
  prefix: string;
  unauthenticatedAction: string;
  dossierValideMessage: string;
  dossierValideAction: string;
}

function sharedApiError(error: unknown, config: SharedErrorMapperConfig): ApiError {
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
        message: config.dossierValideMessage,
        action: config.dossierValideAction,
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: `${config.prefix}.invalid_body`,
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: `${config.prefix}.body_too_large`,
        message: 'La requête est trop volumineuse.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: `${config.prefix}.unauthenticated`,
        message: 'Ta session a expiré ou a été fermée.',
        action: config.unauthenticatedAction,
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: `${config.prefix}.db_unavailable`,
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: `${config.prefix}.internal_error`,
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}

export function toAcceptancesApiError(error: unknown): ApiError {
  if (error instanceof BothAcceptancesRequiredError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'acceptances.both_required',
        message: 'Les deux acceptations sont obligatoires : décharge et règlement.',
        action: 'Lis puis coche les deux cases avant de valider.',
      }),
    };
  }
  if (error instanceof NoCoureurError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'acceptances.no_coureur',
        message: 'Aucune inscription à ton nom pour cette édition.',
        action: 'Complète d’abord ton inscription, puis accepte les documents.',
      }),
    };
  }
  if (error instanceof DocumentsMissingError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'acceptances.documents_missing',
        message: 'La décharge ou le règlement n’est pas publié : l’acceptation est impossible.',
        action: 'Réessaie dans un instant ou contacte l’organisation.',
      }),
    };
  }
  return sharedApiError(error, {
    prefix: 'acceptances',
    unauthenticatedAction: 'Reconnecte-toi pour accepter les documents.',
    dossierValideMessage: 'Ton dossier a déjà été validé : les acceptations ne peuvent plus changer.',
    dossierValideAction: 'Contacte l’organisation pour toute modification.',
  });
}

export function toPreuveApiError(error: unknown): ApiError {
  if (error instanceof ProofFormatError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'preuve.format',
        message: `Ce format n’est pas accepté. Formats acceptés : ${ACCEPTED_PROOF_FORMATS_LABEL}.`,
        action: 'Prends ton reçu en photo (JPEG, PNG, WebP) ou exporte-le en PDF, puis renvoie-le.',
      }),
    };
  }
  if (error instanceof PreuveIdenticalRefusedError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'preuve.identique_refusee',
        message:
          'Cette preuve identique a déjà été refusée — dépose une version différente ou appelle l’équipe.',
        action: 'Choisis un autre fichier (photo reprise, PDF différent) puis renvoie-le.',
      }),
    };
  }
  if (error instanceof ProofTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'preuve.too_large',
        message: `Ta preuve pèse encore trop lourd après compression (${formatKiloBytes(
          error.sizeBytes,
        )} pour ${formatKiloBytes(MAX_PROOF_BYTES)} autorisés).`,
        action: 'Reprends la photo de plus près, ou exporte un PDF allégé, puis renvoie-le.',
      }),
    };
  }
  if (error instanceof NoCoureurError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'preuve.no_coureur',
        message: 'Aucune inscription à ton nom pour cette édition.',
        action: 'Complète d’abord ton inscription, puis dépose ta preuve de paiement.',
      }),
    };
  }
  if (error instanceof NoEditionError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'preuve.no_edition',
        message: 'Aucune édition n’est configurée : le dépôt de preuve est impossible.',
        action: 'Réessaie dans un instant ou contacte l’organisation.',
      }),
    };
  }
  return sharedApiError(error, {
    prefix: 'preuve',
    unauthenticatedAction: 'Reconnecte-toi pour déposer ta preuve de paiement.',
    dossierValideMessage:
      'Ton dossier a déjà été validé : la preuve de paiement ne peut plus changer ici.',
    dossierValideAction: 'Contacte l’organisation pour toute modification.',
  });
}

export function toAdminApiError(error: unknown): ApiError {
  if (error instanceof ReglagesInvalidesError) {
    return {
      status: 400,
      fields: error.fields as FieldErrors,
      envelope: createErrorEnvelope({
        code: 'admin.reglages_invalides',
        message: 'Certains réglages sont invalides.',
        action: 'Corrige les valeurs signalées puis enregistre à nouveau.',
      }),
    };
  }
  if (error instanceof DecisionInvalidError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.decision_invalid',
        message: 'Décision inconnue.',
        action: 'Choisis « Valider » ou « Refuser » puis réessaie.',
      }),
    };
  }
  if (error instanceof RefusalReasonRequiredError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.refusal_reason_required',
        message: 'Le motif de refus est obligatoire.',
        action: 'Écris le motif communiqué au coureur, puis réessaie.',
      }),
    };
  }
  if (error instanceof RefusalReasonTooLongError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.refusal_reason_too_long',
        message: `Le motif de refus dépasse ${error.max} caractères.`,
        action: 'Raccourcis le motif puis réessaie.',
      }),
    };
  }
  if (error instanceof DossierIncompletError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.dossier_incomplet',
        message: `Ce dossier ne peut pas être validé : il manque ${formatPiecesManquantes(
          error.pieces,
        )}.`,
        action: 'Demande au coureur de compléter les pièces manquantes, puis valide à nouveau.',
      }),
    };
  }
  if (error instanceof DossardsEpuisesError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.dossards_epuises',
        message: 'L’édition a épuisé ses numéros de dossard (maximum 9999).',
        action: 'Vérifie les doublons de la liste ou contacte le support avant le jour J.',
      }),
    };
  }
  if (error instanceof DossierNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.dossier_not_found',
        message: 'Ce dossier n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens à la liste des dossiers.',
      }),
    };
  }
  if (error instanceof PreuveNotFoundError) {
    return {
      status: 404,
      envelope: createErrorEnvelope({
        code: 'admin.preuve_not_found',
        message: 'Cette preuve n’existe pas ou n’appartient pas à ton organisation.',
        action: 'Reviens au dossier du coureur.',
      }),
    };
  }
  if (error instanceof PreuveStorageError) {
    return {
      status: 500,
      envelope: createErrorEnvelope({
        code: 'admin.preuve_storage_error',
        message: 'Le fichier de cette preuve est illisible sur le stockage.',
        action: 'Réessaie dans un instant ; si cela persiste, vérifie le volume STORAGE_DIR.',
      }),
    };
  }
  if (error instanceof DossierValidatedError) {
    return {
      status: 409,
      envelope: createErrorEnvelope({
        code: 'admin.dossier_valide',
        message: 'Ce dossier est déjà validé : seule la re-validation idempotente est permise.',
        action: 'Re-valide le dossier si tu veux simplement confirmer.',
      }),
    };
  }
  if (error instanceof InvalidBodyError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.invalid_body',
        message: 'La requête est illisible.',
        action: 'Recharge la page puis réessaie.',
      }),
    };
  }
  if (error instanceof BodyTooLargeError) {
    return {
      status: 400,
      envelope: createErrorEnvelope({
        code: 'admin.body_too_large',
        message: 'La requête est trop volumineuse.',
        action: 'Raccourcis le motif puis réessaie.',
      }),
    };
  }
  if (error instanceof NoEditionError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.no_edition',
        message: 'Aucune édition n’est configurée : l’attribution des dossards est impossible.',
        action: 'Réessaie dans un instant ou vérifie la configuration de l’édition.',
      }),
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      envelope: createErrorEnvelope({
        code: 'admin.unauthenticated',
        message: 'Ta session a expiré ou a été fermée.',
        action: 'Reconnecte-toi pour continuer.',
      }),
    };
  }
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.internal_error',
      message: 'Une erreur inattendue est survenue.',
      action: 'Réessaie dans un instant.',
    }),
  };
}
