import { describe, expect, it } from 'vitest';

import type { PointProfil } from './profil';
import {
  PALETTE_PENTE_VUE,
  VUE,
  couleurPenteVue,
  echellesVue,
  graduationsAltitudeVue,
  pointLePlusProche,
  sMApresTouche,
  segmentsVue,
  sMDepuisPointeur,
} from './profil-vue';

function point(sM: number, altitudeM: number, pentePct: number): PointProfil {
  return { sM, altitudeM, pentePct };
}

describe('couleurPenteVue — les quatre teintes du POC, mêmes bornes que la légende', () => {
  it('une teinte par palier, toutes différentes', () => {
    expect(new Set(PALETTE_PENTE_VUE).size).toBe(4);
  });

  it('moins de 5 % : roulant', () => {
    expect(couleurPenteVue(0)).toBe(PALETTE_PENTE_VUE[0]);
    expect(couleurPenteVue(4.9)).toBe(PALETTE_PENTE_VUE[0]);
  });

  it('5 à 12 % : soutenu — borne basse incluse', () => {
    expect(couleurPenteVue(5)).toBe(PALETTE_PENTE_VUE[1]);
    expect(couleurPenteVue(11.9)).toBe(PALETTE_PENTE_VUE[1]);
  });

  it('12 à 20 % : raide', () => {
    expect(couleurPenteVue(12)).toBe(PALETTE_PENTE_VUE[2]);
    expect(couleurPenteVue(19.9)).toBe(PALETTE_PENTE_VUE[2]);
  });

  it('20 % et plus : très raide', () => {
    expect(couleurPenteVue(20)).toBe(PALETTE_PENTE_VUE[3]);
    expect(couleurPenteVue(45)).toBe(PALETTE_PENTE_VUE[3]);
  });

  it('la descente compte comme la montée : la technicité est la raideur, pas le sens', () => {
    expect(couleurPenteVue(-15)).toBe(couleurPenteVue(15));
    expect(couleurPenteVue(-3)).toBe(couleurPenteVue(3));
  });
});

describe('echellesVue', () => {
  const e = echellesVue(28000, 222, 836);

  it('l’altitude est arrondie à la centaine, comme dans le POC', () => {
    expect(e.amin).toBe(200);
    expect(e.amax).toBe(900);
  });

  it('x : 0 m à gauche de la zone utile, distance totale à droite', () => {
    expect(e.x(0)).toBe(VUE.gauche);
    expect(e.x(28000)).toBe(VUE.largeur - VUE.droite);
  });

  it('y : le point le plus haut est en haut de la zone utile, le plus bas à la base', () => {
    expect(e.y(900)).toBe(VUE.haut);
    expect(e.y(200)).toBe(VUE.hauteur - VUE.bas);
    expect(e.yBase).toBe(VUE.hauteur - VUE.bas);
  });

  it('une distance nulle ne divise pas par zéro', () => {
    const plat = echellesVue(0, 100, 100);
    expect(Number.isFinite(plat.x(0))).toBe(true);
    expect(Number.isFinite(plat.y(100))).toBe(true);
  });
});

describe('graduationsAltitudeVue', () => {
  it('une graduation tous les 200 m, de la base au sommet', () => {
    expect(graduationsAltitudeVue(200, 900)).toEqual([200, 400, 600, 800]);
  });

  it('plage étroite : au moins la base', () => {
    expect(graduationsAltitudeVue(600, 700)).toEqual([600]);
  });
});

