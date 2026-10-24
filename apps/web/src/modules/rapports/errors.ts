import { createErrorEnvelope, type ErrorEnvelope } from '@azzel/shared';

import { DbUnavailableError } from '@/modules/iam/errors';

export { DbUnavailableError };

// Story 7.4 — erreurs du module rapports. La surface est organisateur seul
// (guardAdmin) : le service ne lève que des pannes d'infrastructure. Une base
// indisposable n'est JAMAIS un CSV à moitié servi : 503 douce, enveloppe
// admin.*, pas un octet de rapport ne sort. Registre TUTOIEMENT organisateur,
// aligné sur la page /admin/rapports.

export interface ApiError {
  status: number;
  envelope: ErrorEnvelope;
}

/** Mapper de la surface rapports (GET /api/admin/rapports/*). */
export function toRapportsApiError(error: unknown): ApiError {
  if (error instanceof DbUnavailableError) {
    return {
      status: 503,
      envelope: createErrorEnvelope({
        code: 'admin.db_unavailable',
        message: 'Connexion indisponible.',
        action: 'Réessaie dans un instant — le téléchargement repartira de lui-même.',
      }),
    };
  }
  return {
    status: 500,
    envelope: createErrorEnvelope({
      code: 'admin.rapports.erreur_inconnue',
      message: 'Le rapport n’a pas pu être généré.',
      action: 'Réessaie dans un instant — aucun fichier partiel n’a été livré.',
    }),
  };
}
