import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { arrondi, haversineM } from './geo';
import { parserGpx, type PointGpx } from './gpx';
import {
  FENETRE_LISSAGE,
  PART_MAX_DISTANCE_SEGMENTS_LONGS,
  PART_MAX_POINTS_VITESSE_IMPLAUSIBLE,
  PAS_MEDIAN_MAX_S,
  SEUIL_DPLUS_M,
  SEUIL_FUSION_M,
  SEUIL_SEGMENT_LONG_S,
  VITESSE_IMPLAUSIBLE_M_S,
  calculerDeniveles,
  evaluerQualiteReleve,
  fusionnerPoints,
  lisserAltitudes,
  preparerGeometrie,
  rejeterVitesseImplausible,
} from './traitement';

function cheminGpx(nomFichier: string): string {
  // parcours/ → contenus → modules → src → web → apps → racine du monorepo (6 niveaux).
  return fileURLToPath(new URL(`../../../../../../docs/GPX/${nomFichier}`, import.meta.url));
}

function pointGpx(overrides: Partial<PointGpx> = {}): PointGpx {
  return {
    lon: 0,
    lat: 0,
    ele: 100,
    tempsIso: '2026-01-01T08:00:00.000Z',
    tempsMs: Date.parse('2026-01-01T08:00:00.000Z'),
    ...overrides,
  };
}

// 1° de longitude à l’équateur avec R = 6 371 000 m (≈ 111 194,93 m) : les
// fixtures se positionnent en degrés pour des distances contrôlées.
const M_PAR_DEGRE = (2 * Math.PI * 6_371_000) / 360;

describe('parcours — constantes de la porte et du D+ (FR-28b)', () => {
  it('les constantes portent les valeurs décidées (spec 11.1)', () => {
    expect(SEUIL_DPLUS_M).toBe(5);
    expect(SEUIL_FUSION_M).toBe(8);
    expect(FENETRE_LISSAGE).toBe(7);
    expect(VITESSE_IMPLAUSIBLE_M_S).toBe(12.5);
    expect(PAS_MEDIAN_MAX_S).toBe(2);
    expect(SEUIL_SEGMENT_LONG_S).toBe(30);
    expect(PART_MAX_DISTANCE_SEGMENTS_LONGS).toBe(0.05);
    expect(PART_MAX_POINTS_VITESSE_IMPLAUSIBLE).toBe(0.01);
  });
});

describe('parcours — geo', () => {
  it('haversine : 1° de longitude à l’équateur ≈ 111 195 m', () => {
    expect(haversineM(0, 0, 0, 1)).toBeCloseTo(M_PAR_DEGRE, -1);
  });

  it('arrondi : décimales fixes, jamais -0', () => {
    expect(arrondi(678.25, 1)).toBe(678.3);
    expect(arrondi(-0.0001, 2)).toBe(0);
    expect(Object.is(arrondi(-0.0001, 2), -0)).toBe(false);
  });
});

describe('parcours — dénivelés (brut vs hystérésis)', () => {
  it('hystérésis 5 m : les micro-variations sous seuil ne comptent pas, les franchissements cumulent tout le Δ', () => {
    // Montée 100→106 (D+ 6, ancre 106), plateau 103 (rien), descente 106→100
    // (D− 6, ancre 100), 98 (rien), 100→95 (D− 5), remontée 95→99 (sous seuil).
    const d = calculerDeniveles([100, 102, 104, 106, 103, 100, 98, 95, 99]);
    expect(d.dPlusSeuilM).toBe(6);
    expect(d.dMoinsSeuilM).toBe(6 + 5);
    expect(d.dPlusBrutM).toBeCloseTo(2 + 2 + 2 + 4, 5);
    expect(d.dMoinsBrutM).toBeCloseTo(3 + 3 + 2 + 3, 5);
  });

  it('symétrie : une descente franche compte autant que la montée', () => {
    const d = calculerDeniveles([100, 110, 100]);
    expect(d.dPlusSeuilM).toBe(10);
    expect(d.dMoinsSeuilM).toBe(10);
  });
});

