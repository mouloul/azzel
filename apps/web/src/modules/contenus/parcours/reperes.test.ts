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
      'Ravitaillement du col · km 9 · 812 m · +411 m de D+ depuis le point précédent · eau, solide',
    );
  });

  it('un point sans D+ amont ni service n’invente rien', () => {
    const [depart] = reperesEpreuve(doc(), 'longue');
    expect(depart?.libelle).toBe('Départ · km 0 · 677 m');
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
