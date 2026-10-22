// Story 2.4 — domaine contenus vitrine : slugs éditables, validation des
// entrées (admin) et préparation du rendu public (paragraphes, balise
// « à confirmer »). Le corps est du texte simple : aucun HTML n'y entre jamais,
// le rendu React échappe tout.

export const CONTENU_SLUGS = [
  'parcours-longue',
  'parcours-moyenne',
  'consignes-securite',
  'region',
  'hebergement',
  'restauration',
  'annexes',
] as const;

export type ContenuSlug = (typeof CONTENU_SLUGS)[number];

/** Blocs affichés sur /parcours, dans cet ordre. */
export const PARCOURS_SLUGS = ['parcours-longue', 'parcours-moyenne'] as const;

/** Blocs affichés sur /region, dans cet ordre. */
export const REGION_SLUGS = [
  'region',
  'hebergement',
  'restauration',
  'annexes',
  'consignes-securite',
] as const;

/** Slug du bloc parcours → slug de l'épreuve associée (URL GPX, distance). */
export const SLUGS_EPREUVES_PARCOURS: Record<
  (typeof PARCOURS_SLUGS)[number],
  string
> = {
  'parcours-longue': 'longue',
  'parcours-moyenne': 'moyenne',
};

export const MAX_TITRE_LENGTH = 120;

export const MAX_CORPS_LENGTH = 20000;

export const MAX_GPX_URL_LENGTH = 2048;

export const CONTENU_FIELD_ORDER = ['titre', 'corps', 'gpxUrl'] as const;

export type ContenuField = (typeof CONTENU_FIELD_ORDER)[number];

export type ContenuFieldErrors = Partial<Record<ContenuField, string>>;

export interface ContenuInput {
  titre: string;
  corps: string;
  gpxUrl: string | null;
}

/** Marqueur des seeds provisoires : le comité doit confirmer les faits 2027. */
export const BALISE_A_CONFIRMER = 'à confirmer par le comité';

export function isContenuSlug(raw: string): raw is ContenuSlug {
  return (CONTENU_SLUGS as readonly string[]).includes(raw);
}

/** Le GPX est une URL https fournie par l'admin (jamais http, jamais un schème libre). */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeContenuInput(raw: unknown): ContenuInput {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const texte = (key: string): string => {
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const gpx = texte('gpxUrl');
  return {
    titre: texte('titre'),
    corps: texte('corps'),
    gpxUrl: gpx.length > 0 ? gpx : null,
  };
}

export function validateContenuInput(input: ContenuInput): ContenuFieldErrors {
  const errors: ContenuFieldErrors = {};
  if (input.titre === '') {
    errors.titre = 'Le titre est obligatoire.';
  } else if (input.titre.length > MAX_TITRE_LENGTH) {
    errors.titre = `${MAX_TITRE_LENGTH} caractères maximum pour le titre.`;
  }
  if (input.corps === '') {
    errors.corps = 'Le contenu est obligatoire.';
  } else if (input.corps.length > MAX_CORPS_LENGTH) {
    errors.corps = `${MAX_CORPS_LENGTH} caractères maximum pour le contenu.`;
  }
  if (input.gpxUrl !== null && !isHttpsUrl(input.gpxUrl)) {
    errors.gpxUrl = 'L’adresse du tracé GPX doit commencer par https://.';
  }
  if (input.gpxUrl !== null && input.gpxUrl.length > MAX_GPX_URL_LENGTH) {
    errors.gpxUrl = `${MAX_GPX_URL_LENGTH} caractères maximum pour l’adresse du tracé.`;
  }
  return errors;
}

/** Valeurs fournies non-chaîne (ex. titre : 42) : refus champ nommé, jamais d'écrasement silencieux. */
export function contenuTypeErrors(raw: unknown): ContenuFieldErrors {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const errors: ContenuFieldErrors = {};
  for (const key of CONTENU_FIELD_ORDER) {
    const value = record[key];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors[key] = 'Ce champ doit être un texte.';
    }
  }
  return errors;
}

export function hasContenuFieldErrors(errors: ContenuFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

/** Corps balisé « à confirmer » : hint visible côté admin tant que le comité n'a pas confirmé. */
export function estBaliséÀConfirmer(corps: string): boolean {
  return corps.toLowerCase().includes(BALISE_A_CONFIRMER);
}

/**
 * Découpe le corps en paragraphes : séparés par une ligne vide (ou plus).
 * Les sauts de ligne simples sont conservés dans le paragraphe (rendus
 * explicitement par le composant public). Aucun HTML : le texte est rendu
 * échappé par React.
 */
export function splitParagraphes(corps: string): string[] {
  return corps
    .split(/\n[ \t]*\n+/)
    .map((paragraphe) => paragraphe.trim())
    .filter((paragraphe) => paragraphe.length > 0);
}

/**
 * Ordonne les éléments par position de leur slug dans la liste de référence
 * (semantique unique, partagée par le store et le service) ; un slug absent
 * de la liste finit en queue, ordre d'origine conservé (tri stable).
 */
export function ordonnerParSlugs<T extends { slug: string }>(
  items: readonly T[],
  slugs: readonly string[],
): T[] {
  const rang = new Map(slugs.map((slug, index) => [slug, index]));
  return [...items].sort(
    (a, b) => (rang.get(a.slug) ?? slugs.length) - (rang.get(b.slug) ?? slugs.length),
  );
}
