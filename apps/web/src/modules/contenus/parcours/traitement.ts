// Story 11.1 — traitement du relevé GPX : porte de qualité (FR-28b) puis
// chaîne pure « rejet vitesse ⇒ fusion ⇒ lissage ⇒ distances ⇒ D+/D− ».
//
// Ordonnancement imposé (spec) : la PORTE s’évalue sur les points BRUTS,
// avant tout traitement — sinon la fusion masquerait les arrets GPS qu’elle
// doit précisément détecter. Tout ce qui suit est fonction pure et
// déterministe (même entrée ⇒ même sortie, arrondis stables de geo.ts).

import { arrondi, haversineM } from './geo';
import type { PointGpx } from './gpx';

/* ------------------------------------------------------------------ */
/* Constantes du pipeline — LA porte de qualité et le seuil D+.        */
/* Chaque constante est nommée, documentée, et citée dans             */
/* parcours.json > constantes (auditabilité de chaque publication).   */
/* ------------------------------------------------------------------ */

/**
 * Seuil d’hystérésis du dénivelé positif (mètres) — CONSTANTE UNIQUE du D+
 * publié (carte, profil et contenu éditorial lisent le même chiffre).
 *
 * Ancre remise à jour seulement quand |Δaltitude depuis l’ancre| ≥ seuil ;
 * Δ ≥ seuil ⇒ D+ += Δ ; Δ ≤ −seuil ⇒ D− += −Δ (symétrique).
 *
 * Effet mesuré sur `docs/GPX/activity_24920331005.gpx` (épreuve longue,
 * 26 933 points bruts, 3 222 gardés) : D+ brut 1280 m → 1186 m au seuil,
 * soit −7,3 % de bruit barométrique éliminé ; D− brut 1282 m → 1187 m.
 */
export const SEUIL_DPLUS_M = 5;

/**
 * Fusion des points quasi immobiles (mètres) : un point n’est gardé que s’il
 * est à ≥ 8 m du dernier gardé (arrets GPS, feux, pauses). Le dernier point
 * du relevé est toujours gardé (fermeture de la trace). Mesuré : 26 933
 * points bruts → 3 222 gardés sur le relevé longue.
 */
export const SEUIL_FUSION_M = 8;

/** Fenêtre (nombre de points) du lissage centré de l’altitude barométrique. */
export const FENETRE_LISSAGE = 7;

/** Vitesse au sol au-delà de laquelle un point est déclaré implausible (m/s) — 45 km/h. */
export const VITESSE_IMPLAUSIBLE_M_S = 12.5;

/** Pas médian maximal entre points bruts (secondes) : un relevé « intelligent » (3 s, clairsemé) est refusé. */
export const PAS_MEDIAN_MAX_S = 2;

/** Un segment est « long » au-delà de ce pas de temps (s) — perte de réception. */
export const SEUIL_SEGMENT_LONG_S = 30;

/** Part maximale de la distance totale portée par des segments longs (5 %). */
export const PART_MAX_DISTANCE_SEGMENTS_LONGS = 0.05;

/** Part maximale de points à vitesse implausible (1 %). */
export const PART_MAX_POINTS_VITESSE_IMPLAUSIBLE = 0.01;

/** Constantes telles qu’elles sont publiées dans parcours.json (audit). */
export const CONSTANTES_PIPELINE = {
  seuilDplusM: SEUIL_DPLUS_M,
  seuilFusionM: SEUIL_FUSION_M,
  fenetreLissage: FENETRE_LISSAGE,
  vitesseImplausibleMS: VITESSE_IMPLAUSIBLE_M_S,
  pasMedianMaxS: PAS_MEDIAN_MAX_S,
  seuilSegmentLongS: SEUIL_SEGMENT_LONG_S,
  partMaxDistanceSegmentsLongs: PART_MAX_DISTANCE_SEGMENTS_LONGS,
  partMaxPointsVitesseImplausible: PART_MAX_POINTS_VITESSE_IMPLAUSIBLE,
} as const;

