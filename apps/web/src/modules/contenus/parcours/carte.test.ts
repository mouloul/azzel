import { describe, expect, it } from 'vitest';

import { FOND_TOPO, RELIEF_TERRARIUM, SURCOUCHE_OSM, fondSatellite } from './fonds-carte';
import { PARCOURS_DOC } from './lecture';
import {
  CAMERA_3D,
  EXAGERATION,
  IDS,
  coordonnees2d,
  emprise,
  indexDepuisDistance,
  simplifierTrace,
  specificationStyle,
  traceCarte,
  webglDisponible,
  type PointTrace,
} from './carte';
import { COUCHES_SURCOUCHE, IDS_SURCOUCHE } from './surcouche-osm';

const COULEURS = {
  trace: '#B4530F',
  halo: '#10241A',
  cielHaut: '#86B4E0',
  cielHorizon: '#CFE0EF',
};

const TRACE: PointTrace[] = [
  [4.43, 36.76, 677],
  [4.45, 36.78, 820],
  [4.41, 36.74, 300],
];

describe('géométrie du tracé', () => {
  it('projette en 2D sans perdre l’ordre des points', () => {
    expect(coordonnees2d(TRACE)).toEqual([
      [4.43, 36.76],
      [4.45, 36.78],
      [4.41, 36.74],
    ]);
  });

  it('calcule l’emprise du tracé', () => {
    expect(emprise(TRACE)).toEqual([
      [4.41, 36.74],
      [4.45, 36.78],
    ]);
  });

  it('tracé vide : aucune emprise plutôt qu’un rectangle faux', () => {
    expect(emprise([])).toBeNull();
  });
});

describe('indexDepuisDistance (bus du curseur, story 11.5)', () => {
  const distances = [0, 100, 200, 300, 400];

  it('retrouve une distance exacte', () => {
    expect(indexDepuisDistance(distances, 200)).toBe(2);
    expect(indexDepuisDistance(distances, 0)).toBe(0);
    expect(indexDepuisDistance(distances, 400)).toBe(4);
  });

  it('rend le point le PLUS PROCHE, pas le suivant', () => {
    expect(indexDepuisDistance(distances, 149)).toBe(1);
    expect(indexDepuisDistance(distances, 151)).toBe(2);
  });

  it('hors bornes : se rabat sur les extrémités', () => {
    expect(indexDepuisDistance(distances, -50)).toBe(0);
    expect(indexDepuisDistance(distances, 9999)).toBe(4);
  });

  it('liste vide : index 0, aucune exception', () => {
    expect(indexDepuisDistance([], 100)).toBe(0);
  });
});

describe('spécification de style', () => {
  const style = specificationStyle(TRACE, COULEURS);
  const sources = style.sources as Record<string, Record<string, unknown>>;
  const layers = style.layers as Record<string, unknown>[];

  it('le relief est un raster-dem en encodage terrarium', () => {
    const relief = sources[IDS.relief];
    expect(relief?.type).toBe('raster-dem');
    expect(relief?.encoding).toBe('terrarium');
    expect(relief?.tiles).toEqual([...RELIEF_TERRARIUM.tuiles]);
  });

  it('chaque source tierce porte son attribution', () => {
    expect(sources[IDS.fond]?.attribution).toBe(FOND_TOPO.attribution);
    expect(sources[IDS.relief]?.attribution).toBe(RELIEF_TERRARIUM.attribution);
  });

  it('le tracé est une LineString des points fournis', () => {
    const donnees = sources[IDS.trace]?.data as {
      geometry: { type: string; coordinates: number[][] };
    };
    expect(donnees.geometry.type).toBe('LineString');
    expect(donnees.geometry.coordinates).toHaveLength(TRACE.length);
  });

  it('le halo est dessiné SOUS le tracé, sinon il le masque', () => {
    const ordre = layers.map((couche) => couche.id);
    expect(ordre.indexOf(IDS.coucheHalo)).toBeLessThan(ordre.indexOf(IDS.coucheTrace));
    expect(ordre.indexOf(IDS.coucheFond)).toBeLessThan(ordre.indexOf(IDS.coucheHalo));
  });

  it('aucune couleur littérale : tout vient des tokens passés en argument', () => {
    const serialise = JSON.stringify(style);
    for (const couleur of Object.values(COULEURS)) {
      expect(serialise).toContain(couleur);
    }
    // La teinte terre cuite du POC ne doit plus être codée en dur ici.
    expect(serialise).not.toContain('#e4572e');
  });

  it('aucun endpoint Esri, conformément à la décision 11.2', () => {
    expect(JSON.stringify(style)).not.toMatch(/arcgis|esri/i);
  });
});

describe('garde-fous d’affichage', () => {
  it('la caméra d’ouverture est inclinée, sinon le relief ne se voit pas', () => {
    expect(CAMERA_3D.pitch).toBeGreaterThan(45);
    expect(CAMERA_3D.pitch).toBeLessThanOrEqual(CAMERA_3D.pitchMax);
  });

  it('l’exagération par défaut tient dans ses bornes', () => {
    expect(EXAGERATION.defaut).toBeGreaterThanOrEqual(EXAGERATION.min);
    expect(EXAGERATION.defaut).toBeLessThanOrEqual(EXAGERATION.max);
  });

  it('WebGL absent : détecté sans exception (UX-DR-30)', () => {
    expect(webglDisponible(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement)).toBe(
      false,
    );
    expect(
      webglDisponible(() => {
        throw new Error('canvas indisponible');
      }),
    ).toBe(false);
    expect(
      webglDisponible(() => ({ getContext: (type: string) => (type === 'webgl2' ? {} : null) }) as unknown as HTMLCanvasElement),
    ).toBe(true);
  });
});

