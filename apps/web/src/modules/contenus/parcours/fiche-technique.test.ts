import { describe, expect, it } from 'vitest';

import { PARCOURS_DOC } from './lecture';
import { analyserProfil, redigerFicheTechnique } from './fiche-technique';
import { construireProfilEpreuve, type ProfilEpreuve } from './profil';

function profilSynthetique(): ProfilEpreuve {
  return {
    distanceM: 10000,
    altitudeMinM: 100,
    altitudeMaxM: 500,
    dplusM: 400,
    points: [
      { sM: 0, altitudeM: 300, pentePct: -3 },
      { sM: 2000, altitudeM: 100, pentePct: -10 },
      { sM: 7000, altitudeM: 500, pentePct: 8 },
      { sM: 10000, altitudeM: 300, pentePct: -7 },
    ],
    parts: [
      { palier: 'roulant', part: 0.2 },
      { palier: 'soutenu', part: 0.5 },
      { palier: 'raide', part: 0.25 },
      { palier: 'tres-raide', part: 0.05 },
    ],
    penteMaxMonteePct: 8,
    penteMaxDescentePct: 10,
    marqueurs: [],
  };
}

describe('analyserProfil', () => {
  const a = analyserProfil(profilSynthetique());

  it('points extrêmes avec leur kilomètre', () => {
    expect(a.pointBas).toEqual({ km: 2, altitudeM: 100 });
    expect(a.pointHaut).toEqual({ km: 7, altitudeM: 500 });
  });

  it('plus longue montée et plus longue descente', () => {
    expect(a.plusLongueMontee).toMatchObject({ deKm: 2, aKm: 7, deniveleM: 400 });
    expect(a.plusLongueMontee?.penteMoyennePct).toBeCloseTo(8, 5);
    expect(a.plusLongueDescente).toMatchObject({ deKm: 7, aKm: 10, deniveleM: 200 });
  });

  it('pentes maximales, effort et D+ au kilomètre', () => {
    expect(a.penteMaxMonteePct).toBe(8);
    expect(a.penteMaxDescentePct).toBe(10);
    expect(a.kmEffort).toBe(14);
    expect(a.dplusParKm).toBe(40);
  });

  it('parts en pourcent entier', () => {
    expect(a.partsPct).toEqual({ roulant: 20, soutenu: 50, raide: 25, 'tres-raide': 5 });
  });

  it('un profil plat n’invente ni montée ni descente', () => {
    const plat: ProfilEpreuve = {
      ...profilSynthetique(),
      points: [
        { sM: 0, altitudeM: 100, pentePct: 0 },
        { sM: 10000, altitudeM: 105, pentePct: 0 },
      ],
    };
    const p = analyserProfil(plat);
    expect(p.plusLongueMontee).toBeNull();
    expect(p.plusLongueDescente).toBeNull();
  });
});

describe('redigerFicheTechnique', () => {
  const paragraphes = redigerFicheTechnique(analyserProfil(profilSynthetique()));

  it('trois paragraphes : relief, effort, pentes', () => {
    expect(paragraphes).toHaveLength(3);
  });

  it('chiffres en français avec espaces insécables', () => {
    const texte = paragraphes.join(' ');
    expect(texte).toContain('100 m');
    expect(texte).toContain('500 m');
    expect(texte).toContain('km 7');
    expect(texte).toContain('14 km-effort');
    expect(texte).toContain('20 %');
  });

  it('qualifie l’effort d’après le D+ au kilomètre', () => {
    expect(paragraphes[1]).toContain('exigeant');
  });
});

describe('relevé réel (28 km, D+ 1 186 m)', () => {
  const profil = PARCOURS_DOC === null ? null : construireProfilEpreuve(PARCOURS_DOC, 'longue');
  it('la grande remontée est la plus longue montée, point haut vers le km 18', () => {
    expect(profil).not.toBeNull();
    const a = analyserProfil(profil as ProfilEpreuve);
    expect(a.pointHaut.altitudeM).toBeGreaterThan(830);
    expect(a.pointHaut.km).toBeGreaterThan(17.5);
    expect(a.pointHaut.km).toBeLessThan(18.5);
    expect(a.plusLongueMontee?.deniveleM).toBeGreaterThan(500);
    expect(a.plusLongueMontee?.aKm).toBeCloseTo(a.pointHaut.km, 0);
    // Extrêmes lus sur la séquence entière, pas sur les points décimés.
    expect(a.penteMaxMonteePct).toBeGreaterThan(27);
    expect(a.penteMaxDescentePct).toBeGreaterThan(30);
  });
});
