// Story 2.5 — domaine retour en images : validation des entrées (admin :
// témoignages CRUD + URL trailer) et résolution du rendu public de
// /retour-en-images (dégradations propres : sans URL → bloc trailer absent,
// sans témoignages → section absente).

export const MAX_CITATION_LENGTH = 280;
export const MAX_PRENOM_LENGTH = 40;
export const MAX_EDITION_LENGTH = 40;

/** Création refusée au-delà (store) — garde-fou volumétrie par organisation. */
export const MAX_TEMOIGNAGES_PAR_ORG = 6;

/** Ordre d'affichage borné (validation applicative + CHECK SQL 0015). */
export const MIN_TEMOIGNAGE_ORDRE = 1;
export const MAX_TEMOIGNAGE_ORDRE = 9999;

export const MAX_TRAILER_URL_LENGTH = 2048;

export const TEMOIGNAGE_FIELD_ORDER = [
  'citation',
  'prenom',
  'editionReference',
  'ordre',
] as const;

export type TemoignageField = (typeof TEMOIGNAGE_FIELD_ORDER)[number];

export type TemoignageFieldErrors = Partial<Record<TemoignageField, string>>;

export interface TemoignageInput {
  citation: string;
  prenom: string;
  editionReference: string;
  /** null = placé en fin d'ordre (max + 1) au moment de la création. */
  ordre: number | null;
}

export interface ResolvableTemoignage {
  id: string;
  citation: string;
  prenom: string;
  editionReference: string;
  ordre: number;
}

export interface TemoignageView {
  id: string;
  citation: string;
  prenom: string;
  editionReference: string;
  /** Avatar du témoignage : initiales du prénom dans un cercle charte. */
  initiales: string;
}

/** Lecteur résolu : natif <video> pour un lien direct, iframe pour YouTube/Vimeo. */
export type TrailerPlayer =
  | { kind: 'video'; url: string }
  | { kind: 'iframe'; url: string };

export interface RetourImagesPageView {
  /** null = pas d'URL configurée (ou non https échappée en base) : bloc absent. */
  trailer: TrailerPlayer | null;
  /** [] = section absente de la page (jamais de section vide). */
  temoignages: TemoignageView[];
}

export const RETOUR_IMAGES_PAGE_VIDE: RetourImagesPageView = {
  trailer: null,
  temoignages: [],
};

/* Poster du trailer — dégradé forêt en pur CSS (zéro octet d'image) et pastille
   de lecture « vert altitude » de la charte. Ces constantes sont la source du
   test de contraste (contrastes.test.ts, seuil non textuel 3:1) ; les hex se
   retrouvent à l'identique dans les styles .aa-trailer (vitrine-textes.css). */
export const POSTER_DEGRADE_COULEURS = ['#24503C', '#183A2B', '#122C20'] as const;

/** Vert altitude (palette Vert Djurdjura) — pastille ronde de lecture. */
export const PASTILLE_LECTURE = '#8FD4A8';

/** Glyphe triangle rendu DANS la pastille vert altitude. */
export const GLYPHE_LECTURE = '#183A2B';

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeTemoignageInput(raw: unknown): TemoignageInput {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const texte = (key: string): string => {
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const ordreBrut = record.ordre;
  return {
    citation: texte('citation'),
    prenom: texte('prenom'),
    editionReference: texte('editionReference'),
    ordre:
      typeof ordreBrut === 'number' && Number.isInteger(ordreBrut) ? ordreBrut : null,
  };
}

export function validateTemoignageInput(input: TemoignageInput): TemoignageFieldErrors {
  const errors: TemoignageFieldErrors = {};
  if (input.citation === '') {
    errors.citation = 'La citation est obligatoire.';
  } else if (input.citation.length > MAX_CITATION_LENGTH) {
    errors.citation = `${MAX_CITATION_LENGTH} caractères maximum pour la citation.`;
  }
  if (input.prenom === '') {
    errors.prenom = 'Le prénom est obligatoire.';
  } else if (input.prenom.length > MAX_PRENOM_LENGTH) {
    errors.prenom = `${MAX_PRENOM_LENGTH} caractères maximum pour le prénom.`;
  }
  if (input.editionReference === '') {
    errors.editionReference = 'L’édition de référence est obligatoire (ex. « Trail 2026 »).';
  } else if (input.editionReference.length > MAX_EDITION_LENGTH) {
    errors.editionReference = `${MAX_EDITION_LENGTH} caractères maximum pour l’édition.`;
  }
  if (
    input.ordre !== null &&
    (input.ordre < MIN_TEMOIGNAGE_ORDRE || input.ordre > MAX_TEMOIGNAGE_ORDRE)
  ) {
    errors.ordre = `L’ordre doit être un nombre entier entre ${MIN_TEMOIGNAGE_ORDRE} et ${MAX_TEMOIGNAGE_ORDRE}.`;
  }
  return errors;
}

/** Ordre fourni non-entier (ex. « deux ») : refus champ nommé, jamais d'écrasement silencieux. */
export function ordreTypeError(raw: unknown): string | null {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const ordre = record.ordre;
  if (ordre === undefined || ordre === null) {
    return null;
  }
  if (typeof ordre !== 'number' || !Number.isInteger(ordre)) {
    return 'L’ordre doit être un nombre entier.';
  }
  return null;
}

export function temoignageTypeErrors(raw: unknown): TemoignageFieldErrors {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const errors: TemoignageFieldErrors = {};
  for (const key of TEMOIGNAGE_FIELD_ORDER) {
    if (key === 'ordre') {
      continue;
    }
    const value = record[key];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors[key] = 'Ce champ doit être un texte.';
    }
  }
  return errors;
}

