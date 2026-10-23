import { describe, expect, it } from 'vitest';

import { MAX_MOTIF_ANNULATION_LENGTH } from '@/modules/chrono/domain';

import {
  ariaLabelAnnulation,
  aDesErreursAnnulation,
  corpsAnnulationSoumis,
  validerFormulaireAnnulation,
  valeursAnnulationInitiales,
  type CibleAnnulation,
} from './annulation-form';

// Story 5.4 — dialogue d'annulation : valeurs initiales (motif vide),
// validation locale (mêmes règles que le serveur : motif 1–500), assemblage
// du corps POST (evenementId de la cible + motif trimé), aria-label complet
// de la ligne de board. Pures, hors effets — aucun fuseau impliqué.

const EVENEMENT_ID = '22222222-3333-4222-8222-222222222222';

const CIBLE: CibleAnnulation = {
  evenementId: EVENEMENT_ID,
  dossard: 101,
  checkpointTitre: 'Scan km 12',
  horodatageReception: '2027-05-16T07:05:09.000Z',
};

describe('valeursAnnulationInitiales — un seul champ, vide', () => {
  it('motif vide à l’ouverture (OBLIGATOIRE : rien de prérempli)', () => {
    expect(valeursAnnulationInitiales()).toEqual({ motif: '' });
  });
});

describe('validerFormulaireAnnulation — motif obligatoire 1–500, mêmes règles que le serveur', () => {
  it('motif nominal : aucune erreur (cible = evenementId du board)', () => {
    const errors = validerFormulaireAnnulation(CIBLE, { motif: 'Mauvais scan du dossard voisin' });
    expect(aDesErreursAnnulation(errors)).toBe(false);
  });

  it('motif VIDE ou espaces : « le motif est obligatoire » (spec 5.4)', () => {
    for (const motif of ['', '   ']) {
      const errors = validerFormulaireAnnulation(CIBLE, { motif });
      expect(errors.motif).toBe('Le motif est obligatoire.');
      expect(aDesErreursAnnulation(errors)).toBe(true);
    }
  });

  it('motif > 500 caractères : erreur bornée (CHECK SQL 0029 symétrique)', () => {
    const errors = validerFormulaireAnnulation(CIBLE, {
      motif: 'x'.repeat(MAX_MOTIF_ANNULATION_LENGTH + 1),
    });
    expect(errors.motif).toBe(`${MAX_MOTIF_ANNULATION_LENGTH} caractères maximum pour le motif.`);
  });

  it('bornes incluses : 1 et exactement 500 caractères passent', () => {
    expect(aDesErreursAnnulation(validerFormulaireAnnulation(CIBLE, { motif: 'x' }))).toBe(false);
    expect(
      aDesErreursAnnulation(
        validerFormulaireAnnulation(CIBLE, { motif: 'x'.repeat(MAX_MOTIF_ANNULATION_LENGTH) }),
      ),
    ).toBe(false);
  });
});

describe('corpsAnnulationSoumis — evenementId de la cible + motif trimé', () => {
  it('assemble le corps POST complet', () => {
    expect(corpsAnnulationSoumis(CIBLE, { motif: '  Doublon d’appareil  ' })).toEqual({
      evenementId: EVENEMENT_ID,
      motif: 'Doublon d’appareil',
    });
  });

  it('la cible ne se tape JAMAIS : evenementId vient du state du board', () => {
    const corps = corpsAnnulationSoumis(CIBLE, { motif: 'Mauvais coureur' });
    expect(corps.evenementId).toBe(CIBLE.evenementId);
    expect(corps.evenementId).not.toContain(String(CIBLE.dossard));
  });
});

describe('ariaLabelAnnulation — le bouton se porte à lui-même sa cible', () => {
  it('libellé complet : « Annuler le passage — dossard N à {checkpoint} »', () => {
    expect(ariaLabelAnnulation(CIBLE)).toBe('Annuler le passage — dossard 101 à Scan km 12');
  });

  it('distinct par dossard ET par checkpoint (un aria-label par ligne de board)', () => {
    expect(ariaLabelAnnulation({ dossard: 102, checkpointTitre: 'Scan km 12' })).not.toBe(
      ariaLabelAnnulation({ dossard: 101, checkpointTitre: 'Scan km 12' }),
    );
    expect(ariaLabelAnnulation({ dossard: 101, checkpointTitre: 'Scan col' })).not.toBe(
      ariaLabelAnnulation({ dossard: 101, checkpointTitre: 'Scan km 12' }),
    );
  });
});
