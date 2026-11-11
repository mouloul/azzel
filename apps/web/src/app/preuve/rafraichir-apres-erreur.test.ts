import { describe, expect, it } from 'vitest';

import { CODE_DOSSIER_EN_VALIDATION } from '@/modules/inscriptions/errors';

import { doitRafraichirApresErreur, estRefusDossierEnValidation } from './rafraichir-apres-erreur';

describe('doitRafraichirApresErreur', () => {
  it('403 et 409 ordinaires : rafraîchit pour refléter le nouvel état serveur', () => {
    expect(doitRafraichirApresErreur(403, 'iam.forbidden')).toBe(true);
    expect(doitRafraichirApresErreur(409, 'inscriptions.dossier_valide')).toBe(true);
    expect(doitRafraichirApresErreur(409, undefined)).toBe(true);
  });

  it('409 dossier en validation : ne rafraîchit pas (le message resterait invisible)', () => {
    expect(doitRafraichirApresErreur(409, CODE_DOSSIER_EN_VALIDATION)).toBe(false);
  });

  it('autres statuts : aucun rafraîchissement', () => {
    expect(doitRafraichirApresErreur(400, 'preuve.format')).toBe(false);
    expect(doitRafraichirApresErreur(401, 'iam.unauthenticated')).toBe(false);
    expect(doitRafraichirApresErreur(500, undefined)).toBe(false);
  });
});

describe('estRefusDossierEnValidation', () => {
  it('vrai seulement pour le 409 « dossier en validation »', () => {
    expect(estRefusDossierEnValidation(409, CODE_DOSSIER_EN_VALIDATION)).toBe(true);
    expect(estRefusDossierEnValidation(409, 'preuve.numero_deja_utilise')).toBe(false);
    expect(estRefusDossierEnValidation(403, CODE_DOSSIER_EN_VALIDATION)).toBe(false);
  });
});
