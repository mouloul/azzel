import type { ChecklistPiece, ChecklistPieceId } from '@azzel/shared';
import { describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import { prochaineEtapeCoureur, prochaineEtapeCoureurPourJeton } from './prochaine-etape';

function piece(id: ChecklistPieceId, fait: boolean, actionHref?: string): ChecklistPiece {
  return {
    id,
    libelle: id,
    fait,
    ...(actionHref !== undefined ? { actionLabel: 'Action', actionHref } : {}),
  };
}

const SESSION: SessionRecord = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

describe('prochaineEtapeCoureur — première pièce non faite de la checklist', () => {
  it('nouveau coureur (aucun dossier) : /inscription', () => {
    expect(
      prochaineEtapeCoureur([
        piece('email', true),
        piece('epreuve', false, '/inscription'),
        piece('decharge', false, '/acceptations'),
        piece('reglement', false),
        piece('preuve', false, '/preuve'),
        piece('validation', false),
      ]),
    ).toBe('/inscription');
  });

  it('inscrit, conditions non cochées : /acceptations', () => {
    expect(
      prochaineEtapeCoureur([
        piece('email', true),
        piece('epreuve', true, '/inscription'),
        piece('decharge', false, '/acceptations'),
        piece('reglement', false),
        piece('preuve', false, '/preuve'),
        piece('validation', false),
      ]),
    ).toBe('/acceptations');
  });

  it('épreuve + conditions faites, sans preuve : /preuve', () => {
    expect(
      prochaineEtapeCoureur([
        piece('email', true),
        piece('epreuve', true, '/inscription'),
        piece('decharge', true),
        piece('reglement', true),
        piece('preuve', false, '/preuve'),
        piece('validation', false),
      ]),
    ).toBe('/preuve');
  });

  it('dossier complet : /espace-coureur', () => {
    expect(
      prochaineEtapeCoureur([
        piece('email', true),
        piece('epreuve', true),
        piece('decharge', true),
        piece('reglement', true),
        piece('preuve', true),
        piece('validation', true),
      ]),
    ).toBe('/espace-coureur');
  });

  it('validation en attente (pièce non faite sans lien) : /espace-coureur', () => {
    expect(
      prochaineEtapeCoureur([
        piece('email', true),
        piece('epreuve', true, '/inscription'),
        piece('decharge', true),
        piece('reglement', true),
        piece('preuve', true, '/preuve'),
        piece('validation', false),
      ]),
    ).toBe('/espace-coureur');
  });

  it('inscriptions fermées, aucun dossier (étape sans lien) : /espace-coureur', () => {
    expect(
      prochaineEtapeCoureur([
        piece('email', true),
        piece('epreuve', false),
        piece('decharge', false, '/acceptations'),
        piece('reglement', false),
        piece('preuve', false),
        piece('validation', false),
      ]),
    ).toBe('/espace-coureur');
  });

  it('aucune édition (checklist vide) : /espace-coureur', () => {
    expect(prochaineEtapeCoureur([])).toBe('/espace-coureur');
  });

  it('lien non relatif ignoré (jamais d’URL absolue ni protocole-relative)', () => {
    expect(prochaineEtapeCoureur([piece('epreuve', false, 'https://exemple.dz')])).toBe(
      '/espace-coureur',
    );
    expect(prochaineEtapeCoureur([piece('epreuve', false, '//exemple.dz')])).toBe(
      '/espace-coureur',
    );
  });
});

describe('prochaineEtapeCoureurPourJeton — ne lève jamais', () => {
  it('lit la session du jeton puis la checklist', async () => {
    const getSession = vi.fn().mockResolvedValue(SESSION);
    const getChecklistState = vi
      .fn()
      .mockResolvedValue({ pieces: [piece('email', true), piece('epreuve', false, '/inscription')] });

    await expect(
      prochaineEtapeCoureurPourJeton('jeton', { getSession, getChecklistState }),
    ).resolves.toBe('/inscription');
    expect(getSession).toHaveBeenCalledWith('jeton');
    expect(getChecklistState).toHaveBeenCalledWith(SESSION);
  });

  it('état du dossier en erreur : /espace-coureur', async () => {
    await expect(
      prochaineEtapeCoureurPourJeton('jeton', {
        getSession: vi.fn().mockResolvedValue(SESSION),
        getChecklistState: vi.fn().mockRejectedValue(new Error('base indisponible')),
      }),
    ).resolves.toBe('/espace-coureur');
  });

  it('session introuvable ou illisible : /espace-coureur', async () => {
    const getChecklistState = vi.fn();
    await expect(
      prochaineEtapeCoureurPourJeton('jeton', {
        getSession: vi.fn().mockResolvedValue(null),
        getChecklistState,
      }),
    ).resolves.toBe('/espace-coureur');
    await expect(
      prochaineEtapeCoureurPourJeton('jeton', {
        getSession: vi.fn().mockRejectedValue(new Error('panne')),
        getChecklistState,
      }),
    ).resolves.toBe('/espace-coureur');
    expect(getChecklistState).not.toHaveBeenCalled();
  });
});
