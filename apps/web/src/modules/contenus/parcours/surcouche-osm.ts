/* Surcouche « noms et chemins » posée sur le fond satellite (2026-11-12).
 *
 * Module PUR, sans import de MapLibre. Il n'est importé QUE par
 * `components/carte-maplibre.ts`, chargé à la demande : les couches et les
 * couleurs décrites ici restent hors du chemin critique de l'accueil. Ce
 * n'est PAS le cas de `SURCOUCHE_OSM` (URL, police, attribution), qui vit
 * dans `fonds-carte.ts`, importé par `carte.ts` sur l'accueil.
 *
 * La surcouche n'est PAS déclarée dans le style initial : une source TileJSON
 * présente dès l'ouverture retient l'événement `load` tant que son TileJSON
 * n'est pas lu (et pour toujours s'il échoue, MapLibre 4.7.1). Le pilote
 * l'ajoute donc après `load`, et seulement quand le satellite s'affiche.
 *
 * Données OpenStreetMap au schéma OpenMapTiles, servies par OpenFreeMap :
 * couches `transportation` (attributs `class`, `brunnel`),
 * `transportation_name` et `place`.
 */

import { SURCOUCHE_OSM } from './fonds-carte';

/** Identifiants de la source et des couches de la surcouche. */
export const IDS_SURCOUCHE = {
  source: SURCOUCHE_OSM.id,
  coucheChemins: 'couche-osm-chemins',
  coucheRoutes: 'couche-osm-routes',
  coucheGrandsAxes: 'couche-osm-grands-axes',
  coucheNomsRoutes: 'couche-osm-noms-routes',
  coucheNomsLieux: 'couche-osm-noms-lieux',
} as const;

/** Couches de lignes : insérées SOUS le tracé de l'épreuve. */
export const COUCHES_LIGNES_SURCOUCHE = [
  IDS_SURCOUCHE.coucheChemins,
  IDS_SURCOUCHE.coucheRoutes,
  IDS_SURCOUCHE.coucheGrandsAxes,
] as const;

/** Couches de libellés : au sommet, tracé compris. */
export const COUCHES_LIBELLES_SURCOUCHE = [
  IDS_SURCOUCHE.coucheNomsRoutes,
  IDS_SURCOUCHE.coucheNomsLieux,
] as const;

/**
 * Toutes les couches de la surcouche, dans l'ordre du style. Leur visibilité
 * suit TOUJOURS celle du satellite : OpenTopoMap porte déjà ces libellés
 * incrustés, les doubler brouillerait la carte.
 */
export const COUCHES_SURCOUCHE = [...COUCHES_LIGNES_SURCOUCHE, ...COUCHES_LIBELLES_SURCOUCHE] as const;

/**
 * Couleurs de la surcouche posée sur l'imagerie satellite.
 *
 * Convention cartographique des vues « satellite + libellés » (Google Maps,
 * Esri Hybrid) et non tokens de la charte : chemins et pistes gris clair en
 * tirets, routes blanches, grands axes jaune pâle ; texte clair cerné d'un
 * halo sombre, seul contraste qui tienne sur une imagerie tantôt claire,
 * tantôt sombre. Les lignes n'ont pas de liseré : le halo ne concerne que le
 * texte.
 */
export const COULEURS_SURCOUCHE = {
  /** Pistes et sentiers (`track`, `path`), en tirets. */
  chemins: '#D9D9D9',
  /** Routes de desserte (`minor`, `service`). */
  routes: '#FFFFFF',
  /** Grands axes (`motorway` … `tertiary`). */
  grandsAxes: '#FFF2A8',
  /** Texte des libellés. */
  texte: '#FFFFFF',
  /** Halo du texte des libellés. */
  halo: '#1B1B1B',
} as const;

/** Classes OpenMapTiles de chaque groupe de lignes. */
export const CLASSES_LIGNES = {
  chemins: ['track', 'path', 'track_construction', 'path_construction'],
  routes: ['minor', 'service', 'minor_construction', 'service_construction'],
  grandsAxes: [
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
} as const;

/** Classes de lieux nommés : ville, bourg, village, hameau. */
export const CLASSES_LIEUX = ['city', 'town', 'village', 'hamlet'] as const;

/**
 * Nom en alphabet latin : `name:fr`, sinon `name:latin` (calculé par
 * OpenMapTiles). PAS de repli sur `name` : la police servie (Noto Sans) ne
 * couvre pas l'arabe, qui s'afficherait en carrés vides.
 */
export const NOM_LATIN = ['coalesce', ['get', 'name:fr'], ['get', 'name:latin']] as const;

/**
 * Noms de routes : comme `NOM_LATIN`, puis la référence (`ref`, ex. RN12) —
 * en Algérie, beaucoup de routes n'ont qu'une référence. Réservé aux routes :
 * les noms de lieux n'ont pas de `ref`.
 */
export const NOM_ROUTE = ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'ref']] as const;