describe('segmentsVue', () => {
  const points = [point(0, 677, -4), point(1000, 600, -8), point(2000, 650, 15), point(3000, 700, 25)];
  const e = echellesVue(3000, 600, 700);
  const segments = segmentsVue(points, e);

  it('un segment par intervalle de points', () => {
    expect(segments).toHaveLength(points.length - 1);
  });

  it('la couleur suit la pente MOYENNE des deux extrémités — transitions honnêtes', () => {
    // −4 et −8 → moyenne −6 → soutenu ; −8 et 15 → 3,5 → roulant ; 15 et 25 → 20 → très raide.
    expect(segments.map((s) => s.couleur)).toEqual([
      PALETTE_PENTE_VUE[1],
      PALETTE_PENTE_VUE[0],
      PALETTE_PENTE_VUE[3],
    ]);
  });

  it('l’aire descend jusqu’à la base : un polygone fermé, jamais flottant', () => {
    for (const s of segments) {
      expect(s.aire).toMatch(/^M[\d. -]+L[\d. -]+L[\d. -]+L[\d. -]+Z$/);
      expect(s.aire).toContain(String(e.yBase));
    }
  });

  it('moins de deux points : aucun segment, jamais une erreur', () => {
    expect(segmentsVue([], e)).toEqual([]);
    expect(segmentsVue([point(0, 1, 0)], e)).toEqual([]);
  });
});

describe('pointLePlusProche — lecture sous le pointeur', () => {
  const points = [point(0, 677, 0), point(1000, 600, -5), point(2000, 650, 10), point(3000, 700, 3)];

  it('rend le point dont l’abscisse est la plus proche', () => {
    expect(pointLePlusProche(points, 900)?.sM).toBe(1000);
    expect(pointLePlusProche(points, 1400)?.sM).toBe(1000);
    expect(pointLePlusProche(points, 1600)?.sM).toBe(2000);
  });

  it('avant le départ ou après l’arrivée : les extrémités', () => {
    expect(pointLePlusProche(points, -50)?.sM).toBe(0);
    expect(pointLePlusProche(points, 9999)?.sM).toBe(3000);
  });

  it('profil vide : null', () => {
    expect(pointLePlusProche([], 100)).toBeNull();
  });
});

describe('sMDepuisPointeur — du pixel à la distance', () => {
  it('au bord gauche de la zone utile : départ ; au bord droit : arrivée', () => {
    const gauche = (VUE.gauche / VUE.largeur) * 1000;
    const droite = ((VUE.largeur - VUE.droite) / VUE.largeur) * 1000;
    expect(sMDepuisPointeur(gauche, 1000, 28000)).toBeCloseTo(0, 0);
    expect(sMDepuisPointeur(droite, 1000, 28000)).toBeCloseTo(28000, 0);
  });

  it('hors de la zone utile : borné, jamais négatif ni au-delà de l’arrivée', () => {
    expect(sMDepuisPointeur(-40, 1000, 28000)).toBe(0);
    expect(sMDepuisPointeur(5000, 1000, 28000)).toBe(28000);
  });

  it('largeur rendue nulle : 0, pas NaN', () => {
    expect(sMDepuisPointeur(10, 0, 28000)).toBe(0);
  });
});

describe('sMApresTouche — le curseur du profil au clavier', () => {
  const D = 28000;

  it('flèche droite : 1 % de la distance plus loin ; flèche gauche : 1 % en arrière', () => {
    expect(sMApresTouche('ArrowRight', false, 10000, D)).toBe(10280);
    expect(sMApresTouche('ArrowLeft', false, 10000, D)).toBe(9720);
  });

  it('avec Maj : 5 % d’un coup', () => {
    expect(sMApresTouche('ArrowRight', true, 10000, D)).toBe(11400);
  });

  it('borné : jamais avant le départ ni après l’arrivée', () => {
    expect(sMApresTouche('ArrowLeft', false, 50, D)).toBe(0);
    expect(sMApresTouche('ArrowRight', false, 27900, D)).toBe(28000);
  });

  it('première touche sans curseur posé : on part du départ', () => {
    expect(sMApresTouche('ArrowRight', false, null, D)).toBe(280);
  });

  it('Début et Fin : départ et arrivée', () => {
    expect(sMApresTouche('Home', false, 10000, D)).toBe(0);
    expect(sMApresTouche('End', false, 10000, D)).toBe(28000);
  });

  it('Échap : retire le curseur (null)', () => {
    expect(sMApresTouche('Escape', false, 10000, D)).toBeNull();
  });

  it('toute autre touche : undefined — le navigateur garde son comportement (Tab, etc.)', () => {
    expect(sMApresTouche('Tab', false, 10000, D)).toBeUndefined();
    expect(sMApresTouche('a', false, 10000, D)).toBeUndefined();
  });
});
