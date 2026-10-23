import {
  echantillonnerPoints,
  estEstompee,
  type PointTrace,
  type PositionPublique,
  type TracePublique,
} from '@azzel/shared';

import { getContenusStore, type ContenusStore } from '@/modules/contenus/store';
import { getTrackingStore, type TrackingStore } from '@/modules/tracking/store';

import { getChronoStore, type ChronoStore } from './store';

// Story 7.3 (FR-19, NFR-7, AD-7) — carte publique anonyme. Gabarit direct de
// getResultatsPublic (7.2) : organisation PAR DÉFAUT (aucune session, tout
// transite par le backend), micro-cache ~5 s sur les positions (le jour J, N
// visiteurs pollant toutes les 10 s n'imposent qu'UNE lecture base par
// fenêtre), snapshot servi TEL QUEL (genereA compris — la fraîcheur décrit le
// snapshot, jamais un âge rajeuni).
//
// Traces : le GPX est récupéré, parsé et réduit CÔTÉ SERVEUR (le client ne
// télécharge JAMAIS le GPX brut), cache mémoire 1 h PAR URL, échec ISOLÉ par
// épreuve (un GPX cassé n'entraîne jamais les autres). Anonymat structurel :
// les seules colonnes lues sont dossard + épreuve + position horodatée.

/** Fenêtre du micro-cache partagé de getPositionsPubliques (jamais > 5 s). */
const POSITIONS_PUBLIC_TTL_MS = 5_000;

/** Cache mémoire des tracés parsés : 1 h PAR URL (le GPX est immuable). */
const TRACES_TTL_MS = 3_600_000;

/**
 * Cache NÉGATIF d'un GPX en échec : 60 s par URL — une URL morte (404, timeout,
 * GPX vide) n'est pas re-reqêtée à chaque ouverture de carte (les SUCCÈS seuls
 * vivent 1 h ; l'échec se rattrape vite, le succès se garde longtemps).
 */
const TRACES_ECHEC_TTL_MS = 60_000;

/** Timeout du fetch serveur d'un GPX : au-delà, l'épreuve est servie sans tracé. */
const GPX_TIMEOUT_MS = 5_000;

/** Garde mémoire : un GPX géant ne doit jamais gonfler le process (échec doux). */
const GPX_TAILLE_MAX_CARACTERES = 20 * 1024 * 1024;

/** Garde parsing : au-delà, les points restants sont ignorés (échantillonnage après). */
const GPX_POINTS_MAX_LUS = 100_000;

/**
 * Tolérance horloge APPAREIL (revue 7.3) : une capture au-delà de maintenant +
 * 10 min est hors contrat (horloge manifestement en avance) — la position est
 * servie ESTOMPÉE, jamais présentée comme fraîche (défense en profondeur côté
 * serveur, le client ne recalcule rien).
 */
export const TOLERANCE_HORLOGE_MS = 10 * 60_000;

export interface CarteServiceDeps {
  chronoStore?: ChronoStore;
  trackingStore?: TrackingStore;
  contenusStore?: ContenusStore;
  /** Fetch serveur d'un GPX — injectable (tests) ; Response.text() est lu. */
  fetchGpx?: (url: string) => Promise<Response>;
}

/** Snapshot positions servi tel quel par la route (genereA = horloge du calcul). */
export interface PositionsPubliques {
  positions: PositionPublique[];
  genereA: string;
}

/** Réponse traces : uniquement les épreuves dont le GPX a PU être servi. */
export interface TracesPubliques {
  traces: TracePublique[];
}

/**
 * Micro-cache module (calque exact cacheResultatsPublic) : le snapshot servi
 * (genereA compris) est renvoyé TEL QUEL tant qu'il n'a pas expiré.
 */
let cachePositionsPubliques: { valeur: PositionsPubliques; expireLe: number } | null = null;

/** Cache mémoire des tracés par URL : seuls les SUCCÈS sont cachés (1 h). */
const cacheTracesParUrl = new Map<string, { points: PointTrace[]; expireLe: number }>();

/** Cache NÉGATIF par URL en échec : expireLe (60 s) — pas de tempête sur une URL morte. */
const tracesEnEchecParUrl = new Map<string, number>();