export function hasTemoignageFieldErrors(errors: TemoignageFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

/**
 * Initiales du prénom pour l'avatar (cercle charte) : première lettre de chaque
 * mot, plafonné à deux — « Yacine » → « Y », « Nadia L. » → « NL ».
 */
export function initiales(prenom: string): string {
  return prenom
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('');
}

/** URL trailer brute du corps admin : trim, vide → null (pas encore de vidéo). */
export function normalizeTrailerUrlInput(raw: unknown): { trailerUrl: string | null } {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const value = record.trailerUrl;
  if (typeof value !== 'string') {
    return { trailerUrl: null };
  }
  const trimmed = value.trim();
  return { trailerUrl: trimmed.length > 0 ? trimmed : null };
}

export function validateTrailerUrl(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  if (!isHttpsUrl(url)) {
    return 'L’adresse de la vidéo doit commencer par https://.';
  }
  if (url.length > MAX_TRAILER_URL_LENGTH) {
    return `${MAX_TRAILER_URL_LENGTH} caractères maximum pour l’adresse de la vidéo.`;
  }
  return null;
}

/** Valeur trailerUrl fournie non-chaîne (ex. 42) : refus champ nommé. */
export function trailerUrlTypeError(raw: unknown): string | null {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const value = record.trailerUrl;
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return 'Ce champ doit être un texte (adresse https://).';
  }
  return null;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function youtubeEmbed(videoId: string): TrailerPlayer {
  return { kind: 'iframe', url: `https://www.youtube.com/embed/${videoId}` };
}

/**
 * Résout le lecteur depuis l'URL configurée par l'admin (fonction pure) :
 * - YouTube (watch, youtu.be, shorts, live, embed) → iframe embed ;
 * - Vimeo (vimeo.com/<id>, player.vimeo.com/video/<id>) → iframe player ;
 * - toute autre URL https directe → <video> natif.
 * Retourne null pour une URL non https (garde de rendu : le bloc est absent).
 */
export function resolveTrailerPlayer(url: string): TrailerPlayer | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
  if (host === 'youtu.be') {
    const id = segments[0];
    return id && VIDEO_ID_PATTERN.test(id) ? youtubeEmbed(id) : null;
  }
  if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'www.youtube-nocookie.com'
  ) {
    if (segments[0] === 'watch') {
      const id = parsed.searchParams.get('v');
      return id && VIDEO_ID_PATTERN.test(id) ? youtubeEmbed(id) : null;
    }
    if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
      const id = segments[1];
      return id && VIDEO_ID_PATTERN.test(id) ? youtubeEmbed(id) : null;
    }
    return null;
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = segments[0];
    return id && /^\d+$/.test(id)
      ? { kind: 'iframe', url: `https://player.vimeo.com/video/${id}` }
      : null;
  }
  if (host === 'player.vimeo.com') {
    return segments[0] === 'video' && segments[1] && /^\d+$/.test(segments[1])
      ? { kind: 'iframe', url: `https://player.vimeo.com/video/${segments[1]}` }
      : null;
  }
  return { kind: 'video', url };
}

/**
 * Résolution du rendu public (dégradations propres) : sans trailer valide →
 * bloc absent ; sans témoignages → section absente ; l'ordre d'affichage est
 * celui défini par l'admin (ordre, puis insertion — tri du store).
 */
export function resolveRetourImagesPage(input: {
  trailerUrl: string | null;
  temoignages: readonly ResolvableTemoignage[];
}): RetourImagesPageView {
  const trailer =
    input.trailerUrl !== null ? resolveTrailerPlayer(input.trailerUrl) : null;
  const temoignages = [...input.temoignages]
    .sort((a, b) => a.ordre - b.ordre)
    .map((temoignage) => ({
      id: temoignage.id,
      citation: temoignage.citation,
      prenom: temoignage.prenom,
      editionReference: temoignage.editionReference,
      initiales: initiales(temoignage.prenom),
    }));
  return { trailer, temoignages };
}

/**
 * Lecture immédiate au premier clic sur le poster (geste de l'utilisateur —
 * l'interdit d'autoplay de la spec porte sur le CHARGEMENT DE PAGE, pas sur ce
 * geste) : ajoute autoplay=1 à l'URL d'embed YouTube/Vimeo montée au clic.
 */
export function avecLectureImmediate(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
}
