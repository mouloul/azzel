import { describe, expect, it } from 'vitest';

import {
  CHECKLIST_PREUVE_INDISPONIBLE,
  CHECKLIST_VALIDATION_EN_ATTENTE,
  type ChecklistPiece,
} from '@/modules/inscriptions/service';

import {
  BANDEAU_DOSSIER_VALIDE,
  compteurPieces,
  estComplet,
  etatPiece,
} from './checklist-view';

function piece(overrides: Partial<ChecklistPiece>): ChecklistPiece {
  return {
    id: 'epreuve',
    libelle: 'Épreuve choisie',
    fait: false,
    ...overrides,
  };
}

describe('etatPiece — libellés exacts', () => {
  it('pièce faite → « Fait » porté par le texte et la couleur', () => {
    expect(etatPiece(piece({ fait: true }))).toEqual({
      texte: 'Fait',
      classe: 'checklist-etat checklist-etat--fait',
    });
  });

  it('pièce refusée → « Refusé » avec la variante danger', () => {
    expect(etatPiece(piece({ motifRefus: 'reçu illisible' }))).toEqual({
      texte: 'Refusé',
      classe: 'checklist-etat checklist-etat--refuse',
    });
  });

  it('coureur en attente → libellé réservé verbatim', () => {
    const etat = etatPiece(
      piece({ id: 'validation', texteSecondaire: CHECKLIST_VALIDATION_EN_ATTENTE }),
    );
    expect(etat.texte).toBe('En attente de validation par l’organisation');
    expect(etat.classe).toBe('checklist-etat');
  });

  it('preuve indisponible → libellé de dégradation verbatim', () => {
    const etat = etatPiece(
      piece({ id: 'preuve', texteSecondaire: CHECKLIST_PREUVE_INDISPONIBLE }),
    );
    expect(etat.texte).toBe('Indisponible (réessaie plus tard)');
    expect(etat.classe).toBe('checklist-etat');
  });

  it('pièce manquante neutre → « À faire »', () => {
    expect(etatPiece(piece({ id: 'validation' }))).toEqual({
      texte: 'À faire',
      classe: 'checklist-etat',
    });
  });
});

describe('compteurPieces', () => {
  function sixPieces(faites: number): ChecklistPiece[] {
    return Array.from({ length: 6 }, (_, index) => piece({ fait: index < faites }));
  }

  it('formes exactes, singulier seulement pour 1', () => {
    expect(compteurPieces(sixPieces(0))).toBe('0 pièces sur 6');
    expect(compteurPieces(sixPieces(1))).toBe('1 pièce sur 6');
    expect(compteurPieces(sixPieces(4))).toBe('4 pièces sur 6');
    expect(compteurPieces(sixPieces(6))).toBe('6 pièces sur 6');
  });
});

describe('estComplet', () => {
  it('vrai uniquement quand toutes les pièces sont faites', () => {
    expect(estComplet([piece({ fait: true }), piece({ fait: true })])).toBe(true);
    expect(estComplet([piece({ fait: true }), piece({ fait: false })])).toBe(false);
    expect(estComplet([])).toBe(false);
  });
});

describe('BANDEAU_DOSSIER_VALIDE', () => {
  it('libellé verbatim de la spine', () => {
    expect(BANDEAU_DOSSIER_VALIDE).toBe('Dossier validé — dossard prêt');
  });
});
