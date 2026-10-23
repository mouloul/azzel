import { describe, expect, it } from 'vitest';

import { classierPermission, type EntreeClasserPermission } from './permission';

// Story 6.3 — tests de la classification pure : chaque rangée de la
// matrice I/O de la spec a son test (opt-in off, « Autoriser une fois »
// expirée, rétablie, refusée net, accès permanent, rétrogradation
// « Toujours » → « Pendant l'utilisation ») + le contrat « jamais
// d'exception » sur entrées dégradées.

function entree(surcharge: Partial<EntreeClasserPermission> = {}): EntreeClasserPermission {
  return {
    optIn: true,
    suiviTournait: true,
    // Défaut = le suivi tournait AVEC l'arrière-plan (état 'actif').
    arrierePlanAvait: true,
    avantPlanAccordee: true,
    arrierePlanAccordee: true,
    ...surcharge,
  };
}

describe('matrice spec — classification au retour au premier plan', () => {
  it('opt-in désactivé : RIEN — aucune lecture, aucun guide, quel que soit le reste', () => {
    expect(classierPermission(entree({ optIn: false, suiviTournait: true, avantPlanAccordee: false }))).toBe('rien');
    expect(classierPermission(entree({ optIn: false, suiviTournait: false, avantPlanAccordee: false }))).toBe('rien');
    expect(classierPermission(entree({ optIn: false, avantPlanAccordee: true }))).toBe('rien');
  });

  it('« Autoriser une fois » expirée : suivi qui tournait + permission perdue → interrompu', () => {
    expect(
      classierPermission(entree({ suiviTournait: true, avantPlanAccordee: false, arrierePlanAccordee: false })),
    ).toBe('interrompu');
  });

  it('permission perdue mais suivi « actif-avant-plan » (tournait aussi) → interrompu', () => {
    expect(
      classierPermission(entree({ arrierePlanAvait: false, avantPlanAccordee: false, arrierePlanAccordee: false })),
    ).toBe('interrompu');
  });

  it('permission rétablie (« Toujours ») + suivi arrêté (interrompu avant) → redemarrer', () => {
    expect(
      classierPermission(entree({ suiviTournait: false, avantPlanAccordee: true, arrierePlanAccordee: true })),
    ).toBe('redemarrer');
  });

  it('permission refusée net (jamais accordée, suivi jamais lancé) → refuse', () => {
    expect(
      classierPermission(entree({ suiviTournait: false, avantPlanAccordee: false, arrierePlanAccordee: false })),
    ).toBe('refuse');
  });

  it('tout va bien : opt-in + suivi qui tournait + permissions accordées → ok', () => {
    expect(classierPermission(entree({ suiviTournait: true }))).toBe('ok');
  });

  it('avant-plan SEUL accordé, suivi qui était déjà avant-plan → ok (situation normale)', () => {
    expect(classierPermission(entree({ arrierePlanAvait: false, arrierePlanAccordee: false }))).toBe('ok');
  });

  it('avant-plan seul accordé + suivi arrêté (refus rétabli partiellement) → redemarrer', () => {
    expect(classierPermission(entree({ suiviTournait: false, arrierePlanAccordee: false }))).toBe('redemarrer');
  });
});

describe('rétrogradation « Toujours » → « Pendant l’utilisation »', () => {
  it('suivi qui tournait AVEC arrière-plan, arrière-plan révoqué → retrograde', () => {
    expect(classierPermission(entree({ arrierePlanAvait: true, arrierePlanAccordee: false }))).toBe('retrograde');
  });

  it('ce n’est NI une interruption (pas de guide), NI un simple ok (état menteur)', () => {
    const verdict = classierPermission(entree({ arrierePlanAvait: true, arrierePlanAccordee: false }));
    expect(verdict).not.toBe('interrompu');
    expect(verdict).not.toBe('ok');
  });

  it('arrière-plan revenu : pas de rétrogradation, ok', () => {
    expect(classierPermission(entree({ arrierePlanAvait: true, arrierePlanAccordee: true }))).toBe('ok');
  });
});

describe('contrat « jamais d’exception »', () => {
  it('entrées dégradées (champs absents) : verdict inoffensif, pas de crash', () => {
    // optIn absent → 'rien' (le plus inoffensif : aucun check, aucun guide).
    expect(classierPermission({} as EntreeClasserPermission)).toBe('rien');
    expect(classierPermission(undefined as unknown as EntreeClasserPermission)).toBe('rien');
    expect(
      classierPermission({ optIn: null, suiviTournait: 1 } as unknown as EntreeClasserPermission),
    ).toBe('rien');
    // optIn vrai mais permissions illisibles → 'refuse' silencieux (pas de guide).
    expect(
      classierPermission({ optIn: true } as unknown as EntreeClasserPermission),
    ).toBe('refuse');
  });
});
