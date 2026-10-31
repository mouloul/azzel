import { describe, expect, it } from 'vitest';

import { DbUnavailableError, UnauthenticatedError } from '@/modules/iam/errors';
import { AucuneEditionError, MissionNotFoundError } from '@/modules/missions/errors';

import { toVolontairesApiError } from './guard';

// Revue 3.3 — mapper de la surface volontaires : enveloppes terrain
// (volontaires.*) ou iam.* pour la session, JAMAIS le repli admin.* du mapper
// missions, y compris pour une erreur inconnue.

describe('toVolontairesApiError', () => {
  it('base indisponible : 503 volontaires.db_unavailable', () => {
    const { status, envelope } = toVolontairesApiError(new DbUnavailableError());
    expect(status).toBe(503);
    expect(envelope.error.code).toBe('volontaires.db_unavailable');
  });

  it('sans édition : 503 volontaires.annuaire_sans_edition', () => {
    expect(toVolontairesApiError(new AucuneEditionError()).envelope.error.code).toBe(
      'volontaires.annuaire_sans_edition',
    );
  });

  it('session morte en cours de service : 401 iam.unauthenticated', () => {
    const { status, envelope } = toVolontairesApiError(new UnauthenticatedError());
    expect(status).toBe(401);
    expect(envelope.error.code).toBe('iam.unauthenticated');
  });

  it('erreur inconnue ou métier admin : 500 volontaires.internal_error, jamais admin.*', () => {
    for (const erreur of [new Error('boom'), new MissionNotFoundError(), 'pas une erreur']) {
      const { status, envelope } = toVolontairesApiError(erreur);
      expect(status).toBe(500);
      expect(envelope.error.code).toBe('volontaires.internal_error');
      expect(envelope.error.code.startsWith('admin.')).toBe(false);
    }
  });
});
