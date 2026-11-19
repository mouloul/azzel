// Story 11.1 — construction du document parcours.json (ParcoursDoc) à partir
// d’une config déclarative versionnée + d’une géométrie de base préparée.
//
// MODÈLE (décision d’épopée) : UNE géométrie de base (le relevé, gardé une
// seule fois dans coords/profile), des épreuves = COMPOSITIONS ORDONNÉES de
// portions de cette base (bornes = identifiants de points de passage).
// Exception : une épreuve dont le tracé s’écarte de la base (la petite boucle
// coupe par un raccourci absent du relevé de la longue) déclare son PROPRE
// relevé (`source`) ; sa géométrie est appendue après la base dans
// coords/profile et l’épreuve la parcourt en une seule tranche — les
// lecteurs (carte, profil, repères) ne voient que des tranches. L’
// abscisse curviligne `s` (FR-38) est calculée PAR ÉPREUVE, jamais
// globalement : un point de passage partagé porte un kilométrage différent
// dans chaque épreuve qui le traverse (UX-DR-31).
//
// Ids réservés : `depart` (début de la base) et `arrivee` (fin) sont TOUJOURS
// déduits de la géométrie — la config ne peut pas les déclarer.
//
// Aucune donnée inventée : les services (FR-39) non connus valent `null`,
// l’heure de départ et la barrière horaire n’existent pas dans ce document.

import { arrondi } from './geo';
import type { ReleveGpx } from './gpx';
import {
  CONSTANTES_PIPELINE,
  type GeometrieBase,
  type RapportQualite,
  calculerDeniveles,
} from './traitement';

/* ------------------------------------------------------------------ */
/* Config déclarative (parcours.config.json)                           */
/* ------------------------------------------------------------------ */

/** Point de passage déclaré par l’organisation, accroché à la base par sa position en mètres. */
export interface ConfigPointDePassage {
  id: string;
  nom: string;
  /** Position sur la géométrie de base (mètres depuis le départ du relevé). */
  positionBaseM: number;
  /** Services en toutes lettres (FR-39). Absent/null = inconnu — jamais inventé. */
  services?: readonly string[] | null;
}

/** Une portion empruntée : bornes = ids de points de passage (`depart`/`arrivee` inclus), dans le sens du relevé. */
export interface ConfigPortion {
  de: string;
  a: string;
}

/**
 * Une épreuve (FR-38 : `s` propre à l’épreuve) : SOIT une composition
 * ordonnée de portions de la base, SOIT son propre relevé parcouru en entier.
 */
export interface ConfigEpreuve {
  /** Slug de l’épreuve tel qu’il vit dans la base vitrine (ex. « longue »). */
  slug: string;
  portions?: readonly ConfigPortion[];
  /** Relevé propre (chemin depuis la racine du dépôt), exclusif de `portions`. */
  source?: { gpx: string };
  /**
   * Points de passage posés sur le relevé PROPRE de l'épreuve (seulement
   * avec `source`) : leur position se compte depuis le départ de ce relevé.
   */
  pointsDePassage?: readonly ConfigPointRelevePropre[];
  /**
   * Début emprunté à la base (seulement avec `source`) : l'épreuve part du
   * départ de la base et la suit jusqu'à `aM` mètres, où son relevé propre
   * prend le relais. Pour un relevé dont l'enregistrement a commencé en
   * retard — la montre de la Boucle Moyenne s'est connectée 286 m après le
   * stade, sur le tracé commun aux deux épreuves. Le départ de l'épreuve est
   * alors celui de la base, plus la borne de début du relevé propre.
   */
  prefixeBase?: { aM: number };
}

/** Point de passage d'une épreuve à relevé propre (ex. ravitaillement de la moyenne). */
export interface ConfigPointRelevePropre {
  id: string;
  nom: string;
  /** Position sur le relevé propre (mètres depuis son départ). */
  positionM: number;
  /** Services en toutes lettres (FR-39). Absent/null = inconnu — jamais inventé. */
  services?: readonly string[] | null;
}

