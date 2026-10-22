import { describe, expect, it } from 'vitest';

import {
  ANNUAIRE_SCHEMA_VERSION,
  DOSSARD_INCONNU_LABEL,
  DOSSARD_MAX,
  DOSSARD_MIN,
  chercherParDossard,
  estAnnuaireValide,
  type AnnuaireEdition,
  type CoureurAnnuaire,
} from './annuaire';

// Story 3.4 — tests du contrat versionné AD-8 : le consommateur (épopée 4,
// scan zone blanche) ne doit pouvoir compter QUE sur ces garanties — formes,
  // doublons rejetés, lookup total (null, jamais d'exception), libellé partagé.

function coureur(overrides: Partial<CoureurAnnuaire> = {}): CoureurAnnuaire {
  return { dossard: 12, nom: 'Ulahianne', prenom: 'Yani', ...overrides };
}

function annuaire(
  overrides: Partial<AnnuaireEdition> & { coureurs?: CoureurAnnuaire[] } = {},
): AnnuaireEdition {
  return {
    version: ANNUAIRE_SCHEMA_VERSION,
    editionId: 'edition-1',
    genereA: '2026-10-22T08:00:00.000Z',
    coureurs: [coureur({ dossard: 1 }), coureur({ dossard: 12 }), coureur({ dossard: 30 })],
    ...overrides,
  };
}

describe('estAnnuaireValide — garde de schéma défensive', () => {
  it('accepte un annuaire bien formé, y compris vide (0 coureur numéroté)', () => {
    expect(estAnnuaireValide(annuaire())).toBe(true);
    expect(estAnnuaireValide(annuaire({ coureurs: [] }))).toBe(true);
  });

  it('refuse le non-objet et les primitifs', () => {
    expect(estAnnuaireValide(null)).toBe(false);
    expect(estAnnuaireValide(undefined)).toBe(false);
    expect(estAnnuaireValide('annuaire')).toBe(false);
    expect(estAnnuaireValide(42)).toBe(false);
    expect(estAnnuaireValide([])).toBe(false);
  });

  it('refuse toute autre version de schéma (contrat versionné)', () => {
    expect(
      estAnnuaireValide(annuaire({ version: 2 as unknown as AnnuaireEdition['version'] })),
    ).toBe(false);
    expect(
      estAnnuaireValide(annuaire({ version: '1' as unknown as AnnuaireEdition['version'] })),
    ).toBe(false);
  });

  it('refuse editionId manquant/vide et genereA non ISO UTC (suffixe Z exigé)', () => {
    expect(estAnnuaireValide(annuaire({ editionId: '' }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ editionId: 7 as unknown as string }))).toBe(false);
    // RFC3339 strict : date seule, décalage de fuseau, espace au lieu du T.
    expect(estAnnuaireValide(annuaire({ genereA: '2026-10-22' }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ genereA: '2026-10-22T10:00:00+02:00' }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ genereA: '2026-10-22 08:00:00Z' }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ genereA: 42 as unknown as string }))).toBe(false);
    // Formes UTC acceptées : avec ou sans fraction de seconde.
    expect(estAnnuaireValide(annuaire({ genereA: '2026-10-22T08:00:00Z' }))).toBe(true);
    expect(estAnnuaireValide(annuaire({ genereA: '2026-10-22T08:00:00.500Z' }))).toBe(true);
  });

  it('refuse coureurs non tableau ou mal formés', () => {
    expect(estAnnuaireValide(annuaire({ coureurs: 'pas-un-tableau' as unknown as CoureurAnnuaire[] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: null as unknown as number })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: 1.5 })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: DOSSARD_MIN - 1 })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: DOSSARD_MAX + 1 })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ nom: '' })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ prenom: '   ' })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [null as unknown as CoureurAnnuaire] }))).toBe(false);
  });

  it('refuse les doublons de dossard — un annuaire ambigu ne peut pas valider un scan', () => {
    expect(
      estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: 7 }), coureur({ dossard: 7 })] })),
    ).toBe(false);
  });
});

describe('chercherParDossard — lookup total (jamais d’exception)', () => {
  it('trouve le coureur par dossard, bornes incluses', () => {
    expect(chercherParDossard(annuaire(), 12)).toEqual(coureur({ dossard: 12 }));
    expect(chercherParDossard(annuaire(), 1)).toEqual(coureur({ dossard: 1 }));
    expect(chercherParDossard(annuaire(), 30)).toEqual(coureur({ dossard: 30 }));
  });

  it('dossard absent : null (l’épopée 4 affichera DOSSARD INCONNU)', () => {
    expect(chercherParDossard(annuaire(), 999)).toBeNull();
    expect(chercherParDossard(annuaire({ coureurs: [] }), 1)).toBeNull();
  });

  it('payload invalide : null, jamais d’exception', () => {
    expect(chercherParDossard(null, 12)).toBeNull();
    expect(chercherParDossard('annuaire', 12)).toBeNull();
    expect(chercherParDossard({ nimporte: 'quoi' }, 12)).toBeNull();
    expect(
      chercherParDossard(annuaire({ version: 99 as unknown as AnnuaireEdition['version'] }), 12),
    ).toBeNull();
    expect(
      chercherParDossard(
        annuaire({ coureurs: [coureur({ dossard: 7 }), coureur({ dossard: 7 })] }),
        7,
      ),
    ).toBeNull();
  });

  it('dossard hors bornes ou non entier : null', () => {
    expect(chercherParDossard(annuaire(), 0)).toBeNull();
    expect(chercherParDossard(annuaire(), 10000)).toBeNull();
    expect(chercherParDossard(annuaire(), 12.5)).toBeNull();
    expect(chercherParDossard(annuaire(), Number.NaN)).toBeNull();
  });
});

describe('constantes du contrat', () => {
  it('version 1 et bornes 1–9999, symétriques du CHECK SQL', () => {
    expect(ANNUAIRE_SCHEMA_VERSION).toBe(1);
    expect(DOSSARD_MIN).toBe(1);
    expect(DOSSARD_MAX).toBe(9999);
  });

  it('libellé DOSSARD INCONNU exact — partagé par toutes les apps', () => {
    expect(DOSSARD_INCONNU_LABEL).toBe('DOSSARD INCONNU');
  });
});
