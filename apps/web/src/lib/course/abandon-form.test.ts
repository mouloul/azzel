import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MOTIFS_ABANDON } from '@/modules/chrono/domain';

import {
  aDesErreursAbandon,
  corpsAbandonSoumis,
  optionsMotifAbandon,
  premierChampAbandonEnErreur,
  validerFormulaireAbandon,
  valeursAbandonInitiales,
} from './abandon-form';

// Story 5.3 — formulaire d'abandon : valeurs initiales (dossard prérempli,
// heure défaut = maintenant en datetime-local), validation locale (mêmes
// règles que le serveur : dossard, lieu 1–200, motif fermé, heure passée),
// assemblage du corps POST (heure locale → ISO UTC). Pures, hors effets —
// fuseaux épinglés à UTC comme alertes-course.

const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'UTC';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

const MAINTENANT = new Date('2027-05-16T10:30:00.000Z');

describe('valeursAbandonInitiales — dossard prérempli, heure défaut maintenant', () => {
  it('depuis une alerte : dossard prérempli, heure = maintenant (datetime-local local)', () => {
    const values = valeursAbandonInitiales(102, MAINTENANT);
    expect(values).toEqual({ dossard: '102', lieu: '', motif: '', heure: '2027-05-16T10:30' });
  });

  it('depuis le bouton d’en-tête : dossard vide, heure = maintenant', () => {
    const values = valeursAbandonInitiales(null, MAINTENANT);
    expect(values.dossard).toBe('');
    expect(values.heure).toBe('2027-05-16T10:30');
  });
});

describe('validerFormulaireAbandon — mêmes règles que le serveur', () => {
  it('saisie nominale : aucune erreur', () => {
    const errors = validerFormulaireAbandon(
      { dossard: '102', lieu: 'Col 1200', motif: 'epuisement', heure: '2027-05-16T10:00' },
      MAINTENANT,
    );
    expect(aDesErreursAbandon(errors)).toBe(false);
    expect(premierChampAbandonEnErreur(errors)).toBeNull();
  });

  it('dossard absent ou non entier : erreur champ dossard (vouvoiement PC)', () => {
    for (const dossard of ['', 'abc', '0', '-3', '12.5']) {
      const errors = validerFormulaireAbandon(
        { dossard, lieu: 'Col 1200', motif: 'blessure', heure: '2027-05-16T10:00' },
        MAINTENANT,
      );
      expect(errors.dossard).toBe('Indiquez un numéro de dossard.');
    }
  });

  it('lieu vide ou > 200 caractères : erreur champ lieu', () => {
    const base = { dossard: '102', motif: 'blessure' as const, heure: '2027-05-16T10:00' };
    expect(
      validerFormulaireAbandon({ ...base, lieu: '' }, MAINTENANT).lieu,
    ).toContain('obligatoire');
    expect(
      validerFormulaireAbandon({ ...base, lieu: 'x'.repeat(201) }, MAINTENANT).lieu,
    ).toContain('200 caractères maximum');
  });

  it('motif vide (hors liste fermée) : erreur champ motif', () => {
    const errors = validerFormulaireAbandon(
      { dossard: '102', lieu: 'Col 1200', motif: '', heure: '2027-05-16T10:00' },
      MAINTENANT,
    );
    expect(errors.motif).toContain('motif');
  });

  it('heure absente ou illisible : erreur champ heure', () => {
    for (const heure of ['', 'pas-une-date']) {
      const errors = validerFormulaireAbandon(
        { dossard: '102', lieu: 'Col 1200', motif: 'blessure', heure },
        MAINTENANT,
      );
      expect(errors.heure).toBe('Indiquez la date et l’heure de l’abandon.');
    }
  });

  it('heure dans la tolérance d’horloge (≤ maintenant + 2 min) : VALIDE', () => {
    // +1 min puis exactement +2 min : la dérive d’horloge du poste PC ne
    // bloque pas la saisie du défaut « maintenant ».
    for (const heure of ['2027-05-16T10:31', '2027-05-16T10:32']) {
      const errors = validerFormulaireAbandon(
        { dossard: '102', lieu: 'Col 1200', motif: 'blessure', heure },
        MAINTENANT,
      );
      expect(errors.heure).toBeUndefined();
    }
  });

  it('heure future AU-DELÀ de la tolérance : refusée net (vérifie l’horloge du poste)', () => {
    const errors = validerFormulaireAbandon(
      { dossard: '102', lieu: 'Col 1200', motif: 'blessure', heure: '2027-05-16T10:33' },
      MAINTENANT,
    );
    expect(errors.heure).toBe(
      'L’heure d’abandon ne peut pas être dans le futur (vérifie l’horloge du poste).',
    );
  });

  it('heure exactement maintenant : valide (bornes incluses)', () => {
    const errors = validerFormulaireAbandon(
      { dossard: '102', lieu: 'Col 1200', motif: 'hors_delais', heure: '2027-05-16T10:30' },
      MAINTENANT,
    );
    expect(errors.heure).toBeUndefined();
  });

  it('premier champ en erreur : ordre dossard → lieu → motif → heure (cible du focus)', () => {
    const errors = validerFormulaireAbandon(
      { dossard: '', lieu: '', motif: '', heure: '' },
      MAINTENANT,
    );
    expect(premierChampAbandonEnErreur(errors)).toBe('dossard');
    expect(premierChampAbandonEnErreur({ lieu: 'Le lieu est obligatoire (repère terrain : village, carrefour…).' })).toBe('lieu');
  });
});

describe('corpsAbandonSoumis — heure locale → ISO UTC, corps complet', () => {
  it('assemble dossard nombre, lieu trimé, motif, heure ISO', () => {
    expect(
      corpsAbandonSoumis({ dossard: ' 102 ', lieu: ' Col 1200 ', motif: 'blessure', heure: '2027-05-16T10:05' }),
    ).toEqual({
      dossard: 102,
      lieu: 'Col 1200',
      motif: 'blessure',
      heure: '2027-05-16T10:05:00.000Z',
    });
  });

  it('heure vide : ISO vide — le serveur la refusera en erreur champ (défense)', () => {
    expect(
      corpsAbandonSoumis({ dossard: '102', lieu: 'Col 1200', motif: 'autre', heure: '' }),
    ).toMatchObject({ heure: '' });
  });
});

describe('optionsMotifAbandon — liste fermée métier', () => {
  it('une option par motif, libellés français, aucune valeur libre', () => {
    const options = optionsMotifAbandon();
    expect(options.map((o) => o.valeur)).toEqual([...MOTIFS_ABANDON]);
    expect(options.find((o) => o.valeur === 'hors_delais')?.libelle).toBe('Hors-délais');
    expect(options.find((o) => o.valeur === 'abandon_volontaire')?.libelle).toBe('Abandon volontaire');
  });
});
