import { describe, expect, it } from 'vitest';

import {
  CATEGORIES_AGE_CLASSEMENT,
  ETAT_VIDE_SANS_HEURE,
  LIBELLE_CLASSEMENT,
  MAX_DERNIERS_ARRIVES,
  departagerExAequo,
  formaterDureeCourse,
  libelleEtatVide,
  prochaineHeureDepart,
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

// ---------------------------------------------------------------------------
// Story 7.2 — contrat résultats publics : pures de l'état vide et du format
// des temps (la vitrine n'est qu'un rafraîchisseur, AD-7).
// ---------------------------------------------------------------------------

describe('prochaineHeureDepart (story 7.2)', () => {
  it('la PLUS TÔT des heures configurées, indépendante de l’ordre', () => {
    expect(
      prochaineHeureDepart([
        { heureDepart: '2027-03-26T08:30:00.000Z' },
        { heureDepart: '2027-03-26T07:00:00.000Z' },
        { heureDepart: '2027-03-26T09:00:00.000Z' },
      ]),
    ).toBe('2027-03-26T07:00:00.000Z');
  });

  it('ignore les épreuves non configurées (null)', () => {
    expect(
      prochaineHeureDepart([{ heureDepart: null }, { heureDepart: '2027-03-26T09:00:00.000Z' }]),
    ).toBe('2027-03-26T09:00:00.000Z');
  });

  it('avec horloge : la plus tôt des heures À VENIR (>= maintenant), les passées ignorées', () => {
    expect(
      prochaineHeureDepart(
        [
          { heureDepart: '2027-03-26T07:00:00.000Z' },
          { heureDepart: '2027-03-26T08:30:00.000Z' },
          { heureDepart: '2027-03-26T09:00:00.000Z' },
        ],
        new Date('2027-03-26T08:00:00.000Z'),
      ),
    ).toBe('2027-03-26T08:30:00.000Z');
  });

  it('TOUTES passées : repli sur la plus tôt du jour (repère honnête, jamais null)', () => {
    expect(
      prochaineHeureDepart(
        [
          { heureDepart: '2027-03-26T09:00:00.000Z' },
          { heureDepart: '2027-03-26T07:00:00.000Z' },
        ],
        new Date('2027-03-26T12:00:00.000Z'),
      ),
    ).toBe('2027-03-26T07:00:00.000Z');
  });

  it('comparaison par INSTANTS, pas lexicographique : deux ISO à offsets décalés', () => {
    // 07:00Z = 12:00 en UTC+5 — lexicographiquement « 07 » < « 09 », mais
    // l’instant 09:30Z arrive AVANT 12:00Z : c’est lui le prochain départ.
    expect(
      prochaineHeureDepart(
        [
          { heureDepart: '2027-03-26T07:00:00.000+05:00' },
          { heureDepart: '2027-03-26T09:30:00.000Z' },
        ],
        new Date('2027-03-26T08:00:00.000Z'),
      ),
    ).toBe('2027-03-26T09:30:00.000Z');
  });

  it('heure ILLISIBLE ignorée (défense en profondeur) ; toutes illisibles → null', () => {
    expect(
      prochaineHeureDepart([
        { heureDepart: 'pas-un-iso' },
        { heureDepart: '2027-03-26T09:00:00.000Z' },
      ]),
    ).toBe('2027-03-26T09:00:00.000Z');
    expect(prochaineHeureDepart([{ heureDepart: 'pas-un-iso' }])).toBeNull();
  });

  it('AUCUNE heure configurée → null (état vide neutre, jamais 00:00)', () => {
    expect(prochaineHeureDepart([])).toBeNull();
    expect(prochaineHeureDepart([{ heureDepart: null }, { heureDepart: null }])).toBeNull();
  });
});

describe('libelleEtatVide (story 7.2)', () => {
  it('heure configurée : « Pas encore de partants — départ à HH:MM » (heure locale fr)', () => {
    const libelle = libelleEtatVide('2027-03-26T07:00:00.000Z');
    expect(libelle).toMatch(/^Pas encore de partants — départ à \d{2}:\d{2}$/);
  });

  it('aucune heure : texte neutre VERBATIM, JAMAIS un départ à 00:00', () => {
    expect(libelleEtatVide(null)).toBe(ETAT_VIDE_SANS_HEURE);
    expect(ETAT_VIDE_SANS_HEURE).toBe('Les résultats apparaîtront au départ');
    expect(libelleEtatVide(null)).not.toContain('00:00');
  });

  it('ISO illisible : repli neutre (jamais un crash d’affichage)', () => {
    expect(libelleEtatVide('pas-un-iso')).toBe(ETAT_VIDE_SANS_HEURE);
  });
});

describe('formaterDureeCourse (story 7.2)', () => {
  it('heures, minutes, secondes — chiffres alignés, registre sobre', () => {
    expect(formaterDureeCourse((2 * 3600 + 5 * 60 + 38) * 1000)).toBe('2 h 05 min 38 s');
    expect(formaterDureeCourse((40 * 60 + 5) * 1000)).toBe('40 min 05 s');
    expect(formaterDureeCourse(45_000)).toBe('45 s');
    expect(formaterDureeCourse(0)).toBe('0 s');
  });

  it('millisecondes tronquées (jamais de faux centièmes), temps négatif HONNÊTE', () => {
    expect(formaterDureeCourse(59_999)).toBe('59 s');
    expect(formaterDureeCourse(-65_000)).toBe('−1 min 05 s');
  });

  it('temps non fini : erreur explicite (jamais un libellé silencieux)', () => {
    expect(() => formaterDureeCourse(Number.NaN)).toThrow();
    expect(() => formaterDureeCourse(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('contrat ResultatsPublic (story 7.2)', () => {
  it('MAX_DERNIERS_ARRIVES : 10 arrivés servis, pas un de plus', () => {
    expect(MAX_DERNIERS_ARRIVES).toBe(10);
  });
});
