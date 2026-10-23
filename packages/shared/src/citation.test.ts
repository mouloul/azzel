import { describe, expect, it } from 'vitest';

import { CITATION_BATTERIE, CITATION_BATTERIE_SOURCE } from './citation';

// Story 6.4 (revue) — la citation vit dans shared (source unique des deux
// apps) : texte exact et source canonique, pour que parcours (web) et la
// rubrique batterie (app coureurs) ne puissent pas diverger.

describe('CITATION_BATTERIE — formulation canonique partagée', () => {
  it('texte exact (FR-20)', () => {
    expect(CITATION_BATTERIE).toBe('Un point après l’autre, et l’ouvrage est parfait');
  });

  it('source toujours notée, formulation canonique du projet', () => {
    expect(CITATION_BATTERIE_SOURCE).toBe('Sagesse kabyle (Hanoteau, 1867)');
  });
});
