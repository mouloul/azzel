import { describe, expect, it } from 'vitest';

import type { ChecklistState } from '@azzel/shared';

import {
  dossierValide,
  ecranApresDossier,
  ecranApresReprise,
  motifRefusDossier,
  type EntreeEcranApresReprise,
} from './app-state';

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

// Story 6.3 — navigation après reprise au premier plan : guide auto une
// fois, fermeture auto SEULEMENT pour un guide auto-affiché dont
// l'interruption se résout, guide bouton jamais refermé automatiquement.

function entreeReprise(surcharge: Partial<EntreeEcranApresReprise> = {}): EntreeEcranApresReprise {
  return {
    afficherGuide: false,
    etatMoteurPrecedent: 'actif',
    repris: false,
    ecranCourant: 'suivi',
    guideAutoAffiche: false,
    ...surcharge,
  };
}

describe('6.3 ecranApresReprise', () => {
  it('guide demandé → guide-permission, quel que soit l’écran courant', () => {
    expect(ecranApresReprise(entreeReprise({ afficherGuide: true }))).toBe('guide-permission');
    expect(
      ecranApresReprise(entreeReprise({ afficherGuide: true, ecranCourant: 'edossard' })),
    ).toBe('guide-permission');
  });

  it('guide AUTO-affiché + interruption résolue → retour au suivi (fermeture auto)', () => {
    expect(
      ecranApresReprise(
        entreeReprise({
          etatMoteurPrecedent: 'interrompu',
          repris: true,
          ecranCourant: 'guide-permission',
          guideAutoAffiche: true,
        }),
      ),
    ).toBe('suivi');
  });

  it('guide ouvert par le BOUTON : JAMAIS refermé automatiquement (même repris)', () => {
    expect(
      ecranApresReprise(
        entreeReprise({
          etatMoteurPrecedent: 'interrompu',
          repris: true,
          ecranCourant: 'guide-permission',
          guideAutoAffiche: false,
        }),
      ),
    ).toBe('guide-permission');
  });

  it('guide auto-affiché mais interruption NON résolue : il reste ouvert', () => {
    expect(
      ecranApresReprise(
        entreeReprise({
          etatMoteurPrecedent: 'interrompu',
          repris: false,
          ecranCourant: 'guide-permission',
          guideAutoAffiche: true,
        }),
      ),
    ).toBe('guide-permission');
  });

  it('rien à naviguer : l’écran courant est conservé', () => {
    expect(ecranApresReprise(entreeReprise())).toBe('suivi');
    expect(ecranApresReprise(entreeReprise({ ecranCourant: 'dossier', repris: true }))).toBe(
      'dossier',
    );
  });
});