/** Les classes qui portent aussi des polygones (places piétonnes…) sont écartées. */
const LIGNES_SEULEMENT = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];

/** Les tunnels ne se voient pas d'avion : pas de route dessinée en surface. */
const HORS_TUNNELS = ['!=', ['get', 'brunnel'], 'tunnel'];

type Visibilite = 'visible' | 'none';

/** Source vectorielle décrite par TileJSON (tuiles versionnées chaque semaine). */
export function sourceSurcouche(): Record<string, unknown> {
  return {
    type: 'vector',
    url: SURCOUCHE_OSM.tilejson,
    attribution: SURCOUCHE_OSM.attribution,
  };
}

/** Couches de lignes (chemins, routes, grands axes) : sous le tracé de l'épreuve. */
export function couchesLignesSurcouche(visibilite: Visibilite): Record<string, unknown>[] {
  const ligne = (
    id: string,
    classes: readonly string[],
    couleur: string,
    largeur: readonly [z12: number, z16: number],
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    type: 'line',
    source: IDS_SURCOUCHE.source,
    'source-layer': 'transportation',
    filter: ['all', LIGNES_SEULEMENT, HORS_TUNNELS, ['match', ['get', 'class'], [...classes], true, false]],
    layout: { visibility: visibilite, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': couleur,
      'line-opacity': 0.85,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, largeur[0], 16, largeur[1]],
      ...extra,
    },
  });
  return [
    ligne(IDS_SURCOUCHE.coucheChemins, CLASSES_LIGNES.chemins, COULEURS_SURCOUCHE.chemins, [0.6, 1.6], {
      'line-dasharray': [2, 1.5],
    }),
    ligne(IDS_SURCOUCHE.coucheRoutes, CLASSES_LIGNES.routes, COULEURS_SURCOUCHE.routes, [0.8, 2.5]),
    ligne(IDS_SURCOUCHE.coucheGrandsAxes, CLASSES_LIGNES.grandsAxes, COULEURS_SURCOUCHE.grandsAxes, [1.4, 4]),
  ];
}

/** Couches de libellés (noms de routes, noms de lieux) : au-dessus de tout. */
export function couchesLibellesSurcouche(visibilite: Visibilite): Record<string, unknown>[] {
  const peinture = {
    'text-color': COULEURS_SURCOUCHE.texte,
    'text-halo-color': COULEURS_SURCOUCHE.halo,
    'text-halo-width': 1.4,
    'text-halo-blur': 0.4,
  };
  return [
    {
      id: IDS_SURCOUCHE.coucheNomsRoutes,
      type: 'symbol',
      source: IDS_SURCOUCHE.source,
      'source-layer': 'transportation_name',
      minzoom: 13,
      // Seulement les voies que les couches de lignes dessinent : ni tunnels,
      // ni rail, ni ferry.
      filter: [
        'all',
        HORS_TUNNELS,
        [
          'match',
          ['get', 'class'],
          [...CLASSES_LIGNES.chemins, ...CLASSES_LIGNES.routes, ...CLASSES_LIGNES.grandsAxes],
          true,
          false,
        ],
      ],
      layout: {
        visibility: visibilite,
        'symbol-placement': 'line',
        'text-field': [...NOM_ROUTE],
        'text-font': [...SURCOUCHE_OSM.police],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 12],
        'text-max-angle': 30,
      },
      paint: peinture,
    },
    {
      id: IDS_SURCOUCHE.coucheNomsLieux,
      type: 'symbol',
      source: IDS_SURCOUCHE.source,
      'source-layer': 'place',
      filter: ['match', ['get', 'class'], [...CLASSES_LIEUX], true, false],
      layout: {
        visibility: visibilite,
        'text-field': [...NOM_LATIN],
        'text-font': [...SURCOUCHE_OSM.police],
        'text-size': ['match', ['get', 'class'], 'city', 16, 'town', 14, 'village', 13, 11],
        'text-max-width': 8,
        // Les grandes localités d'abord quand les libellés se disputent la place.
        'symbol-sort-key': ['match', ['get', 'class'], 'city', 0, 'town', 1, 'village', 2, 3],
      },
      paint: peinture,
    },
  ];
}
