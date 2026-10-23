import { describe, expect, it } from 'vitest';

import {
  MAX_POINTS_TRACE,
  POSITION_ESTOMPEE_MS,
  echantillonnerPoints,
  estEstompee,
  libelleDerniereConnue,
  type PointTrace,
} from './carte';

// Story 7.3 — contrat public de la carte anonyme : bornes exactes de
// l'estompage (assumption X = 1 h), libellés sobres « il y a X min/h »,
// échantillonnage fidèle aux extrémités et régulièrement réparti.

const MAINTENANT = new Date('2027-03-26T10:00:00.000Z');

function ilYA(ms: number): string {
  return new Date(MAINTENANT.getTime() - ms).toISOString();
}

describe('POSITION_ESTOMPEE_MS — assumption balisée', () => {
  it('X = 1 h exactement (3 600 000 ms)', () => {
    expect(POSITION_ESTOMPEE_MS).toBe(3_600_000);
  });
});

describe('estEstompee — bornes strictes', () => {
  it('position récente (59 min) : PAS estompée', () => {
    expect(estEstompee(ilYA(59 * 60_000), MAINTENANT)).toBe(false);
  });

  it('exactement 1 h : PAS encore estompée (strictement plus vieux seulement)', () => {
    expect(estEstompee(ilYA(POSITION_ESTOMPEE_MS), MAINTENANT)).toBe(false);
  });

  it('1 h + 1 ms : estompée', () => {
    expect(estEstompee(ilYA(POSITION_ESTOMPEE_MS + 1), MAINTENANT)).toBe(true);
  });

  it('capteA illisible : estompée (défense en profondeur, jamais « fraîche »)', () => {
    expect(estEstompee('pas-un-horodatage', MAINTENANT)).toBe(true);
  });

  it('horodatage dans le futur (horloge appareil en avance) : PAS estompée', () => {
    expect(estEstompee(ilYA(-5 * 60_000), MAINTENANT)).toBe(false);
  });
});

describe('libelleDerniereConnue — sobre, jamais alarmiste', () => {
  it('moins d’une minute : plancher « il y a 1 min » (jamais 0)', () => {
    expect(libelleDerniereConnue(ilYA(5_000), MAINTENANT)).toBe('il y a 1 min');
  });

  it('minutes pleines', () => {
    expect(libelleDerniereConnue(ilYA(12 * 60_000), MAINTENANT)).toBe('il y a 12 min');
  });

  it('au-delà d’une heure : heures', () => {
    expect(libelleDerniereConnue(ilYA(3 * 60 * 60_000), MAINTENANT)).toBe('il y a 3 h');
  });

  it('2 h 59 → « il y a 2 h » (plancher, jamais surestimé)', () => {
    expect(libelleDerniereConnue(ilYA(179 * 60_000), MAINTENANT)).toBe('il y a 2 h');
  });

  it('capteA illisible : repli à l’âge d’estompage, cohérent avec estEstompee', () => {
    expect(libelleDerniereConnue('invalide', MAINTENANT)).toBe('il y a 1 h');
  });
});

function trace(n: number): PointTrace[] {
  return Array.from({ length: n }, (_, index) => ({ lat: index, lon: index }));
}

describe('echantillonnerPoints — fidélité et répartition', () => {
  it('entrée ≤ max : retournée TELLE QUELLE (identité)', () => {
    const points = trace(10);
    expect(echantillonnerPoints(points, 500)).toBe(points);
    expect(echantillonnerPoints(points, 10)).toBe(points);
  });

  it('extrémités TOUJOURS conservées (premier et dernier points)', () => {
    const echantillon = echantillonnerPoints(trace(50_000), 500);
    expect(echantillon).toHaveLength(500);
    expect(echantillon[0]).toEqual({ lat: 0, lon: 0 });
    expect(echantillon[499]).toEqual({ lat: 49_999, lon: 49_999 });
  });

  it('répartition régulière : indices strictement croissants, sans doublon', () => {
    const points = trace(1_234);
    const echantillon = echantillonnerPoints(points, 100);
    const indices = echantillon.map((point) => point.lat);
    expect(indices).toHaveLength(100);
    for (let index = 1; index < indices.length; index += 1) {
      expect(indices[index] as number).toBeGreaterThan(indices[index - 1] as number);
    }
  });

  it('répartition régulière : chaque point à ≤ un demi-pas de sa position idéale', () => {
    const n = 10_000;
    const max = 500;
    const echantillon = echantillonnerPoints(trace(n), max);
    const pasMoyen = (n - 1) / (max - 1);
    for (let rang = 0; rang < echantillon.length; rang += 1) {
      expect(Math.abs((echantillon[rang]!.lat as number) - rang * pasMoyen)).toBeLessThanOrEqual(0.5);
    }
  });

  it('tracé vide : vide (une épreuve sans points reste honnête)', () => {
    expect(echantillonnerPoints([], 500)).toEqual([]);
  });

  it('max par défaut : 500 (contrat figé MAX_POINTS_TRACE)', () => {
    expect(MAX_POINTS_TRACE).toBe(500);
    expect(echantillonnerPoints(trace(501))).toHaveLength(500);
  });

  it('max < 2 : erreur de programmation (un tracé vit au moins départ + arrivée)', () => {
    expect(() => echantillonnerPoints(trace(10), 1)).toThrow();
    expect(() => echantillonnerPoints(trace(10), 0)).toThrow();
  });
});
