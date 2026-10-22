import type { SessionRecord } from '@/modules/iam/store';

import {
  DEFAULT_SPONSOR_MODE,
  hasSponsorFieldErrors,
  normalizeSponsorInput,
  parseSponsorMode,
  resolvePartenaires,
  sponsorTypeErrors,
  validateSponsorInput,
  type PartenairesView,
  type SponsorFieldErrors,
  type SponsorMode,
} from './domain';
import {
  InvalidSponsorFieldsError,
  SponsorModeInvalidError,
  SponsorNotFoundError,
} from './errors';
import { getSponsorsStore, type SponsorsStore, type SponsorRecord } from './store';

export interface SponsorSummary {
  id: string;
  nom: string;
  url: string | null;
  logoUrl: string | null;
  signature: boolean;
  createdAt: string;
}

export interface SponsorsAdminState {
  mode: SponsorMode;
  sponsors: SponsorSummary[];
}

export interface SponsorsServiceDeps {
  store?: SponsorsStore;
}

function toSponsorSummary(record: SponsorRecord): SponsorSummary {
  return {
    id: record.id,
    nom: record.name,
    url: record.url,
    logoUrl: record.logoUrl,
    signature: record.isSignature,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getSponsorsAdminState(
  session: SessionRecord,
  deps: SponsorsServiceDeps = {},
): Promise<SponsorsAdminState> {
  const store = deps.store ?? getSponsorsStore();
  const [config, sponsors] = await Promise.all([
    store.findConfig(session.organisationId),
    store.listSponsors(session.organisationId),
  ]);
  return {
    mode: config?.mode ?? DEFAULT_SPONSOR_MODE,
    sponsors: sponsors.map(toSponsorSummary),
  };
}

/**
 * Valide le sponsor : champs normalisés (requis, formats, longueurs) + types
 * bruts fournis (une url/logoUrl non-chaîne comme 42 est refusée champ nommé —
 * jamais d'écrasement silencieux de la valeur existante en PATCH).
 */
function assertSponsorInputValide(raw: unknown, input: ReturnType<typeof normalizeSponsorInput>): void {
  const errors: SponsorFieldErrors = {
    ...validateSponsorInput(input),
    ...sponsorTypeErrors(raw),
  };
  if (hasSponsorFieldErrors(errors)) {
    throw new InvalidSponsorFieldsError(errors);
  }
}

function signatureFlag(raw: unknown): boolean {
  return (
    typeof raw === 'object' && raw !== null && (raw as { signature?: unknown }).signature === true
  );
}

export async function createSponsor(
  session: SessionRecord,
  rawInput: unknown,
  deps: SponsorsServiceDeps = {},
): Promise<SponsorSummary> {
  const store = deps.store ?? getSponsorsStore();
  const input = normalizeSponsorInput(rawInput);
  assertSponsorInputValide(rawInput, input);
  const record = await store.createSponsor({
    organisationId: session.organisationId,
    name: input.name,
    url: input.url,
    logoUrl: input.logoUrl,
    isSignature: signatureFlag(rawInput),
  });
  return toSponsorSummary(record);
}

export async function updateSponsor(
  session: SessionRecord,
  sponsorId: string,
  rawInput: unknown,
  deps: SponsorsServiceDeps = {},
): Promise<SponsorSummary> {
  const store = deps.store ?? getSponsorsStore();
  const existing = await store.findSponsorById(sponsorId, session.organisationId);
  if (!existing) {
    throw new SponsorNotFoundError();
  }
  const raw =
    typeof rawInput === 'object' && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
  const merged = normalizeSponsorInput({
    name: 'name' in raw ? raw.name : existing.name,
    url: 'url' in raw ? raw.url : existing.url,
    logoUrl: 'logoUrl' in raw ? raw.logoUrl : existing.logoUrl,
  });
  // Types bruts du corps : url: 42 est refusé au lieu d'écraser l'existante.
  assertSponsorInputValide(rawInput, merged);
  const isSignature = 'signature' in raw ? signatureFlag(raw) : existing.isSignature;
  const record = await store.updateSponsor(sponsorId, {
    organisationId: session.organisationId,
    name: merged.name,
    url: merged.url,
    logoUrl: merged.logoUrl,
    isSignature,
  });
  if (!record) {
    throw new SponsorNotFoundError();
  }
  return toSponsorSummary(record);
}

export async function deleteSponsor(
  session: SessionRecord,
  sponsorId: string,
  deps: SponsorsServiceDeps = {},
): Promise<{ ok: true }> {
  const store = deps.store ?? getSponsorsStore();
  const deleted = await store.deleteSponsor(sponsorId, session.organisationId);
  if (!deleted) {
    throw new SponsorNotFoundError();
  }
  return { ok: true };
}

export async function setSponsorMode(
  session: SessionRecord,
  rawInput: unknown,
  deps: SponsorsServiceDeps = {},
): Promise<{ mode: SponsorMode; updatedAt: string }> {
  const store = deps.store ?? getSponsorsStore();
  const raw =
    typeof rawInput === 'object' && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
  const mode = parseSponsorMode(raw.mode);
  if (mode === null) {
    throw new SponsorModeInvalidError();
  }
  const config = await store.setConfig({ organisationId: session.organisationId, mode });
  return { mode: config.mode, updatedAt: config.updatedAt.toISOString() };
}

/**
 * Lecture dynamique de la section partenaires pour l'accueil public —
 * le mécanisme du « bascule sans dev » de FR-22 : chaque requête relit la base.
 * Ne lève JAMAIS : config absente, base indisponible ou table vide → null,
 * la vitrine masque la section au lieu de casser.
 */
export async function getPartenairesSection(
  deps: SponsorsServiceDeps = {},
): Promise<PartenairesView | null> {
  const store = deps.store ?? getSponsorsStore();
  try {
    const { mode, sponsors } = await store.readDefaultOrgPartenaires();
    return resolvePartenaires(mode, sponsors);
  } catch (error) {
    console.warn(
      '[vitrine] section partenaires masquée :',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