describe('traceCarte — extraction depuis le relevé réel', () => {
  it('la longue rend un tracé simplifié, nettement plus léger que le relevé', () => {
    const trace = traceCarte(PARCOURS_DOC, 'longue');
    expect(trace).not.toBeNull();
    const brut = PARCOURS_DOC?.coords.length ?? 0;
    expect(brut).toBeGreaterThan(3000);
    // Allègement réel, sans quoi la simplification ne sert à rien.
    expect(trace!.points.length).toBeLessThan(brut / 2);
    // Les extrémités ne bougent jamais : départ et arrivée restent sur place.
    expect(trace!.points[0]).toEqual([
      PARCOURS_DOC!.coords[0]![0],
      PARCOURS_DOC!.coords[0]![1],
      PARCOURS_DOC!.coords[0]![2],
    ]);
    expect(trace!.distancesM[0]).toBe(0);
  });

  it('les distances restent croissantes et finissent sur la distance publiée', () => {
    const trace = traceCarte(PARCOURS_DOC, 'longue')!;
    for (let i = 1; i < trace.distancesM.length; i++) {
      expect(trace.distancesM[i]!).toBeGreaterThanOrEqual(trace.distancesM[i - 1]!);
    }
    const fin = trace.distancesM[trace.distancesM.length - 1]!;
    expect(fin).toBeCloseTo(PARCOURS_DOC!.epreuves.longue!.distanceM, 0);
  });

  it('épreuve absente : null, jamais une carte sans ligne', () => {
    expect(traceCarte(PARCOURS_DOC, 'inconnue')).toBeNull();
    expect(traceCarte(null, 'longue')).toBeNull();
  });
});

describe('simplifierTrace', () => {
  it('garde les extrémités et retire les points alignés', () => {
    const aligne: PointTrace[] = [
      [0, 0, 0],
      [1, 1, 0],
      [2, 2, 0],
      [3, 3, 0],
    ];
    expect(simplifierTrace(aligne, 0.001)).toEqual([0, 3]);
  });

  it('garde un point qui s’écarte vraiment', () => {
    const coude: PointTrace[] = [
      [0, 0, 0],
      [1, 5, 0],
      [2, 0, 0],
    ];
    expect(simplifierTrace(coude, 0.001)).toEqual([0, 1, 2]);
  });

  it('deux points ou moins : rien à simplifier', () => {
    expect(simplifierTrace([[0, 0, 0]], 0.1)).toEqual([0]);
  });
});

describe('traceCarte — slug fourni par un visiteur', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'le slug « %s » rend null : un nom hérité de Object ne passe pas pour une épreuve',
    (slug) => {
      // La route publique du tracé transmet le slug de l'URL. Sans garde,
      // `epreuves['constructor']` rend une fonction et `.tranches` lève.
      expect(traceCarte(PARCOURS_DOC, slug)).toBeNull();
    },
  );
});

describe('specificationStyle — fond satellite optionnel', () => {
  const pts: [number, number, number][] = [[4, 36, 100], [4.01, 36.01, 120]];
  const couleurs = { trace: '#000', halo: '#fff', cielHaut: '#000', cielHorizon: '#fff' } as never;
  const sat = fondSatellite('CLE_DE_TEST_12345');

  it('sans satellite : ni source ni couche satellite (aucun appel Esri)', () => {
    const style = specificationStyle(pts, couleurs) as { sources: Record<string, unknown>; layers: { id: string }[] };
    expect(style.sources[IDS.satellite]).toBeUndefined();
    expect(style.layers.map((l) => l.id)).not.toContain(IDS.coucheSatellite);
  });

  it('avec satellite : couche masquée par défaut, visible sur demande', () => {
    const masque = specificationStyle(pts, couleurs, undefined, sat) as { layers: { id: string; layout?: { visibility: string } }[] };
    expect(masque.layers.find((l) => l.id === IDS.coucheSatellite)?.layout?.visibility).toBe('none');
    const visible = specificationStyle(pts, couleurs, undefined, sat, true) as typeof masque;
    expect(visible.layers.find((l) => l.id === IDS.coucheSatellite)?.layout?.visibility).toBe('visible');
  });
});

describe('specificationStyle — surcouche noms et chemins (OpenFreeMap) hors du style initial', () => {
  const pts: [number, number, number][] = [[4, 36, 100], [4.01, 36.01, 120]];
  const sat = fondSatellite('CLE_DE_TEST_12345');
  type Style = { glyphs?: string; sources: Record<string, unknown>; layers: { id: string }[] };

  it('sans satellite : ni source, ni couche, ni glyphes — aucune mention d’OpenFreeMap', () => {
    const style = specificationStyle(pts, COULEURS) as Style;
    expect(style.glyphs).toBeUndefined();
    expect(style.sources[IDS_SURCOUCHE.source]).toBeUndefined();
    const ids = style.layers.map((l) => l.id);
    for (const id of COUCHES_SURCOUCHE) expect(ids).not.toContain(id);
    expect(JSON.stringify(style)).not.toContain('openfreemap');
  });

  it.each([false, true])(
    'avec satellite (visible = %s) : glyphes seuls, ni source ni couche — `load` ne dépend pas d’OpenFreeMap',
    (visible) => {
      const style = specificationStyle(pts, COULEURS, undefined, sat, visible) as Style;
      expect(style.glyphs).toBe(SURCOUCHE_OSM.glyphes);
      expect(style.sources[IDS_SURCOUCHE.source]).toBeUndefined();
      expect(JSON.stringify(style.sources)).not.toContain('openfreemap');
      const ids = style.layers.map((l) => l.id);
      for (const id of COUCHES_SURCOUCHE) expect(ids).not.toContain(id);
    },
  );
});
