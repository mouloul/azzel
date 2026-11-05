import { describe, expect, it } from 'vitest';

import { hebergementAccorde, montantDuDa } from './domain';

describe('hebergementAccorde — l’option suit le contingent', () => {
  it('souhaité et place disponible : accordé', () => {
    expect(hebergementAccorde(true, 1)).toBe(true);
  });

  it('souhaité mais complet : refusé — l’inscription passe quand même', () => {
    // Refuser toute l'inscription pour une option indisponible serait pire :
    // le coureur perdrait sa place de course pour un lit.
    expect(hebergementAccorde(true, 0)).toBe(false);
  });

  it('non souhaité : jamais accordé, même s’il reste des lits', () => {
    expect(hebergementAccorde(false, 200)).toBe(false);
  });
});

describe('montantDuDa — ce que le coureur doit verser', () => {
  it('sans hébergement : le dossard seul', () => {
    expect(montantDuDa(2000, 1500, false)).toBe(2000);
  });

  it('avec hébergement : dossard et hébergement, un seul versement', () => {
    expect(montantDuDa(2000, 1500, true)).toBe(3500);
  });

  it('prix révisés : le calcul suit, rien n’est écrit en dur', () => {
    expect(montantDuDa(2500, 1800, true)).toBe(4300);
  });
});