/** Tests uniquement : invalide micro-cache positions + caches traces (isolation). */
export function resetCarteCachesForTests(): void {
  cachePositionsPubliques = null;
  cacheTracesParUrl.clear();
  tracesEnEchecParUrl.clear();
}

/**
 * Dernières positions publiques de l'organisation PAR DÉFAUT : une par coureur
 * (DISTINCT ON côté store), estompée calculée ICI côté serveur (le client ne
 * recalule jamais — il affiche). Sans organisation : état ZÉRO cohérent.
 */
export async function getPositionsPubliques(
  deps: CarteServiceDeps = {},
): Promise<PositionsPubliques> {
  if (cachePositionsPubliques !== null && Date.now() < cachePositionsPubliques.expireLe) {
    return cachePositionsPubliques.valeur;
  }
  const chronoStore = deps.chronoStore ?? getChronoStore();
  const trackingStore = deps.trackingStore ?? getTrackingStore();
  const organisationId = await chronoStore.organisationParDefautId();
  const valeur: PositionsPubliques = organisationId
    ? await lirePositions(trackingStore, organisationId)
    : { positions: [], genereA: new Date().toISOString() };
  cachePositionsPubliques = { valeur, expireLe: Date.now() + POSITIONS_PUBLIC_TTL_MS };
  return valeur;
}

/**
 * Estompage SERVEUR d'une position (revue 7.3) : estEstompee (shared, borne
 * 1 h strictement dépassée) OU capture dans le futur au-delà de la tolérance
 * d'horloge appareil (clamp : jamais une position d'horloge en avance servie
 * comme fraîche). Pure, testée.
 */
export function estEstompeeServeur(capteAt: Date, maintenant: Date): boolean {
  return (
    capteAt.getTime() > maintenant.getTime() + TOLERANCE_HORLOGE_MS ||
    estEstompee(capteAt.toISOString(), maintenant)
  );
}

async function lirePositions(
  trackingStore: TrackingStore,
  organisationId: string,
): Promise<PositionsPubliques> {
  const maintenant = new Date();
  const records = await trackingStore.dernieresPositions(organisationId);
  const positions: PositionPublique[] = records.map((record) => {
    const capteA = record.capteAt.toISOString();
    return {
      dossard: record.dossard,
      epreuveSlug: record.epreuveSlug,
      epreuveNom: record.epreuveNom,
      lat: record.latitude,
      lon: record.longitude,
      capteA,
      estompée: estEstompeeServeur(record.capteAt, maintenant),
    };
  });
  return { positions, genereA: maintenant.toISOString() };
}

// ---------------------------------------------------------------------------
// Traces GPX — parsing défensif (regex, aucune dépendance XML) : les balises
// <trkpt lat="…" lon="…"> sont extraites dans l'ordre du document, les points
// invalides (attributs absents, hors bornes GPS) sont IGNORÉS un à un — un
// GPX abherrant ne casse jamais la réponse, il réduit juste le tracé.
// ---------------------------------------------------------------------------

