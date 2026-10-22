// Story 2.3 — domaine sponsors : validation des entrées (admin) et résolution
// du rendu vitrine (option A signature / option B grille équivalente).

export type SponsorMode = 'A' | 'B';

export const DEFAULT_SPONSOR_MODE: SponsorMode = 'A';

export const MAX_SPONSOR_NAME_LENGTH = 80;

export const MAX_SPONSOR_URL_LENGTH = 2048;

/** Création refusée au-delà (store) — garde-fou volumétrie par organisation. */
export const MAX_SPONSORS_PAR_ORG = 20;

/** Option B : la grille n’affiche que les 12 premiers emplacements (ordre de création). */
export const MAX_EMPLOCHEMENTS_VITRINE = 12;

export const SPONSOR_FIELD_ORDER = ['name', 'url', 'logoUrl'] as const;

export type SponsorField = (typeof SPONSOR_FIELD_ORDER)[number];

export type SponsorFieldErrors = Partial<Record<SponsorField, string>>;

export interface SponsorInput {
  name: string;
  url: string | null;
  logoUrl: string | null;
}

export interface ResolvableSponsor {
  id: string;
  name: string;
  url: string | null;
  logoUrl: string | null;
  isSignature: boolean;
}

export interface SponsorView {
  id: string;
  nom: string;
  url: string | null;
  logoUrl: string | null;
}

export interface PartenairesView {
  mode: SponsorMode;
  /** Option A : emplacement signature (flag, sinon premier sponsor). */
  signature: SponsorView | null;
  /** Option B : tous les emplacements, ordre de création. Option A : [signature]. */
  sponsors: SponsorView[];
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseSponsorMode(raw: unknown): SponsorMode | null {
  return raw === 'A' || raw === 'B' ? raw : null;
}

export function normalizeSponsorInput(raw: unknown): SponsorInput {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const text = (key: string): string | null => {
    const value = record[key];
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    name: text('name') ?? '',
    url: text('url'),
    logoUrl: text('logoUrl'),
  };
}

export function validateSponsorInput(input: SponsorInput): SponsorFieldErrors {
  const errors: SponsorFieldErrors = {};
  if (input.name === '') {
    errors.name = 'Le nom du sponsor est obligatoire.';
  } else if (input.name.length > MAX_SPONSOR_NAME_LENGTH) {
    errors.name = `${MAX_SPONSOR_NAME_LENGTH} caractères maximum pour le nom.`;
  }
  if (input.url !== null && !isHttpUrl(input.url)) {
    errors.url = 'L’adresse du site doit commencer par http:// ou https://.';
  }
  if (input.url !== null && input.url.length > MAX_SPONSOR_URL_LENGTH) {
    errors.url = `${MAX_SPONSOR_URL_LENGTH} caractères maximum pour l’adresse du site.`;
  }
  if (input.logoUrl !== null && !isHttpUrl(input.logoUrl)) {
    errors.logoUrl = 'L’adresse du logo doit commencer par http:// ou https://.';
  }
  if (input.logoUrl !== null && input.logoUrl.length > MAX_SPONSOR_URL_LENGTH) {
    errors.logoUrl = `${MAX_SPONSOR_URL_LENGTH} caractères maximum pour l’adresse du logo.`;
  }
  return errors;
}

/** Valeurs fournies non-chaîne (ex. url: 42) : refus champ nommé, jamais d’écrasement silencieux. */
export function sponsorTypeErrors(raw: unknown): SponsorFieldErrors {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const errors: SponsorFieldErrors = {};
  for (const key of SPONSOR_FIELD_ORDER) {
    const value = record[key];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors[key] = 'Ce champ doit être un texte (adresse ou nom).';
    }
  }
  return errors;
}

export function hasSponsorFieldErrors(errors: SponsorFieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

function toView(sponsor: ResolvableSponsor): SponsorView {
  return { id: sponsor.id, nom: sponsor.name, url: sponsor.url, logoUrl: sponsor.logoUrl };
}

/**
 * Résolution du rendu vitrine. Retourne null quand il n'y a aucun sponsor :
 * la section partenaires est alors absente de l'accueil (jamais de section vide).
 * Option A : signature effective = sponsor portant le flag, sinon premier sponsor.
 * Option B : tous les sponsors, équivalents, dans l'ordre de création.
 */
export function resolvePartenaires(
  mode: SponsorMode,
  sponsors: readonly ResolvableSponsor[],
): PartenairesView | null {
  if (sponsors.length === 0) {
    return null;
  }
  if (mode === 'A') {
    const flagged = sponsors.find((sponsor) => sponsor.isSignature);
    const signature = flagged ?? sponsors[0];
    if (signature === undefined) {
      return null;
    }
    const view = toView(signature);
    return { mode, signature: view, sponsors: [view] };
  }
  return {
    mode,
    signature: null,
    sponsors: sponsors.slice(0, MAX_EMPLOCHEMENTS_VITRINE).map(toView),
  };
}
