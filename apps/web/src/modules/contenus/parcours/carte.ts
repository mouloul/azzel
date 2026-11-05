/* Story 11.3 — carte 3D du parcours : géométrie et spécification de style.
 *
 * Module PUR, sans import de MapLibre : il décrit ce qu'il faut afficher, le
 * moteur est chargé ailleurs (carte-maplibre.ts, import dynamique). Les tests
 * lisent donc ce contrat sans tirer 200 Ko de moteur WebGL, et le chemin
 * critique de la vitrine ignore jusqu'à l'existence de la carte (NFR-13).
 *
 * Reprend les motifs du POC `poc/index.html` : relief terrarium en raster-dem
 * posé par setTerrain, tracé de l'épreuve active avec halo, ciel, caméra
 * inclinée. Deux écarts assumés :
 *   - plus de bascule satellite/topo (un seul fond, décision 11.2) ;
 *   - les couleurs viennent des tokens de la charte, pas de littéraux.
 */

import { FOND_PAR_DEFAUT, RELIEF_TERRARIUM, type SourceTuiles } from './fonds-carte';

/** Point du tracé tel que `parcours.json` le stocke : lon, lat, altitude. */
export type PointTrace = readonly [lon: number, lat: number, altitudeM: number];

/** Caméra d'ouverture : la vue inclinée qui donne à voir le relief. */
export const CAMERA_3D = {
  pitch: 62,
  bearing: -25,
  pitchMax: 80,
} as const;

/** Vue à plat, quand l'utilisateur coupe la 3D. */
export const CAMERA_2D = { pitch: 0, bearing: 0 } as const;

/** Marge autour du tracé au cadrage initial, en pixels. */
export const MARGE_CADRAGE = 48;

/**
 * Exagération du relief. 1 = relief réel. Le POC ouvrait à 1,6 : en dessous,
 * un trail de moyenne montagne paraît plat sur un écran de téléphone.
 */
export const EXAGERATION = { min: 1, max: 3, pas: 0.1, defaut: 1.6 } as const;

/** Durée des transitions de caméra, annulée par `prefers-reduced-motion`. */
export const DUREE_TRANSITION_MS = 800;


/** Identifiants de sources et de couches, partagés avec les tests. */
export const IDS = {
  fond: 'fond',
  satellite: 'satellite',
  relief: 'relief',
  trace: 'trace',
  coucheFond: 'couche-fond',
  coucheSatellite: 'couche-satellite',
  coucheHalo: 'couche-trace-halo',
  coucheTrace: 'couche-trace',
} as const;

/** Projette les points du tracé en coordonnées 2D pour MapLibre. */
export function coordonnees2d(points: readonly PointTrace[]): [number, number][] {
  return points.map(([lon, lat]) => [lon, lat]);
}

/** Rectangle englobant du tracé : [[ouest, sud], [est, nord]]. */
export function emprise(
  points: readonly PointTrace[],
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let ouest = Infinity;
  let est = -Infinity;
  let sud = Infinity;
  let nord = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < ouest) ouest = lon;
    if (lon > est) est = lon;
    if (lat < sud) sud = lat;
    if (lat > nord) nord = lat;
  }
  return [
    [ouest, sud],
    [est, nord],
  ];
}

/**
 * Index du point le plus proche d'une abscisse curviligne, par dichotomie.
 *
 * `distances` est croissante (c'est la distance cumulée du relevé). Sert à
 * placer le repère de la carte depuis le curseur du profil — le bus
 * `az-parcours-curseur` de la story 11.4 transporte un `sM`, pas un index.
 */
export function indexDepuisDistance(
  distances: readonly number[],
  sM: number,
): number {
  if (distances.length === 0) return 0;
  let bas = 0;
  let haut = distances.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if ((distances[milieu] ?? 0) < sM) bas = milieu + 1;
    else haut = milieu;
  }
  // Le point précédent peut être plus proche que celui trouvé.
  const precedent = bas > 0 ? bas - 1 : 0;
  const ecartBas = Math.abs((distances[precedent] ?? 0) - sM);
  const ecartHaut = Math.abs((distances[bas] ?? 0) - sM);
  return ecartBas <= ecartHaut ? precedent : bas;
}

