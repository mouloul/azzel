import { describe, expect, it } from 'vitest';

import {
  corpsHeuresDepartSoumis,
  estEtatServeurValide,
  heuresDepartModifiees,
  lireErreurHeuresDepart,
  valeursHeuresDepartInitiales,
  ERREUR_HEURES_SERVEUR,
  type EpreuveHeureDepartForm,
} from './heures-depart-form';

// Story 7.1 — fonctions pures de la carte « Heures de départ » : conversions
// datetime-local ↔ ISO (piège de fuseau délégué aux helpers shared), champ
// vide = EFFACER (null), corps complet une ligne par épreuve de l'état serveur.

const EPREUVES: EpreuveHeureDepartForm[] = [
  {
    epreuveId: 'ep-longue',
    epreuveNom: 'La Longue — 35 km',
    distanceKm: 35,
    heureDepart: '2027-05-16T08:00:00.000Z',
  },
  {
    epreuveId: 'ep-moyenne',
    epreuveNom: 'La Moyenne — 12 km',
    distanceKm: 12,
    heureDepart: null,
  },
];

describe('valeursHeuresDepartInitiales', () => {
  it('heure serveur ISO → datetime-local locale ; null → champ vide', () => {
    const valeurs = valeursHeuresDepartInitiales(EPREUVES);
    expect(valeurs['ep-longue']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // La valeur locale représente le MÊME instant que l'ISO serveur.
    expect(new Date(valeurs['ep-longue'] as string).toISOString()).toBe('2027-05-16T08:00:00.000Z');
    expect(valeurs['ep-moyenne']).toBe('');
  });
});

describe('corpsHeuresDepartSoumis', () => {
  it('une ligne PAR ÉPREUVE de l’état serveur, datetime-local → ISO UTC', () => {
    const corps = corpsHeuresDepartSoumis(
      { 'ep-longue': '2027-05-16T10:00', 'ep-moyenne': '2027-05-16T10:30' },
      EPREUVES,
    );
    expect(corps.heures.map((ligne) => ligne.epreuveId)).toEqual(['ep-longue', 'ep-moyenne']);
    // datetime-local est interprété en heure LOCALE (celle du poste) : l'ISO
    // produite représente le MÊME instant que la valeur locale saisie.
    expect(corps.heures[0]?.heureDepart).toBe(new Date('2027-05-16T10:00').toISOString());
    expect(corps.heures[1]?.heureDepart).toBe(new Date('2027-05-16T10:30').toISOString());
  });

  it('champ VIDE → null (effacer l’heure de départ)', () => {
    const corps = corpsHeuresDepartSoumis({ 'ep-longue': '', 'ep-moyenne': '' }, EPREUVES);
    expect(corps.heures).toEqual([
      { epreuveId: 'ep-longue', heureDepart: null },
      { epreuveId: 'ep-moyenne', heureDepart: null },
    ]);
  });

  it('valeurs manquantes (épreuve ajoutée côté serveur) → null, jamais undefined', () => {
    const corps = corpsHeuresDepartSoumis({}, EPREUVES);
    expect(corps.heures.every((ligne) => ligne.heureDepart === null)).toBe(true);
  });
});

describe('heuresDepartModifiees', () => {
  it('false à l’identique (valeurs initiales = état serveur)', () => {
    expect(heuresDepartModifiees(valeursHeuresDepartInitiales(EPREUVES), EPREUVES)).toBe(false);
  });

  it('true dès qu’une heure diffère ou qu’un champ est vidé/rempli', () => {
    const initiales = valeursHeuresDepartInitiales(EPREUVES);
    expect(heuresDepartModifiees({ ...initiales, 'ep-moyenne': '2027-05-16T10:30' }, EPREUVES)).toBe(true);
    expect(heuresDepartModifiees({ ...initiales, 'ep-longue': '' }, EPREUVES)).toBe(true);
  });

  it('comparaison par INSTANT (minute) : secondes/millisecondes serveur non nulles TOLÉRÉES', () => {
    // Heure posée par API avec secondes : le champ datetime-local (minute)
    // l'affiche tronquée — ce n'est PAS une modification.
    const epreuves: EpreuveHeureDepartForm[] = [
      { epreuveId: 'ep-1', epreuveNom: 'A', distanceKm: 10, heureDepart: '2027-05-16T08:00:30.500Z' },
    ];
    const valeurs = { 'ep-1': valeursHeuresDepartInitiales(epreuves)['ep-1'] as string };
    expect(valeurs['ep-1']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(heuresDepartModifiees(valeurs, epreuves)).toBe(false);
    // Une minute d'écart, c'est une vraie modification.
    const minuteSuivante = new Date(Date.parse('2027-05-16T08:00:30.500Z') + 60_000);
    expect(
      heuresDepartModifiees(
        {
          'ep-1': `${minuteSuivante.getFullYear()}-${String(minuteSuivante.getMonth() + 1).padStart(2, '0')}-${String(minuteSuivante.getDate()).padStart(2, '0')}T${String(minuteSuivante.getHours()).padStart(2, '0')}:${String(minuteSuivante.getMinutes()).padStart(2, '0')}`,
        },
        epreuves,
      ),
    ).toBe(true);
  });
});

describe('lireErreurHeuresDepart', () => {
  it('enveloppe lue (message + action + fields par épreuve), quel que soit le statut', () => {
    const erreur = lireErreurHeuresDepart(400, {
      error: { code: 'x', message: 'Certains champs…', action: 'Corrigez puis réessayez.' },
      fields: { 'ep-1': 'Indiquez une date et une heure de départ valides.' },
    });
    expect(erreur).toEqual({
      message: 'Certains champs…',
      action: 'Corrigez puis réessayez.',
      fields: { 'ep-1': 'Indiquez une date et une heure de départ valides.' },
    });
  });

  it('corps sans enveloppe (413/500, JSON null, texte) : erreur SERVEUR générique — jamais « injoignable »', () => {
    for (const [statut, corps] of [[413, null], [500, { erreur: 'boom' }], [502, 'gateway']] as const) {
      const erreur = lireErreurHeuresDepart(statut, corps);
      expect(erreur.message).toBe(ERREUR_HEURES_SERVEUR.message);
      expect(erreur.message).not.toContain('injoignable');
      expect(erreur.message).not.toContain('Connexion au serveur impossible');
      expect(erreur.fields).toBeUndefined();
    }
  });

  it('enveloppe incomplète (action absente) : erreur serveur générique, pas de moitié d’enveloppe', () => {
    expect(lireErreurHeuresDepart(400, { error: { message: 'seulement un message' } }).message).toBe(
      ERREUR_HEURES_SERVEUR.message,
    );
  });
});

describe('estEtatServeurValide', () => {
  const ETAT = {
    heures: {
      epreuves: [
        { epreuveId: 'ep-1', epreuveNom: 'A', distanceKm: 35, heureDepart: '2027-05-16T08:00:00.000Z' },
        { epreuveId: 'ep-2', epreuveNom: 'B', distanceKm: 12, heureDepart: null },
      ],
    },
  };

  it('accepte un 200 bien formé (epreuveId, distanceKm, heureDepart ISO ou null)', () => {
    expect(estEtatServeurValide(ETAT)).toBe(true);
  });

  it('refuse : corps null/non-objet, heures absentes, épreuves non-tableau, ligne malformée', () => {
    expect(estEtatServeurValide(null)).toBe(false);
    expect(estEtatServeurValide('ok')).toBe(false);
    expect(estEtatServeurValide({})).toBe(false);
    expect(estEtatServeurValide({ heures: {} })).toBe(false);
    expect(estEtatServeurValide({ heures: { epreuves: 'matin' } })).toBe(false);
    expect(estEtatServeurValide({ heures: { epreuves: [{ epreuveId: '', distanceKm: 35, heureDepart: null }] } })).toBe(false);
    expect(estEtatServeurValide({ heures: { epreuves: [{ epreuveId: 'ep-1', distanceKm: '35', heureDepart: null }] } })).toBe(false);
    expect(estEtatServeurValide({ heures: { epreuves: [{ epreuveId: 'ep-1', distanceKm: Number.NaN, heureDepart: null }] } })).toBe(false);
    expect(estEtatServeurValide({ heures: { epreuves: [{ epreuveId: 'ep-1', distanceKm: 35, heureDepart: 9 }] } })).toBe(false);
    expect(estEtatServeurValide({ heures: { epreuves: [null] } })).toBe(false);
  });
});
