import { describe, expect, it } from 'vitest';

import { SURCOUCHE_OSM, urlPorteUneCle } from './fonds-carte';
import {
  CLASSES_LIEUX,
  CLASSES_LIGNES,
  COUCHES_LIBELLES_SURCOUCHE,
  COUCHES_LIGNES_SURCOUCHE,
  COUCHES_SURCOUCHE,
  COULEURS_SURCOUCHE,
  IDS_SURCOUCHE,
  couchesLibellesSurcouche,
  couchesLignesSurcouche,
  sourceSurcouche,
} from './surcouche-osm';

/* Surcouche noms et chemins (2026-11-12) — spécification des couches
 * OpenFreeMap / OpenMapTiles ajoutées par le pilote au-dessus du satellite. */

type Couche = {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
  filter?: unknown;
  minzoom?: number;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

const lignes = couchesLignesSurcouche('visible') as Couche[];
const libelles = couchesLibellesSurcouche('visible') as Couche[];
const parId = (id: string) => [...lignes, ...libelles].find((c) => c.id === id);

/** Filtre attendu d'un groupe de lignes, à l'ordre près des clauses. */
const filtreLignes = (classes: readonly string[]) => [
  'all',
  ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
  ['!=', ['get', 'brunnel'], 'tunnel'],
  ['match', ['get', 'class'], [...classes], true, false],
];

describe('source de la surcouche', () => {
  it('vectorielle, décrite par TileJSON, avec l’attribution publiée', () => {
    expect(sourceSurcouche()).toEqual({
      type: 'vector',
      url: SURCOUCHE_OSM.tilejson,
      attribution: SURCOUCHE_OSM.attribution,
    });
    expect(IDS_SURCOUCHE.source).toBe(SURCOUCHE_OSM.id);
  });

  it('aucune clé dans les URL (TileJSON, glyphes), rien que du HTTPS', () => {
    const urls = [String(sourceSurcouche().url), SURCOUCHE_OSM.glyphes];
    for (const url of urls) {
      expect(urlPorteUneCle(url)).toBe(false);
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});

describe('couches de lignes (transportation)', () => {
  it('trois couches, dans l’ordre chemins < routes < grands axes, toutes sur la surcouche', () => {
    expect(lignes.map((c) => c.id)).toEqual([...COUCHES_LIGNES_SURCOUCHE]);
    for (const couche of lignes) {
      expect(couche.type).toBe('line');
      expect(couche.source).toBe(IDS_SURCOUCHE.source);
      expect(couche['source-layer']).toBe('transportation');
    }
  });

  it.each([
    [IDS_SURCOUCHE.coucheChemins, ['track', 'path', 'track_construction', 'path_construction']],
    [
      IDS_SURCOUCHE.coucheRoutes,
      ['minor', 'service', 'minor_construction', 'service_construction'],
    ],
    [
      IDS_SURCOUCHE.coucheGrandsAxes,
      [
        'motorway',
        'trunk',
        'primary',
        'secondary',
        'tertiary',
        'motorway_construction',
        'trunk_construction',
        'primary_construction',
        'secondary_construction',
        'tertiary_construction',
      ],
    ],
  ])('%s : géométries linéaires seules, tunnels exclus, classes attendues', (id, classes) => {
    expect(parId(id)?.filter).toEqual(filtreLignes(classes));
  });

  it('aucune classe n’est dessinée deux fois', () => {
    const toutes = [...CLASSES_LIGNES.chemins, ...CLASSES_LIGNES.routes, ...CLASSES_LIGNES.grandsAxes];
    expect(new Set(toutes).size).toBe(toutes.length);
  });

  it('couleurs : constantes nommées ; chemins en tirets', () => {
    expect(parId(IDS_SURCOUCHE.coucheChemins)?.paint?.['line-color']).toBe(COULEURS_SURCOUCHE.chemins);
    expect(parId(IDS_SURCOUCHE.coucheChemins)?.paint?.['line-dasharray']).toEqual([2, 1.5]);
    expect(parId(IDS_SURCOUCHE.coucheRoutes)?.paint?.['line-color']).toBe(COULEURS_SURCOUCHE.routes);
    expect(parId(IDS_SURCOUCHE.coucheGrandsAxes)?.paint?.['line-color']).toBe(COULEURS_SURCOUCHE.grandsAxes);
  });
});

describe('couches de libellés', () => {
  it('noms de routes (transportation_name, dès z13) puis noms de lieux (place)', () => {
    expect(libelles.map((c) => c.id)).toEqual([...COUCHES_LIBELLES_SURCOUCHE]);
    const routes = parId(IDS_SURCOUCHE.coucheNomsRoutes);
    expect(routes?.['source-layer']).toBe('transportation_name');
    expect(routes?.minzoom).toBe(13);
    const lieux = parId(IDS_SURCOUCHE.coucheNomsLieux);
    expect(lieux?.['source-layer']).toBe('place');
    expect(lieux?.filter).toEqual(['match', ['get', 'class'], [...CLASSES_LIEUX], true, false]);
    expect([...CLASSES_LIEUX]).toEqual(['city', 'town', 'village', 'hamlet']);
  });

  it('nom latin SANS repli sur `name` (la police ne couvre pas l’arabe) ; `ref` pour les seules routes', () => {
    for (const couche of libelles) {
      expect(couche.type).toBe('symbol');
      expect(couche.source).toBe(IDS_SURCOUCHE.source);
      expect(JSON.stringify(couche.layout?.['text-field'])).not.toContain('"name"');
      expect(couche.layout?.['text-font']).toEqual([...SURCOUCHE_OSM.police]);
    }
    expect(parId(IDS_SURCOUCHE.coucheNomsRoutes)?.layout?.['text-field']).toEqual([
      'coalesce',
      ['get', 'name:fr'],
      ['get', 'name:latin'],
      ['get', 'ref'],
    ]);
    expect(parId(IDS_SURCOUCHE.coucheNomsLieux)?.layout?.['text-field']).toEqual([
      'coalesce',
      ['get', 'name:fr'],
      ['get', 'name:latin'],
    ]);
  });

  it('noms de routes : tunnels exclus, seulement les classes dessinées par les couches de lignes', () => {
    const toutes = [...CLASSES_LIGNES.chemins, ...CLASSES_LIGNES.routes, ...CLASSES_LIGNES.grandsAxes];
    expect(parId(IDS_SURCOUCHE.coucheNomsRoutes)?.filter).toEqual([
      'all',
      ['!=', ['get', 'brunnel'], 'tunnel'],
      ['match', ['get', 'class'], toutes, true, false],
    ]);
    expect(toutes).not.toContain('rail');
    expect(toutes).not.toContain('ferry');
  });

  it('texte clair, halo sombre', () => {
    for (const couche of libelles) {
      expect(couche.paint?.['text-color']).toBe(COULEURS_SURCOUCHE.texte);
      expect(couche.paint?.['text-halo-color']).toBe(COULEURS_SURCOUCHE.halo);
    }
  });
});

describe('visibilité', () => {
  it.each(['visible', 'none'] as const)('toutes les couches portent la visibilité demandée (%s)', (v) => {
    const couches = [...couchesLignesSurcouche(v), ...couchesLibellesSurcouche(v)] as Couche[];
    expect(couches.map((c) => c.id)).toEqual([...COUCHES_SURCOUCHE]);
    for (const couche of couches) expect(couche.layout?.visibility).toBe(v);
  });
});