/** Schéma de parcours.config.json. */
export interface ParcoursConfig {
  source: { gpx: string };
  pointsDePassage: readonly ConfigPointDePassage[];
  epreuves: readonly ConfigEpreuve[];
}

/** Erreur nommée : la config (structure) ou ses bornes (vs géométrie) sont invalides. */
export class ConfigInvalideError extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = 'ConfigInvalideError';
  }
}

/** Ids réservés, déduits de la géométrie — jamais déclarables. */
export const IDS_RESERVES = { depart: 'Départ', arrivee: 'Arrivée' } as const;

/** Ids du départ et de l’arrivée d’une épreuve sur son propre relevé (réservés eux aussi). */
export function idsBornesEpreuve(slug: string): { depart: string; arrivee: string } {
  return { depart: `${slug}-depart`, arrivee: `${slug}-arrivee` };
}

function estTexte(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validation STRUCTURELLE de la config (indépendante de la géométrie). */
export function validerConfig(config: unknown): ParcoursConfig {
  if (typeof config !== 'object' || config === null) {
    throw new ConfigInvalideError('la config doit être un objet JSON');
  }
  const c = config as Record<string, unknown>;
  const source = c.source;
  if (typeof source !== 'object' || source === null || !estTexte((source as Record<string, unknown>).gpx)) {
    throw new ConfigInvalideError('config.source.gpx manquant (chemin du relevé GPX)');
  }
  if (!Array.isArray(c.pointsDePassage) || !Array.isArray(c.epreuves) || c.epreuves.length === 0) {
    throw new ConfigInvalideError('config.epreuves doit être un tableau non vide (pointsDePassage peut être vide)');
  }

  const ids = new Set<string>();
  for (const p of c.pointsDePassage) {
    if (typeof p !== 'object' || p === null) {
      throw new ConfigInvalideError('point de passage : objet attendu');
    }
    const point = p as Record<string, unknown>;
    if (!estTexte(point.id) || !estTexte(point.nom)) {
      throw new ConfigInvalideError('point de passage : id et nom (texte) requis');
    }
    if (point.id === 'depart' || point.id === 'arrivee') {
      throw new ConfigInvalideError(
        `l’id « ${point.id} » est réservé (déduit de la géométrie) — renomme le point`,
      );
    }
    if (ids.has(point.id)) {
      throw new ConfigInvalideError(`id de point de passage dupliqué : « ${point.id} »`);
    }
    ids.add(point.id);
    if (typeof point.positionBaseM !== 'number' || !Number.isFinite(point.positionBaseM)) {
      throw new ConfigInvalideError(`point « ${point.id} » : positionBaseM (nombre de mètres) requis`);
    }
    if (point.services !== undefined && point.services !== null && !Array.isArray(point.services)) {
      throw new ConfigInvalideError(`point « ${point.id} » : services doit être un tableau ou null`);
    }
  }

  const slugs = new Set<string>();
  for (const e of c.epreuves) {
    if (typeof e !== 'object' || e === null) {
      throw new ConfigInvalideError('épreuve : objet attendu');
    }
    const epreuve = e as Record<string, unknown>;
    if (!estTexte(epreuve.slug)) {
      throw new ConfigInvalideError('épreuve : slug (texte) requis');
    }
    if (slugs.has(epreuve.slug)) {
      throw new ConfigInvalideError(`slug d’épreuve dupliqué : « ${epreuve.slug} »`);
    }
    slugs.add(epreuve.slug);
    if (epreuve.source !== undefined) {
      if (epreuve.portions !== undefined) {
        throw new ConfigInvalideError(
          `épreuve « ${epreuve.slug} » : soit portions, soit source (relevé propre) — pas les deux`,
        );
      }
      const sourceEpreuve = epreuve.source;
      if (
        typeof sourceEpreuve !== 'object' ||
        sourceEpreuve === null ||
        !estTexte((sourceEpreuve as Record<string, unknown>).gpx)
      ) {
        throw new ConfigInvalideError(`épreuve « ${epreuve.slug} » : source.gpx (chemin du relevé) requis`);
      }
      const reserves = idsBornesEpreuve(epreuve.slug);
      for (const id of [reserves.depart, reserves.arrivee]) {
        if (ids.has(id)) {
          throw new ConfigInvalideError(
            `l’id « ${id} » est réservé (borne du relevé de l’épreuve « ${epreuve.slug} ») — renomme le point`,
          );
        }
      }
      if (epreuve.prefixeBase !== undefined) {
        const prefixe = epreuve.prefixeBase as Record<string, unknown> | null;
        if (
          typeof prefixe !== 'object' ||
          prefixe === null ||
          typeof prefixe.aM !== 'number' ||
          !Number.isFinite(prefixe.aM) ||
          prefixe.aM <= 0
        ) {
          throw new ConfigInvalideError(
            `épreuve « ${epreuve.slug} » : prefixeBase.aM (mètres sur la base, > 0) requis`,
          );
        }
      }
      if (epreuve.pointsDePassage !== undefined) {
        if (!Array.isArray(epreuve.pointsDePassage)) {
          throw new ConfigInvalideError(`épreuve « ${epreuve.slug} » : pointsDePassage doit être un tableau`);
        }
        for (const p of epreuve.pointsDePassage) {
          const point = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
          if (!estTexte(point.id) || !estTexte(point.nom)) {
            throw new ConfigInvalideError(`épreuve « ${epreuve.slug} » : point de passage sans id ou nom`);
          }
          if (point.id === reserves.depart || point.id === reserves.arrivee || point.id === 'depart' || point.id === 'arrivee') {
            throw new ConfigInvalideError(`l’id « ${point.id} » est réservé — renomme le point`);
          }
          if (ids.has(point.id)) {
            throw new ConfigInvalideError(`id de point de passage dupliqué : « ${point.id} »`);
          }
          ids.add(point.id);
          if (typeof point.positionM !== 'number' || !Number.isFinite(point.positionM)) {
            throw new ConfigInvalideError(`point « ${point.id} » : positionM (nombre de mètres) requis`);
          }
          if (point.services !== undefined && point.services !== null && !Array.isArray(point.services)) {
            throw new ConfigInvalideError(`point « ${point.id} » : services doit être un tableau ou null`);
          }
        }
      }
      continue;
    }
    if (epreuve.prefixeBase !== undefined) {
      throw new ConfigInvalideError(
        `épreuve « ${epreuve.slug} » : prefixeBase réservé aux épreuves à relevé propre (source)`,
      );
    }
    if (epreuve.pointsDePassage !== undefined) {
      throw new ConfigInvalideError(
        `épreuve « ${epreuve.slug} » : pointsDePassage propres réservés aux épreuves à relevé propre (source)`,
      );
    }
    if (!Array.isArray(epreuve.portions) || epreuve.portions.length === 0) {
      throw new ConfigInvalideError(
        `épreuve « ${epreuve.slug} » : portions (tableau non vide) ou source (relevé propre) requis`,
      );
    }
    for (const portion of epreuve.portions) {
      if (
        typeof portion !== 'object' ||
        portion === null ||
        !estTexte((portion as Record<string, unknown>).de) ||
        !estTexte((portion as Record<string, unknown>).a)
      ) {
        throw new ConfigInvalideError(`épreuve « ${epreuve.slug} » : chaque portion exige de/a (ids de points)`);
      }
    }
  }

  return {
    source: { gpx: (source as Record<string, unknown>).gpx as string },
    pointsDePassage: c.pointsDePassage.map((p) => p as ConfigPointDePassage),
    epreuves: c.epreuves.map((e) => e as ConfigEpreuve),
  };
}

/* ------------------------------------------------------------------ */
/* Document publié (parcours.json)                                     */
/* ------------------------------------------------------------------ */

/** Point de passage sur la GÉOMÉTRIE DE BASE (identité partagée avec les CHECKPOINT épopée 4). */
export interface PointDePassageBaseDoc {
  id: string;
  nom: string;
  /** Position arrondie au point gardé le plus proche (mètres, référentiel base). */
  positionBaseM: number;
  /** Index du point gardé dans coords/profile. */
  indexBase: number;
  lon: number;
  lat: number;
  altitudeM: number;
  /** FR-39 : services en toutes lettres, `null` = inconnu (jamais inventé). */
  services: readonly string[] | null;
}

/** Point de passage VU PAR UNE ÉPREUVE (kilométrage dans SON référentiel — FR-38). */
export interface PointDePassageEpreuveDoc {
  id: string;
  /** Abscisse curviligne dans le référentiel de cette épreuve (mètres). */
  sM: number;
  /** Kilométrage dans le référentiel de cette épreuve (km). */
  kilometre: number;
  altitudeM: number;
  /** D+ (hystérésis, même constante que le global) du segment amont DANS cette épreuve. */
  dplusSegmentAmontM: number;
}

/** Provenance d’un relevé (base ou relevé propre d’une épreuve) — auditabilité. */
export interface SourceReleveDoc {
  fichier: string;
  nom: string;
  dateReleve: string | null;
  pointsBruts: number;
  pointsGardes: number;
}

/** Vue d’épreuve : tranches de base + mesures propres + points de passage au référentiel de l’épreuve. */
export interface EpreuveDoc {
  distanceM: number;
  /** D+ publié (hystérésis SEUIL_DPLUS_M) — même méthode que le global. */
  dplusM: number;
  dmoinsM: number;
  altitudeMinM: number;
  altitudeMaxM: number;
  /** Tranches [deIndex, aIndex] de la géométrie de base, dans l’ordre du parcours. */
  tranches: readonly { deIndex: number; aIndex: number }[];
  pointsDePassage: readonly PointDePassageEpreuveDoc[];
  /** Présent seulement pour une épreuve sur son propre relevé (sinon : `source` du document). */
  source?: SourceReleveDoc & {
    porte: {
      pasMedianS: number;
      partDistanceSegmentsLongs: number;
      pointsVitesseImplausible: number;
      accepte: boolean;
    };
  };
}

/** parcours.json — la trace gelée versionnée (une version = une publication). */
export interface ParcoursDoc {
  version: number;
  source: SourceReleveDoc;
  constantes: {
    seuilDplusM: number;
    seuilFusionM: number;
    fenetreLissage: number;
    vitesseImplausibleMS: number;
    pasMedianMaxS: number;
    seuilSegmentLongS: number;
    partMaxDistanceSegmentsLongs: number;
    partMaxPointsVitesseImplausible: number;
  };
  mesures: {
    distanceM: number;
    dplusBrutM: number;
    dmoinsBrutM: number;
    dplusM: number;
    dmoinsM: number;
    altitudeMinM: number;
    altitudeMaxM: number;
    porte: {
      pasMedianS: number;
      partDistanceSegmentsLongs: number;
      pointsVitesseImplausible: number;
      accepte: boolean;
    };
  };
  /**
   * Géométrie de base UNE fois : [lon, lat, altitude_lissée] ; les relevés
   * propres des épreuves suivent, dans l’ordre de la config.
   */
  coords: number[][];
  /**
   * Profil : [distance_m, altitude_lissée], même longueur que coords. Sur un
   * relevé appendu, la distance CONTINUE celle qui précède (abscisse
   * croissante) : seules les différences au sein d’une tranche ont un sens.
   */
  profile: number[][];
  pointsDePassage: readonly PointDePassageBaseDoc[];
  epreuves: Readonly<Record<string, EpreuveDoc>>;
}

/* ------------------------------------------------------------------ */
/* Construction                                                         */
/* ------------------------------------------------------------------ */

/** Relevé déjà accepté par la porte et préparé. */
export interface ReleveTraite {
  releve: ReleveGpx;
  geometrie: GeometrieBase;
  rapportQualite: RapportQualite;
}

export interface EntreeConstruction extends ReleveTraite {
  config: ParcoursConfig;
  /** Relevés propres, par slug, des épreuves déclarant une `source`. */
  relevesEpreuves?: Readonly<Record<string, ReleveTraite>>;
  version: number;
}

interface OccurrenceEpreuve {
  indexBase: number;
  sM: number;
  /** Altitude lissée NON arrondie : les D+ d’épreuve et de segment s’y calculent (même convention que le global). */
  altitudeLissee: number;
}

/** Index du point gardé le plus proche d’une position (mètres) sur la base. */
function indexLePlusProche(distances: readonly number[], cibleM: number): number {
  let meilleur = 0;
  let ecartMin = Infinity;
  for (let i = 0; i < distances.length; i++) {
    const ecart = Math.abs((distances[i] ?? 0) - cibleM);
    if (ecart < ecartMin) {
      ecartMin = ecart;
      meilleur = i;
    }
  }
  return meilleur;
}

/**
 * Construit parcours.json : géométrie + points de passage (base) + vues
 * d’épreuve (tranches, `s` par épreuve, kilométrages par référentiel, D+/D−
 * et altitude min/max par épreuve, D+ du segment amont par point).
 * Les erreurs de bornes vs géométrie sont nommées (ConfigInvalideError).
 */
export function construireParcoursDoc(entree: EntreeConstruction): ParcoursDoc {
  const { config, releve, geometrie, rapportQualite, version } = entree;
  const { distances, altitudesLissees, points } = geometrie;

  // --- Points de passage de base : réservés + déclarés, triés par position.
  const base: PointDePassageBaseDoc[] = [];
  const ajoute = (p: PointDePassageBaseDoc) => base.push(p);
  const premier = points[0];
  const dernier = points[points.length - 1];
  if (premier !== undefined && dernier !== undefined) {
    ajoute({
      id: 'depart',
      nom: IDS_RESERVES.depart,
      positionBaseM: arrondi(premier.distanceM, 1),
      indexBase: 0,
      lon: arrondi(premier.lon, 6),
      lat: arrondi(premier.lat, 6),
      altitudeM: premier.altitudeM,
      services: null,
    });
    ajoute({
      id: 'arrivee',
      nom: IDS_RESERVES.arrivee,
      positionBaseM: arrondi(dernier.distanceM, 1),
      indexBase: points.length - 1,
      lon: arrondi(dernier.lon, 6),
      lat: arrondi(dernier.lat, 6),
      altitudeM: dernier.altitudeM,
      services: null,
    });
  }

  for (const point of config.pointsDePassage) {
    if (point.positionBaseM <= 0 || point.positionBaseM >= geometrie.distanceTotaleM) {
      throw new ConfigInvalideError(
        `point « ${point.id} » : positionBaseM ${point.positionBaseM} m hors trace ]0 ; ${arrondi(geometrie.distanceTotaleM, 0)} m[`,
      );
    }
    const indexBase = indexLePlusProche(distances, point.positionBaseM);
    if (indexBase <= 0 || indexBase >= points.length - 1) {
      throw new ConfigInvalideError(
        `point « ${point.id} » : trop proche du départ/arrivée de la base (réservés)`,
      );
    }
    const cible = points[indexBase];
    if (cible === undefined) {
      throw new ConfigInvalideError(`point « ${point.id} » : aucun point gardé à cette position`);
    }
    ajoute({
      id: point.id,
      nom: point.nom,
      positionBaseM: arrondi(cible.distanceM, 1),
      indexBase,
      lon: arrondi(cible.lon, 6),
      lat: arrondi(cible.lat, 6),
      altitudeM: cible.altitudeM,
      services: point.services ?? null,
    });
  }
  base.sort((a, b) => a.positionBaseM - b.positionBaseM);
  // Bornes des portions : points de la base SEULEMENT — une portion ne
  // peut pas puiser dans le relevé propre d’une autre épreuve.
  const parId = new Map(base.map((p) => [p.id, p]));

  // --- Relevés propres : appendus après la base, abscisse continue.
  const coords = points.map((p) => [arrondi(p.lon, 6), arrondi(p.lat, 6), p.altitudeM]);
  const profile = points.map((p) => [arrondi(p.distanceM, 1), p.altitudeM]);
  const distancesGlobales = [...distances];
  const altitudesGlobales = [...altitudesLissees];
  const tranchesPropres = new Map<string, { deIndex: number; aIndex: number }>();
  const tranchesPrefixe = new Map<string, { deIndex: number; aIndex: number }>();
  const sourcesPropres = new Map<string, NonNullable<EpreuveDoc['source']>>();
  for (const epreuve of config.epreuves) {
    if (epreuve.source === undefined) {
      continue;
    }
    const traite = entree.relevesEpreuves !== undefined && Object.hasOwn(entree.relevesEpreuves, epreuve.slug)
      ? entree.relevesEpreuves[epreuve.slug]
      : undefined;
    if (traite === undefined || traite.geometrie.points.length < 2) {
      throw new ConfigInvalideError(
        `épreuve « ${epreuve.slug} » : relevé ${epreuve.source.gpx} non fourni ou sans géométrie exploitable`,
      );
    }
    const g = traite.geometrie;
    const decalageIndex = coords.length;
    const decalageM = distancesGlobales[distancesGlobales.length - 1] ?? 0;
    g.points.forEach((p, i) => {
      coords.push([arrondi(p.lon, 6), arrondi(p.lat, 6), p.altitudeM]);
      profile.push([arrondi(decalageM + p.distanceM, 1), p.altitudeM]);
      distancesGlobales.push(decalageM + (g.distances[i] ?? p.distanceM));
      altitudesGlobales.push(g.altitudesLissees[i] ?? p.altitudeM);
    });
    const finIndex = coords.length - 1;
    const premierPropre = g.points[0];
    const dernierPropre = g.points[g.points.length - 1];
    const bornes = idsBornesEpreuve(epreuve.slug);
    if (epreuve.prefixeBase !== undefined) {
      const { aM } = epreuve.prefixeBase;
      if (aM >= geometrie.distanceTotaleM) {
        throw new ConfigInvalideError(
          `épreuve « ${epreuve.slug} » : prefixeBase.aM ${aM} m hors base ]0 ; ${arrondi(geometrie.distanceTotaleM, 0)} m[`,
        );
      }
      const aIndex = indexLePlusProche(distances, aM);
      if (aIndex <= 0) {
        throw new ConfigInvalideError(
          `épreuve « ${epreuve.slug} » : prefixeBase.aM ${aM} m trop proche du départ de la base`,
        );
      }
      tranchesPrefixe.set(epreuve.slug, { deIndex: 0, aIndex });
    }
    for (const [id, nom, point, indexBase] of [
      [bornes.depart, IDS_RESERVES.depart, premierPropre, decalageIndex],
      [bornes.arrivee, IDS_RESERVES.arrivee, dernierPropre, finIndex],
    ] as const) {
      if (point === undefined) {
        continue;
      }
      // Avec un début emprunté à la base, le départ de l'épreuve est celui de
      // la base : le premier point du relevé n'est plus qu'un raccord.
      if (id === bornes.depart && epreuve.prefixeBase !== undefined) {
        continue;
      }
      base.push({
        id,
        nom,
        positionBaseM: arrondi(decalageM + point.distanceM, 1),
        indexBase,
        lon: arrondi(point.lon, 6),
        lat: arrondi(point.lat, 6),
        altitudeM: point.altitudeM,
        services: null,
      });
    }
    for (const point of epreuve.pointsDePassage ?? []) {
      if (point.positionM <= 0 || point.positionM >= g.distanceTotaleM) {
        throw new ConfigInvalideError(
          `point « ${point.id} » : positionM ${point.positionM} m hors relevé ]0 ; ${arrondi(g.distanceTotaleM, 0)} m[`,
        );
      }
      const indexLocal = indexLePlusProche(g.distances, point.positionM);
      const cible = g.points[indexLocal];
      if (cible === undefined || indexLocal <= 0 || indexLocal >= g.points.length - 1) {
        throw new ConfigInvalideError(`point « ${point.id} » : trop proche du départ/arrivée du relevé (réservés)`);
      }
      base.push({
        id: point.id,
        nom: point.nom,
        positionBaseM: arrondi(decalageM + cible.distanceM, 1),
        indexBase: decalageIndex + indexLocal,
        lon: arrondi(cible.lon, 6),
        lat: arrondi(cible.lat, 6),
        altitudeM: cible.altitudeM,
        services: point.services ?? null,
      });
    }
    tranchesPropres.set(epreuve.slug, { deIndex: decalageIndex, aIndex: finIndex });
    sourcesPropres.set(epreuve.slug, {
      fichier: epreuve.source.gpx.split('/').pop() ?? epreuve.source.gpx,
      nom: traite.releve.nom,
      dateReleve: traite.releve.dateReleveIso,
      pointsBruts: traite.releve.points.length,
      pointsGardes: g.points.length,
      porte: {
        pasMedianS: traite.rapportQualite.pasMedianS,
        partDistanceSegmentsLongs: traite.rapportQualite.partDistanceSegmentsLongs,
        pointsVitesseImplausible: traite.rapportQualite.pointsVitesseImplausible,
        accepte: traite.rapportQualite.accepte,
      },
    });
  }
  // Points des relevés propres ajoutés après les bornes : ordre du profil.
  base.sort((a, b) => a.positionBaseM - b.positionBaseM);

  // --- Vues d’épreuve.
  const epreuves: Record<string, EpreuveDoc> = {};
  for (const epreuve of config.epreuves) {
    // Tranches : bornes résolues en index, ordre du relevé imposé.
    const tranches: { deIndex: number; aIndex: number }[] = [];
    const tranchePrefixe = tranchesPrefixe.get(epreuve.slug);
    if (tranchePrefixe !== undefined) {
      tranches.push(tranchePrefixe);
    }
    const tranchePropre = tranchesPropres.get(epreuve.slug);
    if (tranchePropre !== undefined) {
      tranches.push(tranchePropre);
    }
    for (const portion of epreuve.portions ?? []) {
      const de = parId.get(portion.de);
      const a = parId.get(portion.a);
      if (de === undefined) {
        throw new ConfigInvalideError(
          `épreuve « ${epreuve.slug} » : borne « ${portion.de} » inconnue (ni déclarée, ni depart/arrivee)`,
        );
      }
      if (a === undefined) {
        throw new ConfigInvalideError(
          `épreuve « ${epreuve.slug} » : borne « ${portion.a} » inconnue (ni déclarée, ni depart/arrivee)`,
        );
      }
      if (de.indexBase >= a.indexBase) {
        throw new ConfigInvalideError(
          `épreuve « ${epreuve.slug} » : portion ${portion.de} → ${portion.a} à contre-sens du relevé (${de.positionBaseM} m ≥ ${a.positionBaseM} m)`,
        );
      }
      tranches.push({ deIndex: de.indexBase, aIndex: a.indexBase });
    }

    // Séquence parcourue : chaque point gardé des tranches, avec son `s`
    // propre à l’épreuve (cumul au fil des tranches — jamais global).
    const sequence: OccurrenceEpreuve[] = [];
    let sDepartTranche = 0;
    for (const tranche of tranches) {
      for (let i = tranche.deIndex; i <= tranche.aIndex; i++) {
        const distance = distancesGlobales[i];
        const altitudeLissee = altitudesGlobales[i];
        if (distance === undefined || altitudeLissee === undefined) {
          continue;
        }
        const debut = distancesGlobales[tranche.deIndex] ?? 0;
        sequence.push({ indexBase: i, sM: sDepartTranche + (distance - debut), altitudeLissee });
      }
      const fin = distancesGlobales[tranche.aIndex] ?? 0;
      const debut = distancesGlobales[tranche.deIndex] ?? 0;
      sDepartTranche += fin - debut;
    }

    // Occurrences de points de passage : PREMIÈRE traversée gardée si la
    // base est revisitée (un point peut être croisé deux fois).
    const occurrences = new Map<string, OccurrenceEpreuve>();
    for (const occ of sequence) {
      const point = base.find((p) => p.indexBase === occ.indexBase);
      if (point !== undefined && !occurrences.has(point.id)) {
        occurrences.set(point.id, occ);
      }
    }
    const vus = [...occurrences.entries()]
      .map(([id, occ]) => ({ id, ...occ }))
      .sort((x, y) => x.sM - y.sM);

    // D+ du segment amont : hystérésis sur la tranche de séquence entre
    // points de passage consécutifs (ancre réinitialisée à chaque point).
    const altitudesSequence = sequence.map((o) => o.altitudeLissee);
    const pointsEpreuve: PointDePassageEpreuveDoc[] = vus.map((vu, rang) => {
      let dplusAmont = 0;
      if (rang > 0) {
        const precedent = vus[rang - 1];
        if (precedent !== undefined) {
          const depuis = sequence.findIndex((o) => o.sM === precedent.sM && o.indexBase === precedent.indexBase);
          const jusqua = sequence.findIndex((o) => o.sM === vu.sM && o.indexBase === vu.indexBase);
          if (depuis >= 0 && jusqua > depuis) {
            dplusAmont = calculerDeniveles(altitudesSequence.slice(depuis, jusqua + 1)).dPlusSeuilM;
          }
        }
      }
      return {
        id: vu.id,
        sM: arrondi(vu.sM, 1),
        kilometre: arrondi(vu.sM / 1000, 2),
        altitudeM: arrondi(vu.altitudeLissee, 1),
        dplusSegmentAmontM: arrondi(dplusAmont, 0),
      };
    });

    const denivelesEpreuve = calculerDeniveles(altitudesSequence);
    const distanceEpreuveM = sDepartTranche; // somme des tranches
    const sourcePropre = sourcesPropres.get(epreuve.slug);
    epreuves[epreuve.slug] = {
      distanceM: arrondi(distanceEpreuveM, 1),
      dplusM: arrondi(denivelesEpreuve.dPlusSeuilM, 0),
      dmoinsM: arrondi(denivelesEpreuve.dMoinsSeuilM, 0),
      altitudeMinM: arrondi(Math.min(...altitudesSequence), 1),
      altitudeMaxM: arrondi(Math.max(...altitudesSequence), 1),
      tranches,
      pointsDePassage: pointsEpreuve,
      ...(sourcePropre !== undefined ? { source: sourcePropre } : {}),
    };
  }

  return {
    version,
    source: {
      fichier: config.source.gpx.split('/').pop() ?? config.source.gpx,
      nom: releve.nom,
      dateReleve: releve.dateReleveIso,
      pointsBruts: releve.points.length,
      pointsGardes: points.length,
    },
    constantes: { ...CONSTANTES_PIPELINE },
    mesures: {
      distanceM: arrondi(geometrie.distanceTotaleM, 1),
      dplusBrutM: arrondi(geometrie.deniveles.dPlusBrutM, 0),
      dmoinsBrutM: arrondi(geometrie.deniveles.dMoinsBrutM, 0),
      dplusM: arrondi(geometrie.deniveles.dPlusSeuilM, 0),
      dmoinsM: arrondi(geometrie.deniveles.dMoinsSeuilM, 0),
      altitudeMinM: arrondi(geometrie.altitudeMinM, 1),
      altitudeMaxM: arrondi(geometrie.altitudeMaxM, 1),
      porte: {
        pasMedianS: rapportQualite.pasMedianS,
        partDistanceSegmentsLongs: rapportQualite.partDistanceSegmentsLongs,
        pointsVitesseImplausible: rapportQualite.pointsVitesseImplausible,
        accepte: rapportQualite.accepte,
      },
    },
    coords,
    profile,
    pointsDePassage: base,
    epreuves,
  };
}
