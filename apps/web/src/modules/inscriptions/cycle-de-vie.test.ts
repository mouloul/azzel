import { describe, expect, it } from 'vitest';

import {
  COUREUR_STATUSES,
  COUREUR_STATUS_LABELS,
  PASTILLE_STATUT,
  STATUTS_MODIFIABLES,
  STATUTS_OCCUPANT_UNE_PLACE,
  STATUTS_REPRISE,
  estModifiable,
  peutAccepterDocuments,
  statutApresModification,
} from './domain';

/**
 * Cycle de vie du dossier (décision PO du 11/11/2026) :
 *
 *   en constitution ── preuve déposée ──▶ en validation
 *   en constitution ── échéance passée ──▶ expirée (place rendue)
 *   en validation ──▶ validé | refusé (place rendue)
 *   refusé / expirée ── « Modifier mon inscription » ──▶ en constitution | liste d'attente
 */
describe('cycle de vie du dossier — ensembles de statuts', () => {
  it('« en validation » est un statut connu, libellé et pastillé', () => {
    expect(COUREUR_STATUSES).toContain('en validation');
    expect(COUREUR_STATUS_LABELS['en validation']).toBe('En validation');
    expect(PASTILLE_STATUT['en validation']).toBe('socle-pastille--sync-attente');
  });

  it('occupent une place : en constitution, en validation, validé — jamais refusé, expirée, attente', () => {
    expect([...STATUTS_OCCUPANT_UNE_PLACE].sort()).toEqual(
      ['en constitution', 'en validation', 'validé'].sort(),
    );
  });

  it('reprise : refusé et expirée', () => {
    expect([...STATUTS_REPRISE].sort()).toEqual(['expirée', 'refusé']);
  });

  it('modifiables : tout sauf validé et en validation', () => {
    expect([...STATUTS_MODIFIABLES].sort()).toEqual(
      ['en constitution', 'expirée', 'liste d’attente', 'refusé'].sort(),
    );
    expect(estModifiable('validé')).toBe(false);
    expect(estModifiable('en validation')).toBe(false);
  });
});

describe('statutApresModification — transition « Modifier mon inscription »', () => {
  it('refusé, place disponible : en constitution', () => {
    expect(statutApresModification('refusé', 3)).toBe('en constitution');
  });

  it('expirée, place disponible : en constitution', () => {
    expect(statutApresModification('expirée', 1)).toBe('en constitution');
  });

  it('refusé ou expirée, complet : liste d’attente', () => {
    expect(statutApresModification('refusé', 0)).toBe('liste d’attente');
    expect(statutApresModification('expirée', 0)).toBe('liste d’attente');
  });

  it('en constitution et liste d’attente : inchangés, même si la jauge bouge', () => {
    expect(statutApresModification('en constitution', 0)).toBe('en constitution');
    expect(statutApresModification('liste d’attente', 50)).toBe('liste d’attente');
  });

  it('validé et en validation : figés (null)', () => {
    expect(statutApresModification('validé', 10)).toBeNull();
    expect(statutApresModification('en validation', 10)).toBeNull();
  });
});

describe('peutAccepterDocuments — acceptations avant la preuve (PO, 11/11/2026)', () => {
  it('en constitution : oui', () => {
    expect(peutAccepterDocuments('en constitution')).toBe(true);
  });

  it('en validation, refusé, expirée, liste d’attente, validé : jamais', () => {
    for (const statut of ['en validation', 'refusé', 'expirée', 'liste d’attente', 'validé']) {
      expect(peutAccepterDocuments(statut), statut).toBe(false);
    }
  });
});
