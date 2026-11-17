import { describe, expect, it } from 'vitest';

import type { ParcoursDoc } from './construire';
import { reperesEpreuve } from './reperes';

/** Document minimal : seuls les champs lus par `reperesEpreuve` comptent. */
function doc(surcharges: Record<string, unknown> = {}): ParcoursDoc {
  return {
    pointsDePassage: [
      { id: 'depart', nom: 'Départ', lon: 4.1, lat: 36.7, altitudeM: 677, services: null },
      {
        id: 'ravito-1',
        nom: 'Ravitaillement du col',
        lon: 4.2,
        lat: 36.71,
        altitudeM: 800,
        services: ['eau', 'solide'],
      },
    ],
    epreuves: {
      longue: {
        pointsDePassage: [
          { id: 'depart', sM: 0, kilometre: 0, altitudeM: 677, dplusSegmentAmontM: 0 },
          { id: 'ravito-1', sM: 9000, kilometre: 9, altitudeM: 812.4, dplusSegmentAmontM: 410.6 },
        ],
      },
    },
    ...surcharges,
  } as unknown as ParcoursDoc;
}

describe('reperesEpreuve', () => {
  it('rend les points de l’épreuve, dans l’ordre, avec leurs coordonnées', () => {
    const reperes = reperesEpreuve(doc(), 'longue');
    expect(reperes.map((r) => r.id)).toEqual(['depart', 'ravito-1']);
    expect(reperes[1]).toMatchObject({ nom: 'Ravitaillement du col', lon: 4.2, lat: 36.71 });
  });

  it('le libellé porte nom, kilomètre, altitude, D+ du segment et services', () => {
    const [, ravito] = reperesEpreuve(doc(), 'longue');
    expect(ravito?.libelle).toBe(
      'Ravitaillement du col · km 9 · 812 m d’altitude · +411 m de D+ depuis le point précédent · eau, solide',
    );
  });

  it('un point sans D+ amont ni service n’invente rien', () => {
    const [depart] = reperesEpreuve(doc(), 'longue');
    expect(depart?.libelle).toBe('Départ · km 0 · 677 m d’altitude');
    expect(depart?.libelle).not.toContain('D+');
  });

  it('épreuve absente du document : aucun repère, jamais une erreur', () => {
    expect(reperesEpreuve(doc(), 'moyenne')).toEqual([]);
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'le slug « %s » n’est pas une épreuve : un nom hérité de Object ne passe pas pour une clé',
    (slug) => {
      // Le slug d'une route publique vient du visiteur. `epreuves['constructor']`
      // rend une fonction, pas `undefined` : sans garde, `.pointsDePassage`
      // lèverait au lieu de rendre « aucun repère ».
      expect(reperesEpreuve(doc(), slug)).toEqual([]);
    },
  );

  it('aucun document publié : aucun repère', () => {
    expect(reperesEpreuve(null, 'longue')).toEqual([]);
  });

  it('un point de l’épreuve inconnu de la base est ignoré plutôt que de casser la carte', () => {
    const d = doc({
      epreuves: {
        longue: {
          pointsDePassage: [
            { id: 'fantome', sM: 0, kilometre: 0, altitudeM: 0, dplusSegmentAmontM: 0 },
          ],
        },
      },
    });
    expect(reperesEpreuve(d, 'longue')).toEqual([]);
  });
});

describe('reperesEpreuve — pastilles et infobulles lisibles (retour comité 2027)', () => {
  const NBSP = '\u202f';
  /** Document au format réel : ravitaillements numérotés, kilomètres décimaux. */
  function docReel(): ParcoursDoc {
    return {
      pointsDePassage: [
        { id: 'moyenne-depart', nom: 'Départ', lon: 4.1, lat: 36.7, altitudeM: 669.8, services: null },
        {
          id: 'moyenne-ravito-2',
          nom: 'Ravitaillement 2 · Avant la remontée',
          lon: 4.2,
          lat: 36.71,
          altitudeM: 408,
          services: ['Eau', 'Fruits'],
        },
        { id: 'moyenne-arrivee', nom: 'Arrivée', lon: 4.1, lat: 36.7, altitudeM: 674.7, services: null },
        { id: 'belvedere', nom: 'Belvédère', lon: 4.3, lat: 36.72, altitudeM: 900, services: null },
      ],
      epreuves: {
        moyenne: {
          pointsDePassage: [
            { id: 'moyenne-depart', sM: 0, kilometre: 0, altitudeM: 669.8, dplusSegmentAmontM: 0 },
            { id: 'moyenne-ravito-2', sM: 10130, kilometre: 10.13, altitudeM: 408, dplusSegmentAmontM: 218 },
            { id: 'belvedere', sM: 11000, kilometre: 11, altitudeM: 900, dplusSegmentAmontM: 0 },
            { id: 'moyenne-arrivee', sM: 12724.5, kilometre: 12.72, altitudeM: 674.7, dplusSegmentAmontM: 269 },
          ],
        },
      },
    } as unknown as ParcoursDoc;
  }
  const [depart, ravito, belvedere, arrivee] = reperesEpreuve(docReel(), 'moyenne');

  it('type de chaque repère : départ, ravitaillement, arrivée, autre point', () => {
    expect([depart?.type, ravito?.type, belvedere?.type, arrivee?.type]).toEqual([
      'depart',
      'ravitaillement',
      'passage',
      'arrivee',
    ]);
  });

  it('pastille : D, A, et le NUMÉRO du ravitaillement — plus jamais « R » pour tous', () => {
    expect([depart?.pastille, ravito?.pastille, belvedere?.pastille, arrivee?.pastille]).toEqual([
      'D',
      '2',
      'B',
      'A',
    ]);
  });

  it('infobulle : titre puis nom propre, mesures au format français', () => {
    expect(ravito?.titre).toBe('Ravitaillement 2');
    expect(ravito?.sousTitre).toBe('Avant la remontée');
    // « km 10,1 » et non « km 10.13 » : virgule décimale, une décimale.
    expect(ravito?.mesures).toEqual([
      `km${NBSP}10,1`,
      `408${NBSP}m d’altitude`,
      `+218${NBSP}m de D+ depuis le point précédent`,
    ]);
    expect(ravito?.services).toEqual(['Eau', 'Fruits']);
    expect(depart?.titre).toBe('Départ');
    expect(depart?.sousTitre).toBeNull();
  });

  it('nom accessible complet : tout ce que l’infobulle montre', () => {
    expect(ravito?.libelle).toBe(
      `Ravitaillement 2 · Avant la remontée · km${NBSP}10,1 · 408${NBSP}m d’altitude · +218${NBSP}m de D+ depuis le point précédent · Eau, Fruits`,
    );
  });
});

