import { describe, expect, it } from 'vitest';

import {
  estResultatAttributionValide,
  libelleAttributionDossards,
} from './attribution-dossards';

// Story 3.4 (revue) — libellés client-safe (déplacés de service.ts) et garde
// de forme de la réponse du lot : jamais « undefined dossard(s) attribué(s)
// (undefined–undefined) » à l'écran.

describe('libelleAttributionDossards — résultat affiché côté admin', () => {
  it('lot nominal : « 12 dossard(s) attribué(s) (101–112). »', () => {
    expect(libelleAttributionDossards({ attribues: 12, premier: 101, dernier: 112 })).toBe(
      '12 dossard(s) attribué(s) (101–112).',
    );
  });

  it('lot d’un coureur : borne unique répétée, pas d’intervalle ambigu', () => {
    expect(libelleAttributionDossards({ attribues: 1, premier: 4, dernier: 4 })).toBe(
      '1 dossard(s) attribué(s) (4–4).',
    );
  });

  it('rien à attribuer (2ᵉ clic idempotent) : message explicite', () => {
    expect(libelleAttributionDossards({ attribues: 0, premier: null, dernier: null })).toBe(
      'Rien à attribuer : aucun dossier validé sans dossard.',
    );
  });
});

describe('estResultatAttributionValide — garde de forme (200 malformé)', () => {
  it('formes valides : lot avec bornes, et vide avec bornes null', () => {
    expect(estResultatAttributionValide({ attribues: 12, premier: 101, dernier: 112 })).toBe(
      true,
    );
    expect(estResultatAttributionValide({ attribues: 0, premier: null, dernier: null })).toBe(
      true,
    );
  });

  it('attribues non entier ou absent : refusé', () => {
    expect(estResultatAttributionValide(null)).toBe(false);
    expect(estResultatAttributionValide('ok')).toBe(false);
    expect(estResultatAttributionValide({})).toBe(false);
    expect(estResultatAttributionValide({ attribues: 1.5, premier: 1, dernier: 2 })).toBe(false);
    expect(
      estResultatAttributionValide({ attribues: '12', premier: 101, dernier: 112 }),
    ).toBe(false);
  });

  it('bornes incohérentes : refusées (null avec attribues > 0, nombres avec 0, undefined)', () => {
    expect(
      estResultatAttributionValide({ attribues: 3, premier: null, dernier: null }),
    ).toBe(false);
    expect(
      estResultatAttributionValide({ attribues: 3, premier: undefined, dernier: undefined }),
    ).toBe(false);
    expect(estResultatAttributionValide({ attribues: 0, premier: 1, dernier: 1 })).toBe(false);
    expect(
      estResultatAttributionValide({ attribues: 2, premier: 1.5, dernier: 2 }),
    ).toBe(false);
  });
});