/** Couleurs du tracé, résolues depuis les tokens au moment du rendu. */
export interface CouleursTrace {
  trace: string;
  halo: string;
  cielHaut: string;
  cielHorizon: string;
}

/**
 * Spécification de style MapLibre (version 8).
 *
 * Volontairement typée `Record<string, unknown>` : le type `StyleSpecification`
 * vit dans maplibre-gl, et ce module ne doit pas l'importer, sous peine de
 * tirer le moteur dans le chemin critique.
 */
export function specificationStyle(
  points: readonly PointTrace[],
  couleurs: CouleursTrace,
  fond: SourceTuiles = FOND_PAR_DEFAUT,
  /**
   * Fond satellite (clé ArcGIS requise), posé au-dessus du topographique et
   * visible ou non selon `satelliteVisible`. MapLibre ne télécharge pas les
   * tuiles d'une couche masquée : un visiteur qui reste en topo ne contacte
   * jamais Esri.
   */
  satellite: SourceTuiles | null = null,
  satelliteVisible = false,
): Record<string, unknown> {
  return {
    version: 8,
    sources: {
      [IDS.fond]: {
        type: 'raster',
        tileSize: fond.tailleTuile,
        maxzoom: fond.zoomMax,
        tiles: [...fond.tuiles],
        attribution: fond.attribution,
      },
      ...(satellite === null
        ? {}
        : {
            [IDS.satellite]: {
              type: 'raster',
              tileSize: satellite.tailleTuile,
              maxzoom: satellite.zoomMax,
              tiles: [...satellite.tuiles],
              attribution: satellite.attribution,
            },
          }),
      [IDS.relief]: {
        type: 'raster-dem',
        tileSize: RELIEF_TERRARIUM.tailleTuile,
        maxzoom: RELIEF_TERRARIUM.zoomMax,
        encoding: 'terrarium',
        tiles: [...RELIEF_TERRARIUM.tuiles],
        attribution: RELIEF_TERRARIUM.attribution,
      },
      [IDS.trace]: {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coordonnees2d(points) },
        },
      },
    },
    layers: [
      { id: IDS.coucheFond, type: 'raster', source: IDS.fond },
      ...(satellite === null
        ? []
        : [
            {
              id: IDS.coucheSatellite,
              type: 'raster',
              source: IDS.satellite,
              layout: { visibility: satelliteVisible ? 'visible' : 'none' },
            },
          ]),
      {
        id: IDS.coucheHalo,
        type: 'line',
        source: IDS.trace,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Le halo détache le tracé d'un fond topographique déjà très chargé
        // en courbes de niveau : sans lui, la trace s'y perd.
        paint: { 'line-color': couleurs.halo, 'line-opacity': 0.55, 'line-width': 8 },
      },
      {
        id: IDS.coucheTrace,
        type: 'line',
        source: IDS.trace,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': couleurs.trace, 'line-width': 4 },
      },
    ],
    sky: {
      'sky-color': couleurs.cielHaut,
      'horizon-color': couleurs.cielHorizon,
      'fog-color': couleurs.cielHorizon,
      'fog-ground-blend': 0.6,
    },
  };
}

/**
 * Le navigateur sait-il rendre la carte ?
 *
 * UX-DR-30 : sans WebGL, on affiche un message, jamais un cadre vide. Le test
 * crée un contexte réel plutôt que de renifler l'agent utilisateur.
 */