const TRKPT_TAG_PATTERN = /<trkpt\b[^>]*>/gi;
const LAT_PATTERN = /\blat\s*=\s*["']\s*(-?\d+(?:\.\d+)?)\s*["']/i;
const LON_PATTERN = /\blon\s*=\s*["']\s*(-?\d+(?:\.\d+)?)\s*["']/i;

/**
 * Extrait les points d'un GPX (pure, testée) : ordre du document, bornes GPS.
 * Tolérante à la forme des attributs — quotes doubles OU simples, espaces
 * autour du `=` (`lat = '36.5'` est un GPX légal) —, elle ignore un à un les
 * points invalides (attributs absents, hors bornes GPS).
 */
export function extrairePointsGpx(gpx: string): PointTrace[] {
  if (gpx.length > GPX_TAILLE_MAX_CARACTERES) {
    return [];
  }
  const points: PointTrace[] = [];
  for (const tag of gpx.match(TRKPT_TAG_PATTERN) ?? []) {
    const lat = LAT_PATTERN.exec(tag)?.[1];
    const lon = LON_PATTERN.exec(tag)?.[1];
    if (lat === undefined || lon === undefined) {
      continue;
    }
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }
    points.push({ lat: latitude, lon: longitude });
    if (points.length >= GPX_POINTS_MAX_LUS) {
      break;
    }
  }
  return points;
}

async function lireTrace(
  url: string,
  fetchGpx: NonNullable<CarteServiceDeps['fetchGpx']>,
): Promise<PointTrace[] | null> {
  const enCache = cacheTracesParUrl.get(url);
  if (enCache !== undefined && Date.now() < enCache.expireLe) {
    return enCache.points;
  }
  const echecExpireLe = tracesEnEchecParUrl.get(url);
  if (echecExpireLe !== undefined && Date.now() < echecExpireLe) {
    return null;
  }
  // Timeout 5 s + HTTP KO + taille + parse : TOUT échec est doux (null) et
  // NÉGATIVEMENT caché 60 s — l'épreuve est servie SANS tracé, jamais une
  // erreur brute au public, jamais de tempête sur une URL morte.
  try {
    const response = await fetchGpx(url);
    if (!response.ok) {
      cacherEchecTrace(url);
      return null;
    }
    // Garde taille AVANT chargement : un content-length annoncé au-delà du
    // max est refusé SANS lire le corps (le process ne gonfle jamais).
    const tailleAnnoncee = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(tailleAnnoncee) &&
      tailleAnnoncee > GPX_TAILLE_MAX_CARACTERES
    ) {
      cacherEchecTrace(url);
      return null;
    }
    const gpx = await response.text();
    if (gpx.length > GPX_TAILLE_MAX_CARACTERES) {
      cacherEchecTrace(url);
      return null;
    }
    const points = extrairePointsGpx(gpx);
    if (points.length === 0) {
      cacherEchecTrace(url);
      return null;
    }
    const echantillon = echantillonnerPoints(points);
    cacheTracesParUrl.set(url, { points: echantillon, expireLe: Date.now() + TRACES_TTL_MS });
    return echantillon;
  } catch {
    cacherEchecTrace(url);
    return null;
  }
}

function cacherEchecTrace(url: string): void {
  tracesEnEchecParUrl.set(url, Date.now() + TRACES_ECHEC_TTL_MS);
}

/**
 * Tracés publics des épreuves de l'ÉDITION COURANTE de l'organisation PAR
 * DÉFAUT (revue 7.3 : editionId résolu ICI et passé au contenus store — plus
 * de doublons de slug ni de tracés d'une édition passée) qui ont un gpx_url :
 * fetch serveur (timeout 5 s), parse, échantillonnage shared ≤ 500 points,
 * cache 1 h par URL. Un échec est ISOLÉ par épreuve (trace absente de la
 * réponse, les autres servies). Sans organisation/édition : état ZÉRO cohérent.
 */
export async function getTracesPubliques(deps: CarteServiceDeps = {}): Promise<TracesPubliques> {
  const chronoStore = deps.chronoStore ?? getChronoStore();
  const contenusStore = deps.contenusStore ?? getContenusStore();
  const fetchGpx = deps.fetchGpx ?? ((url: string) => fetch(url, { signal: AbortSignal.timeout(GPX_TIMEOUT_MS) }));
  const organisationId = await chronoStore.organisationParDefautId();
  if (organisationId === null) {
    return { traces: [] };
  }
  const editionId = await chronoStore.editionCouranteId(organisationId);
  if (editionId === null) {
    return { traces: [] };
  }
  const epreuves = await contenusStore.listEpreuvesParcours(organisationId, editionId);
  const avecGpx = epreuves.filter((epreuve) => epreuve.gpxUrl !== null);
  const traces = await Promise.all(
    avecGpx.map(async (epreuve) => {
      const points = await lireTrace(epreuve.gpxUrl as string, fetchGpx);
      return points === null
        ? null
        : {
            epreuveSlug: epreuve.slug,
            epreuveNom: epreuve.nom,
            points,
          };
    }),
  );
  return { traces: traces.filter((trace): trace is TracePublique => trace !== null) };
}