/* ------------------------------------------------------------------ */
/* Porte de qualité (FR-28b) — sur points BRUTS                        */
/* ------------------------------------------------------------------ */

/** Mesures de la porte, publiées dans parcours.json > mesures.porte. */
export interface RapportQualite {
  pasMedianS: number;
  partDistanceSegmentsLongs: number;
  pointsVitesseImplausible: number;
  /** Défauts NOMMÉS avec leur chiffre mesuré (jamais un échec muet). */
  defauts: readonly string[];
  accepte: boolean;
}

function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((a, b) => a - b);
  const n = triees.length;
  if (n === 0) {
    return 0;
  }
  return n % 2 === 1 ? (triees[(n - 1) / 2] as number) : ((triees[n / 2 - 1] as number) + (triees[n / 2] as number)) / 2;
}

/**
 * Évalue la qualité du relevé sur les points bruts. Chaque seuil franchi
 * produit un défaut qui NOMME la mesure et son chiffre — le refus est
 * toujours expliqué, jamais muet (FR-28b).
 */
export function evaluerQualiteReleve(points: readonly PointGpx[]): RapportQualite {
  let pas: number[] = [];
  let distanceTotaleM = 0;
  let distanceSegmentsLongsM = 0;
  let pointsVitesseImplausible = 0;

  for (let i = 1; i < points.length; i++) {
    const precedent = points[i - 1];
    const courant = points[i];
    if (precedent === undefined || courant === undefined) {
      continue;
    }
    const dM = haversineM(precedent.lat, precedent.lon, courant.lat, courant.lon);
    const dtS = (courant.tempsMs - precedent.tempsMs) / 1000;
    distanceTotaleM += dM;
    pas.push(dtS);
    if (dtS > SEUIL_SEGMENT_LONG_S) {
      distanceSegmentsLongsM += dM;
    }
    // dt = 0 avec distance > 0 : horodatage figé ⇒ vitesse infinie ⇒ point
    // compté implausible (distance nulle ⇒ immobile, non compté).
    if (dM / Math.max(dtS, Number.EPSILON) > VITESSE_IMPLAUSIBLE_M_S && dM > 0) {
      pointsVitesseImplausible++;
    }
  }

  const pasMedianS = mediane(pas);
  const partLongs = distanceTotaleM > 0 ? distanceSegmentsLongsM / distanceTotaleM : 1;
  const partImpl =
    points.length > 1 ? pointsVitesseImplausible / (points.length - 1) : 1;

  const pourcent = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`;
  const defauts: string[] = [];
  if (pasMedianS > PAS_MEDIAN_MAX_S) {
    defauts.push(
      `pas médian ${pasMedianS.toLocaleString('fr-FR')} s > ${PAS_MEDIAN_MAX_S} s (relevé trop clairsemé — enregistrer à 1 s)`,
    );
  }
  if (partLongs > PART_MAX_DISTANCE_SEGMENTS_LONGS) {
    defauts.push(
      `${pourcent(partLongs)} de la distance sur des segments > ${SEUIL_SEGMENT_LONG_S} s (max ${pourcent(PART_MAX_DISTANCE_SEGMENTS_LONGS)} — pertes de réception)`,
    );
  }
  if (partImpl > PART_MAX_POINTS_VITESSE_IMPLAUSIBLE) {
    defauts.push(
      `${pointsVitesseImplausible} points à vitesse > ${VITESSE_IMPLAUSIBLE_M_S} m/s, soit ${pourcent(partImpl)} (max ${pourcent(PART_MAX_POINTS_VITESSE_IMPLAUSIBLE)})`,
    );
  }

  return {
    pasMedianS: arrondi(pasMedianS, 1),
    partDistanceSegmentsLongs: arrondi(partLongs, 4),
    pointsVitesseImplausible,
    defauts,
    accepte: defauts.length === 0,
  };
}

/* ------------------------------------------------------------------ */
/* Chaîne de traitement — fonctions pures, ordre imposé par la spec    */
/* ------------------------------------------------------------------ */

/** 1. Rejet des points à vitesse implausible (résiduels : la porte a déjà refusé les relevés massivement touchés). */
export function rejeterVitesseImplausible(points: readonly PointGpx[]): PointGpx[] {
  const gardes: PointGpx[] = [];
  for (const p of points) {
    const dernier = gardes[gardes.length - 1];
    if (dernier === undefined) {
      gardes.push(p);
      continue;
    }
    const dM = haversineM(dernier.lat, dernier.lon, p.lat, p.lon);
    const dtS = Math.max((p.tempsMs - dernier.tempsMs) / 1000, Number.EPSILON);
    if (dM > 0 && dM / dtS > VITESSE_IMPLAUSIBLE_M_S) {
      continue; // point téléporté : jeté, nommé par la porte au préalable
    }
    gardes.push(p);
  }
  return gardes;
}

/** Un point gardé après fusion : position + altitude LISSÉE + distance cumulée sur la base. */
export interface PointTraite {
  lon: number;
  lat: number;
  /** Altitude lissée (fenêtre centrée) — arrondie à 0,1 m. */
  altitudeM: number;
  /** Distance cumulée depuis le départ de la base (mètres, brute de calcul). */
  distanceM: number;
  /** Index du point brut d’origine (traçabilité). */
  indexBrut: number;
}

/** 2. Fusion des points quasi immobiles : garde le premier point, puis tout point à ≥ seuil du dernier gardé, et toujours le dernier. */
export function fusionnerPoints(points: readonly PointGpx[]): { lon: number; lat: number; ele: number; indexBrut: number }[] {
  if (points.length === 0) {
    return [];
  }
  const gardes: { lon: number; lat: number; ele: number; indexBrut: number }[] = [];
  const pousse = (p: PointGpx, indexBrut: number) => {
    gardes.push({ lon: p.lon, lat: p.lat, ele: p.ele, indexBrut });
  };
  const premier = points[0];
  if (premier !== undefined) {
    pousse(premier, 0);
  }
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dernier = gardes[gardes.length - 1];
    if (p === undefined || dernier === undefined) {
      continue;
    }
    if (haversineM(dernier.lat, dernier.lon, p.lat, p.lon) >= SEUIL_FUSION_M) {
      pousse(p, i);
    }
  }
  // Fermeture : le dernier point du relevé est TOUJOURS gardé (boucle fermée).
  const dernierBrut = points[points.length - 1];
  const dernierGarde = gardes[gardes.length - 1];
  if (dernierBrut !== undefined && dernierGarde !== undefined && dernierBrut !== points[dernierGarde.indexBrut]) {
    pousse(dernierBrut, points.length - 1);
  }
  return gardes;
}

/** 3. Lissage centré de l’altitude (fenêtre FENETRE_LISSAGE, bords raccourcis — jamais élargie). */
export function lisserAltitudes(altitudes: readonly number[]): number[] {
  const demi = (FENETRE_LISSAGE - 1) / 2;
  return altitudes.map((_, i) => {
    const debut = Math.max(0, i - demi);
    const fin = Math.min(altitudes.length, i + demi + 1);
    let somme = 0;
    for (let j = debut; j < fin; j++) {
      somme += altitudes[j] ?? 0;
    }
    return somme / (fin - debut);
  });
}

/** Dénivelés positif/négatif — brut (tout Δ compté) et à seuil d’hystérésis (publié). */
export interface Deniveles {
  dPlusBrutM: number;
  dMoinsBrutM: number;
  dPlusSeuilM: number;
  dMoinsSeuilM: number;
}

/**
 * 4. D+/D− sur une séquence d’altitudes. Brut : somme des Δ positifs/négatifs.
 * Seuil (publié) : hystérésis SEUIL_DPLUS_M — l’ancre ne bouge que sur
 * |Δ| ≥ seuil ; chaque franchissement cumule TOUT le Δ depuis l’ancre
 * (pas seulement la part au-delà du seuil).
 */
export function calculerDeniveles(altitudes: readonly number[]): Deniveles {
  let dPlusBrutM = 0;
  let dMoinsBrutM = 0;
  let dPlusSeuilM = 0;
  let dMoinsSeuilM = 0;
  let ancre = altitudes[0] ?? 0;
  for (let i = 1; i < altitudes.length; i++) {
    const precedent = altitudes[i - 1] ?? 0;
    const courant = altitudes[i] ?? 0;
    const dzBrut = courant - precedent;
    if (dzBrut > 0) {
      dPlusBrutM += dzBrut;
    } else {
      dMoinsBrutM -= dzBrut;
    }
    const dzAncre = courant - ancre;
    if (dzAncre >= SEUIL_DPLUS_M) {
      dPlusSeuilM += dzAncre;
      ancre = courant;
    } else if (dzAncre <= -SEUIL_DPLUS_M) {
      dMoinsSeuilM += -dzAncre;
      ancre = courant;
    }
  }
  return { dPlusBrutM, dMoinsBrutM, dPlusSeuilM, dMoinsSeuilM };
}

/* ------------------------------------------------------------------ */
/* Préparation de la géométrie de base (chaîne complète)               */
/* ------------------------------------------------------------------ */

/** Géométrie de base : UNE trace, gardée une fois, partagée par les épreuves. */
export interface GeometrieBase {
  points: readonly PointTraite[];
  /** Altitudes lissées seules (pratique pour les vues d’épreuve). */
  /** Altitudes lissées NON arrondies : les D+/D− s’y calculent (arrondir à 0,1 m AVANT l’hystérésis ferait basculer des franchissements de seuil — 1186 → 1176 m mesuré sur le relevé longue). */
  altitudesLissees: readonly number[];
  /** Altitudes lissées arrondies : les valeurs PUBLIÉES dans coords/profile. */
  altitudes: readonly number[];
  /** Distances cumulées seules (référentiel de la base). */
  distances: readonly number[];
  distanceTotaleM: number;
  deniveles: Deniveles;
  altitudeMinM: number;
  altitudeMaxM: number;
}

/**
 * Applique la chaîne complète aux points bruts D’UN RELEVÉ DÉJÀ ACCEPTÉ par
 * la porte : rejet vitesse ⇒ fusion ⇒ lissage ⇒ distances ⇒ D+/D−.
 * (La porte doit être évaluée séparément AVANT, sur les points bruts.)
 */
export function preparerGeometrie(pointsBruts: readonly PointGpx[]): GeometrieBase {
  const sansVitesse = rejeterVitesseImplausible(pointsBruts);
  const fusionnes = fusionnerPoints(sansVitesse);
  const lissees = lisserAltitudes(fusionnes.map((p) => p.ele));

  const distances: number[] = [0];
  for (let i = 1; i < fusionnes.length; i++) {
    const precedent = fusionnes[i - 1];
    const courant = fusionnes[i];
    if (precedent === undefined || courant === undefined) {
      continue;
    }
    distances.push(
      (distances[distances.length - 1] ?? 0) +
        haversineM(precedent.lat, precedent.lon, courant.lat, courant.lon),
    );
  }

  const points: PointTraite[] = fusionnes.map((p, i) => ({
    lon: p.lon,
    lat: p.lat,
    altitudeM: arrondi(lissees[i] ?? 0, 1),
    distanceM: distances[i] ?? 0,
    indexBrut: p.indexBrut,
  }));

  return {
    points,
    altitudesLissees: lissees,
    altitudes: points.map((p) => p.altitudeM),
    distances,
    distanceTotaleM: distances[distances.length - 1] ?? 0,
    deniveles: calculerDeniveles(lissees),
    altitudeMinM: Math.min(...points.map((p) => p.altitudeM)),
    altitudeMaxM: Math.max(...points.map((p) => p.altitudeM)),
  };
}
