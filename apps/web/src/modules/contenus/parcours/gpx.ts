// Story 11.1 — parseur GPX « maison » du pipeline (aucune dépendance, FR-28).
//
// Même approche regex que le POC Python (`poc/gpx.py`) : les exports Garmin
// Connect sont plats et prévisibles, un parseur XML complet serait une
// dépendance de plus pour zéro gain. L’altitude vient EXCLUSIVEMENT de
// `<ele>` (barométrique montre) — jamais du MNT (décision d’épopée).
//
// Exigences du relevé : chaque `<trkpt>` porte `<ele>` ET `<time>` (la porte
// de qualité FR-28b mesure des pas de temps et des vitesses). Un point qui
// manque d’une balise est une ERREUR NOMMÉE, pas un point silencieusement
// dégradé.

/** Erreur nommée du parseur : fichier sans point, ou points incomplets. */
export class GpxInvalideError extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = 'GpxInvalideError';
  }
}

/** Un `<trkpt>` brut, tel que lu (aucun traitement). */
export interface PointGpx {
  lon: number;
  lat: number;
  /** Altitude barométrique du GPX (mètres). */
  ele: number;
  /** Horodatage ISO 8601 du point. */
  tempsIso: string;
  /** Horodatage en ms depuis l’époque (calculé une fois). */
  tempsMs: number;
}

/** Relevé GPX parsé : identité du fichier + points bruts. */
export interface ReleveGpx {
  /** Premier `<name>` du fichier (nom de l’activité). */
  nom: string;
  /** `<time>` de `<metadata>` (date de l’export), sinon horodatage du 1ᵉʳ point. */
  dateReleveIso: string | null;
  points: readonly PointGpx[];
}

// Attribute order fixed by the schema (lat puis lon) — comme le POC ; la
// précision « exotique » des coordonnées Garmin (30+ chiffres) est mangée par
// parseFloat sans perte au-delà du nanomètre.
const RE_TRKPT = /<trkpt\b[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
const RE_ELE = /<ele>([^<]+)<\/ele>/;
const RE_TIME = /<time>([^<]+)<\/time>/;
const RE_NOM = /<name>([\s\S]*?)<\/name>/;
const RE_DATE_META = /<metadata>[\s\S]*?<time>([^<]+)<\/time>[\s\S]*?<\/metadata>/;

/**
 * Parse un document GPX (XML en texte). Erreurs nommées :
 * - aucun `<trkpt>` trouvé ;
 * - N points sans `<ele>` / sans `<time>` (comptés et cités) — le pipeline
 *   refuse plutôt que d’inventer une altitude ou un pas de temps.
 */
export function parserGpx(xml: string): ReleveGpx {
  const points: PointGpx[] = [];
  let sansEle = 0;
  let sansTime = 0;

  for (const corresp of xml.matchAll(RE_TRKPT)) {
    const lat = Number.parseFloat(corresp[1] ?? '');
    const lon = Number.parseFloat(corresp[2] ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new GpxInvalideError('trkpt avec attribut lat/lon illisible');
    }
    const corps = corresp[3] ?? '';
    const eleTxt = RE_ELE.exec(corps)?.[1];
    const timeTxt = RE_TIME.exec(corps)?.[1];
    if (eleTxt === undefined) {
      sansEle++;
      continue;
    }
    if (timeTxt === undefined) {
      sansTime++;
      continue;
    }
    const ele = Number.parseFloat(eleTxt);
    const tempsMs = Date.parse(timeTxt);
    if (!Number.isFinite(ele) || Number.isNaN(tempsMs)) {
      throw new GpxInvalideError(
        `trkpt avec <ele> ou <time> illisible (ele="${eleTxt}", time="${timeTxt}")`,
      );
    }
    points.push({ lon, lat, ele, tempsIso: timeTxt, tempsMs });
  }

  if (points.length === 0 && (sansEle > 0 || sansTime > 0)) {
    throw new GpxInvalideError(
      `GPX incomplet : ${sansEle} point(s) sans <ele>, ${sansTime} point(s) sans <time>`,
    );
  }
  if (points.length === 0) {
    throw new GpxInvalideError('aucun point de trace trouvé dans le GPX');
  }
  if (sansEle > 0 || sansTime > 0) {
    // Points complets présents mais relevé partiel : refus nommé quand même —
    // un relevé troué fausserait les pas médians et le D+.
    throw new GpxInvalideError(
      `GPX incomplet : ${sansEle} point(s) sans <ele>, ${sansTime} point(s) sans <time>`,
    );
  }

  const nom = (RE_NOM.exec(xml)?.[1] ?? 'Parcours').trim();
  const dateMeta = RE_DATE_META.exec(xml)?.[1] ?? null;
  const dateReleveIso = dateMeta ?? points[0]?.tempsIso ?? null;

  return { nom, dateReleveIso, points };
}
