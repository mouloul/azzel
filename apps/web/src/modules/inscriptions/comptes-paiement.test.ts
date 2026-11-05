import { describe, expect, it } from 'vitest';

import { normaliserComptesPaiement } from './service';

describe('normaliserComptesPaiement', () => {
  it('nettoie les espaces et rend null pour un champ vidé', () => {
    const { comptes, erreurs } = normaliserComptesPaiement({
      ccp: '  1234567 / 89 ',
      baridimob: '   ',
      titulaireCcp: 'ASSO   TEST',
    });
    expect(erreurs).toEqual({});
    expect(comptes).toEqual({
      ccp: '1234567 / 89',
      titulaireCcp: 'ASSO TEST',
      baridimob: null,
      titulaireBaridimob: null,
    });
  });

  it('refuse un texte trop long ou un type inattendu', () => {
    const { erreurs } = normaliserComptesPaiement({ ccp: 'x'.repeat(81), baridimob: 12 });
    expect(Object.keys(erreurs).sort()).toEqual(['baridimob', 'ccp']);
  });
});
