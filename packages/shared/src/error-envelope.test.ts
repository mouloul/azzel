import { describe, expect, it } from 'vitest';

import { createErrorEnvelope, isErrorEnvelope, ERROR_ENVELOPE_VERSION } from './error-envelope';

describe('createErrorEnvelope', () => {
  it('produit une enveloppe v1 : message humain + action à faire', () => {
    const envelope = createErrorEnvelope({
      code: 'PREUVE_TROP_LOURDE',
      message: 'Ta preuve de paiement dépasse la taille maximale.',
      action: 'Réessaie avec une photo plus légère, ou appelle l’équipe.',
    });

    expect(envelope.version).toBe(ERROR_ENVELOPE_VERSION);
    expect(envelope.version).toBe(1);
    expect(envelope.error).toEqual({
      code: 'PREUVE_TROP_LOURDE',
      message: 'Ta preuve de paiement dépasse la taille maximale.',
      action: 'Réessaie avec une photo plus légère, ou appelle l’équipe.',
    });
    expect(isErrorEnvelope(envelope)).toBe(true);
  });
});

describe('isErrorEnvelope', () => {
  it('rejette les valeurs qui ne sont pas des enveloppes v1', () => {
    expect(isErrorEnvelope(null)).toBe(false);
    expect(isErrorEnvelope('erreur')).toBe(false);
    expect(isErrorEnvelope({ version: 2, error: { code: 'X', message: 'Y', action: 'Z' } })).toBe(
      false,
    );
    expect(isErrorEnvelope({ version: 1, error: { code: 'X' } })).toBe(false);
    expect(isErrorEnvelope({})).toBe(false);
  });
});
