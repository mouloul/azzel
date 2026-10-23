import { describe, expect, it } from 'vitest';

import type { ChecklistState } from '@azzel/shared';

import { dossierValide, ecranApresDossier, motifRefusDossier } from './app-state';

// Story 6.1 — décisions de la machine à états : dossier vert → e-dossard
// direct (étapes court-circuitées), refus → motif, inconnu/hors-ligne →
// écran première connexion.

function checklist(validation: { fait: boolean; motifRefus?: string }): ChecklistState {
  return {
    edition: null,
    pieces: [
      { id: 'email', libelle: 'Email vérifié', fait: true },
      {
        id: 'validation',
        libelle: 'Dossier validé',
        fait: validation.fait,
        ...(validation.motifRefus !== undefined ? { motifRefus: validation.motifRefus } : {}),
      },
    ],
    recap: null,
  };
}

describe('dossierValide', () => {
  it('pièce validation verte : vrai', () => {
    expect(dossierValide(checklist({ fait: true }))).toBe(true);
  });

  it('pièce validation grise : faux (dossier en cours ou refusé)', () => {
    expect(dossierValide(checklist({ fait: false }))).toBe(false);
    expect(dossierValide(checklist({ fait: false, motifRefus: 'reçu illisible' }))).toBe(false);
  });

  it('pièce validation absente : faux, sans crash', () => {
    expect(dossierValide({ edition: null, pieces: [], recap: null })).toBe(false);
  });
});

describe('motifRefusDossier', () => {
  it('refus : le motif est exposé à l’écran dossier', () => {
    expect(motifRefusDossier(checklist({ fait: false, motifRefus: 'reçu illisible' }))).toBe(
      'reçu illisible',
    );
  });

  it('sans refus : null', () => {
    expect(motifRefusDossier(checklist({ fait: true }))).toBeNull();
    expect(motifRefusDossier(checklist({ fait: false }))).toBeNull();
  });
});

describe('ecranApresDossier — court-circuit des étapes', () => {
  it('dossier déjà validé à la première ouverture : e-dossard DIRECT', () => {
    expect(ecranApresDossier(checklist({ fait: true }))).toBe('edossard');
  });

  it('dossier en cours : checklist', () => {
    expect(ecranApresDossier(checklist({ fait: false }))).toBe('dossier');
  });

  it('aucun dossier connu (réseau coupé, jamais ouvert) : écran hors-ligne', () => {
    expect(ecranApresDossier(null)).toBe('hors-ligne');
  });
});
