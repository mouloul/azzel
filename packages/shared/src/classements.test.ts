import { describe, expect, it } from 'vitest';

import {
  CATEGORIES_AGE_CLASSEMENT,
  LIBELLE_CLASSEMENT,
  departagerExAequo,
} from './classements';

// Story 7.1 — contrat des classements : le départage ex æquo (1, 1, 3) est la
// seule pure du contrat — il doit tenir SANS ordre d'entrée supposé, sur des
// égalités multiples et des temps négatifs (une arrivée reçue AVANT une heure
// de départ configurée tard reste un temps honnête, jamais clampé).

describe('departagerExAequo', () => {
  it('vide → vide ; un seul coureur → rang 1', () => {
    expect(departagerExAequo([])).toEqual([]);
    expect(departagerExAequo([3_600_000])).toEqual([1]);
  });

  it('temps distincts triés : 1, 2, 3', () => {
    expect(departagerExAequo([1_000, 2_000, 3_000])).toEqual([1, 2, 3]);
  });

  it('ÉGALITÉ : même rang, rang suivant SAUTÉ — 1, 1, 3', () => {
    expect(departagerExAequo([2_000, 2_000, 3_000])).toEqual([1, 1, 3]);
  });

  it('triple égalité : 1, 1, 1 puis 4', () => {
    expect(departagerExAequo([2_000, 2_000, 2_000, 5_000])).toEqual([1, 1, 1, 4]);
  });

  it('INDÉPENDANT de l’ordre d’entrée : non trié, chaque temps porte SON rang', () => {
    expect(departagerExAequo([3_000, 1_000, 2_000])).toEqual([3, 1, 2]);
    expect(departagerExAequo([3_000, 2_000, 2_000, 1_000])).toEqual([4, 2, 2, 1]);
  });

  it('temps négatifs : honnêtes, jamais clampés (le classement dit la vérité)', () => {
    expect(departagerExAequo([-500, -1_000, 0])).toEqual([2, 1, 3]);
  });

  it('temps non fini : erreur explicite (jamais un rang silencieux)', () => {
    expect(() => departagerExAequo([Number.NaN])).toThrow();
    expect(() => departagerExAequo([1_000, Number.POSITIVE_INFINITY])).toThrow();
  });
});

describe('constantes du contrat classements', () => {
  it('LIBELLE_CLASSEMENT : « Classement provisoire », jamais officiel/temps réel', () => {
    expect(LIBELLE_CLASSEMENT).toBe('Classement provisoire');
    expect(LIBELLE_CLASSEMENT).not.toMatch(/officiel|temps réel/i);
  });

  it('CATEGORIES_AGE_CLASSEMENT : calque du CHECK coureur.age_category', () => {
    expect(CATEGORIES_AGE_CLASSEMENT).toEqual(['U20', 'Senior', 'V1', 'V2', 'V3']);
  });
});