describe('parcours — rejet vitesse / fusion / lissage', () => {
  it('rejet des points à vitesse > 12,5 m/s', () => {
    // 0→0.001° (111 m) en 1 s = 111 m/s : téléporté, jeté.
    const gardes = rejeterVitesseImplausible([
      pointGpx(),
      pointGpx({ lon: 0.001 }),
      pointGpx({ lon: 0.0001, tempsMs: Date.parse('2026-01-01T08:00:02.000Z') }),
    ]);
    expect(gardes).toHaveLength(2);
    expect(gardes[1]?.lon).toBeCloseTo(0.0001, 6);
  });

  it('fusion : seuls les points à ≥ 8 m du dernier gardé survivent, le dernier toujours', () => {
    const points = [
      pointGpx({ lon: 0 }),
      pointGpx({ lon: 5 / M_PAR_DEGRE }), // 5 m : fusionné
      pointGpx({ lon: 11 / M_PAR_DEGRE }), // 11 m du dernier gardé : gardé
      pointGpx({ lon: 14 / M_PAR_DEGRE }), // 3 m : fusionné
      pointGpx({ lon: 15 / M_PAR_DEGRE }), // dernier brut : toujours gardé
    ];
    const gardes = fusionnerPoints(points);
    expect(gardes.map((p) => p.lon)).toEqual([0, 11 / M_PAR_DEGRE, 15 / M_PAR_DEGRE]);
  });

  it('lissage centré fenêtre 7, bords raccourcis (le pic reste dans la fenêtre du bord)', () => {
    const lissees = lisserAltitudes([0, 0, 0, 30, 0, 0, 0]);
    expect(lissees[3]).toBeCloseTo(30 / 7, 5); // fenêtre complète
    expect(lissees[0]).toBeCloseTo(30 / 4, 5); // fenêtre tronquée [0..3]
    expect(lissees[6]).toBeCloseTo(30 / 4, 5); // fenêtre tronquée [3..6]
  });
});

describe('parcours — porte de qualité (FR-28b) sur les relevés réels', () => {
  it('activity_24827718657.gpx : refusé, chaque défaut nommé avec son chiffre', () => {
    const releve = parserGpx(readFileSync(cheminGpx('activity_24827718657.gpx'), 'utf8'));
    expect(releve.points).toHaveLength(598);
    const rapport = evaluerQualiteReleve(releve.points);
    expect(rapport.accepte).toBe(false);
    expect(rapport.defauts.some((d) => d.includes('pas médian 3 s'))).toBe(true);
    expect(
      rapport.defauts.some((d) => d.includes('de la distance sur des segments > 30 s')),
    ).toBe(true);
    expect(rapport.defauts.some((d) => d.includes('47 points à vitesse > 12.5 m/s'))).toBe(true);
  });

  it('activity_24920331005.gpx : accepté (1 s, 0,3 %, 0 point implausible)', () => {
    const releve = parserGpx(readFileSync(cheminGpx('activity_24920331005.gpx'), 'utf8'));
    expect(releve.points).toHaveLength(26_933);
    const rapport = evaluerQualiteReleve(releve.points);
    expect(rapport.accepte).toBe(true);
    expect(rapport.pasMedianS).toBe(1);
    expect(rapport.partDistanceSegmentsLongs).toBeLessThanOrEqual(0.05);
    expect(rapport.pointsVitesseImplausible).toBe(0);
  });

  it('préparation : 26 933 bruts → 3 222 gardés, 28 km, D+ brut 1280 → 1186 au seuil', () => {
    const releve = parserGpx(readFileSync(cheminGpx('activity_24920331005.gpx'), 'utf8'));
    const geometrie = preparerGeometrie(releve.points);
    expect(geometrie.points).toHaveLength(3222);
    expect(geometrie.distanceTotaleM).toBeGreaterThan(27_900);
    expect(geometrie.distanceTotaleM).toBeLessThan(28_100);
    // Effet chiffré cité par la constante SEUIL_DPLUS_M (effet mesuré).
    expect(geometrie.deniveles.dPlusBrutM).toBeGreaterThan(1270);
    expect(geometrie.deniveles.dPlusBrutM).toBeLessThan(1290);
    expect(geometrie.deniveles.dPlusSeuilM).toBeGreaterThan(1176);
    expect(geometrie.deniveles.dPlusSeuilM).toBeLessThan(1196);
  });
});
