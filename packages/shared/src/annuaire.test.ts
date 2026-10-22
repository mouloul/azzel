import { describe, expect, it } from 'vitest';

import {
  ANNUAIRE_SCHEMA_VERSION,
  DOSSARD_INCONNU_LABEL,
  DOSSARD_MAX,
  DOSSARD_MIN,
  chercherParDossard,
  chercherParJeton,
  estAnnuaireValide,
  indexerAnnuaire,
  type AnnuaireEdition,
  type CoureurAnnuaire,
} from './annuaire';

// Story 3.4/4.1 — tests du contrat versionné AD-8 : le consommateur (épopée 4,
// scan zone blanche) ne doit pouvoir compter QUE sur ces garanties — formes,
// doublons rejetés (dossards ET jetons), lookups totaux (null, jamais
// d'exception), libellé partagé, jeton présent par coureur (v2).

function jeton(suffixe: string): string {
  return (suffixe + 'AAAAAAAAAAAAAAAAAAAAAA').slice(0, 22);
}

function coureur(overrides: Partial<CoureurAnnuaire> = {}): CoureurAnnuaire {
  return { dossard: 12, nom: 'Ulahianne', prenom: 'Yani', jeton: jeton('j12'), ...overrides };
}

function annuaire(
  overrides: Partial<AnnuaireEdition> & { coureurs?: CoureurAnnuaire[] } = {},
): AnnuaireEdition {
  return {
    version: ANNUAIRE_SCHEMA_VERSION,
    editionId: 'edition-1',
    genereA: '2026-10-22T08:00:00.000Z',
    coureurs: [
      coureur({ dossard: 1, jeton: jeton('j01') }),
      coureur({ dossard: 12, jeton: jeton('j12') }),
      coureur({ dossard: 30, jeton: jeton('j30') }),
    ],
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

  it('refuse toute autre version de schéma (contrat versionné — v1 rejetée)', () => {
    expect(
      estAnnuaireValide(annuaire({ version: 1 as unknown as AnnuaireEdition['version'] })),
    ).toBe(false);
    expect(
      estAnnuaireValide(annuaire({ version: 3 as unknown as AnnuaireEdition['version'] })),
    ).toBe(false);
    expect(
      estAnnuaireValide(annuaire({ version: '2' as unknown as AnnuaireEdition['version'] })),
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

  it('refuse coureurs non tableau ou mal formés — jeton requis depuis la v2', () => {
    expect(estAnnuaireValide(annuaire({ coureurs: 'pas-un-tableau' as unknown as CoureurAnnuaire[] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: null as unknown as number })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: 1.5 })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: DOSSARD_MIN - 1 })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: DOSSARD_MAX + 1 })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ nom: '' })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ prenom: '   ' })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [null as unknown as CoureurAnnuaire] }))).toBe(false);
    // Jeton absent, vide, ou hors forme base64url 22 : contrat v2 brisé.
    expect(
      estAnnuaireValide(
        annuaire({ coureurs: [coureur({ jeton: undefined as unknown as string })] }),
      ),
    ).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ jeton: '' })] }))).toBe(false);
    expect(estAnnuaireValide(annuaire({ coureurs: [coureur({ jeton: 'court' })] }))).toBe(false);
  });

  it('refuse les doublons de dossard — un annuaire ambigu ne peut pas valider un scan', () => {
    expect(
      estAnnuaireValide(annuaire({ coureurs: [coureur({ dossard: 7 }), coureur({ dossard: 7 })] })),
    ).toBe(false);
  });

  it('refuse les doublons de jeton (4.1) — défense en profondeur de l’UNIQUE SQL', () => {
    expect(
      estAnnuaireValide(
        annuaire({
          coureurs: [
            coureur({ dossard: 7, jeton: jeton('doublon') }),
            coureur({ dossard: 8, jeton: jeton('doublon') }),
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('chercherParDossard — lookup total (jamais d’exception)', () => {
  it('trouve le coureur par dossard, bornes incluses', () => {
    expect(chercherParDossard(annuaire(), 12)).toEqual(coureur({ dossard: 12 }));
    expect(chercherParDossard(annuaire(), 1)).toEqual(coureur({ dossard: 1, jeton: jeton('j01') }));
    expect(chercherParDossard(annuaire(), 30)).toEqual(coureur({ dossard: 30, jeton: jeton('j30') }));
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

describe('chercherParJeton — le chemin du scanneur (story 4.1)', () => {
  it('retrouve le coureur derrière un jeton e-dossard scanné', () => {
    expect(chercherParJeton(annuaire(), jeton('j12'))).toEqual(coureur({ dossard: 12 }));
    expect(chercherParJeton(annuaire(), jeton('j01'))?.dossard).toBe(1);
  });

  it('jeton absent de la réplique : null (→ DOSSARD INCONNU en 4.2)', () => {
    expect(chercherParJeton(annuaire(), jeton('inconnu'))).toBeNull();
    expect(chercherParJeton(annuaire({ coureurs: [] }), jeton('j12'))).toBeNull();
  });

  it('payload invalide ou jeton mal formé : null, jamais d’exception', () => {
    expect(chercherParJeton(null, jeton('j12'))).toBeNull();
    expect(chercherParJeton('annuaire', jeton('j12'))).toBeNull();
    expect(chercherParJeton({ nimporte: 'quoi' }, jeton('j12'))).toBeNull();
    expect(
      chercherParJeton(
        annuaire({ version: 1 as unknown as AnnuaireEdition['version'] }),
        jeton('j12'),
      ),
    ).toBeNull();
    // Jeton hors forme : 21/23 caractères, dossard nu, payload QR complet.
    expect(chercherParJeton(annuaire(), jeton('j12').slice(0, 21))).toBeNull();
    expect(chercherParJeton(annuaire(), '74')).toBeNull();
    expect(chercherParJeton(annuaire(), `azzel-e1:${jeton('j12')}`)).toBeNull();
  });

  it('annuaire aux jetons dupliqués : null — la réplique ambiguë ne résout rien', () => {
    expect(
      chercherParJeton(
        annuaire({
          coureurs: [
            coureur({ dossard: 7, jeton: jeton('doublon') }),
            coureur({ dossard: 8, jeton: jeton('doublon') }),
          ],
        }),
        jeton('doublon'),
      ),
    ).toBeNull();
  });
});

describe('indexerAnnuaire — index par jeton pour le chemin chaud du scanneur (4.1 revue)', () => {
  it('index construit une fois : lookup O(1) via Map.get retrouve chaque coureur', () => {
    const index = indexerAnnuaire(annuaire());
    expect(index).not.toBeNull();
    expect(index?.get(jeton('j12'))).toEqual(coureur({ dossard: 12 }));
    expect(index?.get(jeton('j01'))?.dossard).toBe(1);
    expect(index?.get(jeton('j30'))?.dossard).toBe(30);
    expect(index?.size).toBe(3);
  });

  it('jeton absent de l’index : undefined (falsy, pas d’exception)', () => {
    const index = indexerAnnuaire(annuaire());
    expect(index?.get(jeton('inconnu'))).toBeUndefined();
    expect(indexerAnnuaire(annuaire({ coureurs: [] }))?.size).toBe(0);
  });

  it('payload invalide : null — non-objet, mauvaise version, formes brisées', () => {
    expect(indexerAnnuaire(null)).toBeNull();
    expect(indexerAnnuaire('annuaire')).toBeNull();
    expect(indexerAnnuaire({ nimporte: 'quoi' })).toBeNull();
    expect(
      indexerAnnuaire(annuaire({ version: 1 as unknown as AnnuaireEdition['version'] })),
    ).toBeNull();
    expect(
      indexerAnnuaire(annuaire({ coureurs: [coureur({ jeton: 'court' })] })),
    ).toBeNull();
  });

  it('jetons dupliqués : null (l’index ne peut pas être ambigu)', () => {
    expect(
      indexerAnnuaire(
        annuaire({
          coureurs: [
            coureur({ dossard: 7, jeton: jeton('doublon') }),
            coureur({ dossard: 8, jeton: jeton('doublon') }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it('cohérence avec chercherParJeton : même coureur par les deux chemins', () => {
    const index = indexerAnnuaire(annuaire());
    expect(index?.get(jeton('j12'))).toEqual(chercherParJeton(annuaire(), jeton('j12')));
  });
});

describe('constantes du contrat', () => {
  it('version 2 (jeton par coureur) et bornes 1–9999, symétriques du CHECK SQL', () => {
    expect(ANNUAIRE_SCHEMA_VERSION).toBe(2);
    expect(DOSSARD_MIN).toBe(1);
    expect(DOSSARD_MAX).toBe(9999);
  });

  it('libellé DOSSARD INCONNU exact — partagé par toutes les apps', () => {
    expect(DOSSARD_INCONNU_LABEL).toBe('DOSSARD INCONNU');
  });
});
