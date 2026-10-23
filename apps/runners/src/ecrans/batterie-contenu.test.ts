import { describe, expect, it } from 'vitest';

import {
  CITATION_BATTERIE,
  CITATION_BATTERIE_SOURCE,
  CONSEILS_BATTERIE,
} from './batterie-contenu';

// Story 6.4 — garanties de contenu de la rubrique batterie : exactement trois
// conseils concrets (100 % au départ, ne pas tuer l'app, powerbank au village),
// conclusion par la citation EXACTE avec la source TOUJOURS notée.

describe('CONSEILS_BATTERIE — trois conseils concrets, tutoyés', () => {
  it('exactement trois conseils', () => {
    expect(CONSEILS_BATTERIE).toHaveLength(3);
  });

  it('100 % au départ, ne pas tuer l’app, powerbank au village', () => {
    expect(CONSEILS_BATTERIE[0]).toContain('100 %');
    expect(CONSEILS_BATTERIE[1]).toContain('Ne tue pas');
    expect(CONSEILS_BATTERIE[1]).toContain('application');
    expect(CONSEILS_BATTERIE[2]).toContain('powerbank');
    expect(CONSEILS_BATTERIE[2]).toContain('village');
  });
});

describe('CITATION_BATTERIE — texte exact et source canonique (FR-20, UX-DR-5/17)', () => {
  it('citation exacte concluant la rubrique', () => {
    expect(CITATION_BATTERIE).toBe('Un point après l’autre, et l’ouvrage est parfait');
  });

  it('source toujours notée, formulation canonique du projet', () => {
    expect(CITATION_BATTERIE_SOURCE).toBe('Sagesse kabyle (Hanoteau, 1867)');
  });
});