export function webglDisponible(fabriqueCanvas: () => HTMLCanvasElement): boolean {
  try {
    const canvas = fabriqueCanvas();
    const contexte =
      canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return contexte !== null;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Tracé servi à la carte                                              */
/* ------------------------------------------------------------------ */

/** Tracé d'une épreuve, prêt pour la carte et pour le curseur partagé. */
export interface TraceCarte {
  points: readonly PointTrace[];
  /** Abscisse curviligne de chaque point, dans le référentiel de l'épreuve. */
  distancesM: readonly number[];
}

/**
 * Tolérance de simplification du tracé affiché, en degrés.
 *
 * 2,5e-5° vaut environ 2,8 m sous cette latitude. Mesuré sur le relevé réel :
 * 3 222 points tombent à 993, soit moins d'un tiers. Au zoom le plus proche
 * utilisé (z16, ~1,8 m/px), l'écart maximal introduit vaut environ 1,5 pixel
 * — invisible. Les valeurs voisines mesurées : 1,1 m garde 55 % des points
 * (allègement dérisoire), 5,6 m n'en garde que 19 % mais écarte la trace de
 * 3 pixels, ce qui commence à se voir sur un virage serré.
 *
 * La simplification est PUREMENT d'affichage : les chiffres publiés
 * (distance, D+, profil) restent ceux du relevé complet, calculés au build
 * par le pipeline de la story 11.1.
 */
export const TOLERANCE_TRACE_DEG = 2.5e-5;

/** Distance perpendiculaire d'un point au segment [a, b], en degrés. */
function distanceAuSegment(
  point: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const [px, py] = point;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas-Peucker en plan (lon, lat), itératif.
 *
 * Itératif et non récursif : 3 222 points suffisent à faire déborder la pile
 * sur un tracé dégénéré, et le pipeline tourne aussi en CI.
 */
export function simplifierTrace(
  points: readonly PointTrace[],
  toleranceDeg: number = TOLERANCE_TRACE_DEG,
): number[] {
  if (points.length <= 2) return points.map((_, index) => index);
  const garde = new Array<boolean>(points.length).fill(false);
  garde[0] = true;
  garde[points.length - 1] = true;
  const pile: [number, number][] = [[0, points.length - 1]];

  while (pile.length > 0) {
    const segment = pile.pop();
    if (segment === undefined) break;
    const [debut, fin] = segment;
    const a = points[debut];
    const b = points[fin];
    if (a === undefined || b === undefined) continue;
    let pire = -1;
    let ecartMax = toleranceDeg;
    for (let i = debut + 1; i < fin; i++) {
      const point = points[i];
      if (point === undefined) continue;
      const ecart = distanceAuSegment([point[0], point[1]], [a[0], a[1]], [b[0], b[1]]);
      if (ecart > ecartMax) {
        ecartMax = ecart;
        pire = i;
      }
    }
    if (pire !== -1) {
      garde[pire] = true;
      pile.push([debut, pire], [pire, fin]);
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < garde.length; i++) {
    if (garde[i] === true) indices.push(i);
  }
  return indices;
}

/**
 * Extrait le tracé d'une épreuve depuis le document, simplifié pour l'écran.
 *
 * Rend `null` pour une épreuve absente du document — jamais un tracé vide
 * qui donnerait une carte sans ligne (même règle que le profil : aucun
 * chiffre, aucune géométrie inventée).
 */
export function traceCarte(
  doc: {
    coords: readonly (readonly number[])[];
    profile: readonly (readonly number[])[];
    epreuves: Readonly<Record<string, { tranches: readonly { deIndex: number; aIndex: number }[] }>>;
  } | null,
  slug: string,
  toleranceDeg: number = TOLERANCE_TRACE_DEG,
): TraceCarte | null {
  // hasOwn : le slug peut venir d'une URL publique, et `epreuves['constructor']`
  // rendrait la fonction héritée de Object plutôt que `undefined`.
  if (doc == null || !Object.hasOwn(doc.epreuves, slug)) return null;
  const epreuve = doc.epreuves[slug];
  if (epreuve === undefined) return null;

  const points: PointTrace[] = [];
  const distances: number[] = [];
  let cumul = 0;
  let precedenteBase: number | null = null;

  for (const tranche of epreuve.tranches) {
    for (let i = tranche.deIndex; i <= tranche.aIndex; i++) {
      const coord = doc.coords[i];
      const mesure = doc.profile[i];
      if (coord === undefined || mesure === undefined) continue;
      const positionBase = mesure[0] ?? 0;
      // Les tranches se recollent : l'abscisse de l'épreuve est continue même
      // quand le tracé saute d'une portion à l'autre.
      cumul += precedenteBase === null ? 0 : Math.max(0, positionBase - precedenteBase);
      precedenteBase = positionBase;
      points.push([coord[0] ?? 0, coord[1] ?? 0, coord[2] ?? 0]);
      distances.push(cumul);
    }
    precedenteBase = null;
  }

  if (points.length < 2) return null;

  const gardes = simplifierTrace(points, toleranceDeg);
  return {
    points: gardes.map((index) => points[index] as PointTrace),
    distancesM: gardes.map((index) => distances[index] ?? 0),
  };
}
