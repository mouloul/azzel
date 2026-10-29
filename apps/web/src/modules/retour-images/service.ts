import type { SessionRecord } from '@/modules/iam/store';
import { DbUnavailableError } from '@/modules/iam/errors';

import {
  RETOUR_IMAGES_PAGE_VIDE,
  hasTemoignageFieldErrors,
  normalizeTemoignageInput,
  normalizeTrailerUrlInput,
  ordreTypeError,
  resolveRetourImagesPage,
  temoignageTypeErrors,
  trailerUrlTypeError,
  validateTemoignageInput,
  validateTrailerUrl,
  type RetourImagesPageView,
  type TemoignageFieldErrors,
} from './domain';
import {
  InvalidTemoignageFieldsError,
  InvalidTrailerUrlError,
  TemoignageNotFoundError,
} from './errors';
import {
  getRetourImagesStore,
  type RetourImagesStore,
  type TemoignageRecord,
} from './store';

export interface TemoignageSummary {
  id: string;
  citation: string;
  prenom: string;
  editionReference: string;
  ordre: number;
  createdAt: string;
}

export interface RetourImagesAdminState {
  trailerUrl: string | null;
  temoignages: TemoignageSummary[];
}

export interface RetourImagesServiceDeps {
  store?: RetourImagesStore;
}

function toTemoignageSummary(record: TemoignageRecord): TemoignageSummary {
  return {
    id: record.id,
    citation: record.citation,
    prenom: record.prenom,
    editionReference: record.editionReference,
    ordre: record.ordre,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function getRetourImagesAdminState(
  session: SessionRecord,
  deps: RetourImagesServiceDeps = {},
): Promise<RetourImagesAdminState> {
  const store = deps.store ?? getRetourImagesStore();
  const [config, temoignages] = await Promise.all([
    store.findMediaConfig(session.organisationId),
    store.listTemoignages(session.organisationId),
  ]);
  return {
    trailerUrl: config?.trailerUrl ?? null,
    temoignages: temoignages.map(toTemoignageSummary),
  };
}

/**
 * Écrit l'URL du trailer (PUT config) : vide → null (la vidéo est retirée, le
 * bloc public disparaît) ; sinon URL https valide exigée — le refus est champ
 * nommé (400), comme le GPX de la story 2.4.
 */
export async function setTrailerUrl(
  session: SessionRecord,
  rawInput: unknown,
  deps: RetourImagesServiceDeps = {},
): Promise<{ trailerUrl: string | null; updatedAt: string }> {
  const store = deps.store ?? getRetourImagesStore();
  // Clé absente ≠ « effacer » : un PUT {} supprimait le trailer configuré sans
  // un mot, à rebours de la convention des services frères (clé absente =
  // valeur conservée). Pour retirer la vidéo, on envoie trailerUrl: null ou "".
  if (
    typeof rawInput !== 'object' ||
    rawInput === null ||
    !('trailerUrl' in (rawInput as Record<string, unknown>))
  ) {
    throw new InvalidTrailerUrlError({ trailerUrl: 'Adresse de la vidéo attendue (ou vide pour la retirer).' });
  }
  const { trailerUrl } = normalizeTrailerUrlInput(rawInput);
  const erreurType = trailerUrlTypeError(rawInput);
  const erreurUrl = validateTrailerUrl(trailerUrl);
  if (erreurType !== null || erreurUrl !== null) {
    throw new InvalidTrailerUrlError({ trailerUrl: erreurType ?? erreurUrl ?? '' });
  }
  const config = await store.setTrailerUrl({
    organisationId: session.organisationId,
    trailerUrl,
  });
  return { trailerUrl: config.trailerUrl, updatedAt: config.updatedAt.toISOString() };
}

/** Valide le témoignage : champs normalisés (requis, longueurs) + types bruts. */
function assertTemoignageValide(
  raw: unknown,
  input: ReturnType<typeof normalizeTemoignageInput>,
): void {
  const erreurOrdre = ordreTypeError(raw);
  const errors: TemoignageFieldErrors = {
    ...validateTemoignageInput(input),
    ...temoignageTypeErrors(raw),
    ...(erreurOrdre !== null ? { ordre: erreurOrdre } : {}),
  };
  if (hasTemoignageFieldErrors(errors)) {
    throw new InvalidTemoignageFieldsError(errors);
  }
}

export async function createTemoignage(
  session: SessionRecord,
  rawInput: unknown,
  deps: RetourImagesServiceDeps = {},
): Promise<TemoignageSummary> {
  const store = deps.store ?? getRetourImagesStore();
  const input = normalizeTemoignageInput(rawInput);
  assertTemoignageValide(rawInput, input);
  const record = await store.createTemoignage({
    organisationId: session.organisationId,
    citation: input.citation,
    prenom: input.prenom,
    editionReference: input.editionReference,
    ordre: input.ordre,
  });
  return toTemoignageSummary(record);
}

export async function updateTemoignage(
  session: SessionRecord,
  temoignageId: string,
  rawInput: unknown,
  deps: RetourImagesServiceDeps = {},
): Promise<TemoignageSummary> {
  const store = deps.store ?? getRetourImagesStore();
  const existing = await store.findTemoignageById(temoignageId, session.organisationId);
  if (!existing) {
    throw new TemoignageNotFoundError();
  }
  const raw =
    typeof rawInput === 'object' && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
  const merged = normalizeTemoignageInput({
    citation: 'citation' in raw ? raw.citation : existing.citation,
    prenom: 'prenom' in raw ? raw.prenom : existing.prenom,
    editionReference: 'editionReference' in raw ? raw.editionReference : existing.editionReference,
    // ordre absent du corps → conservé (fusion, jamais d'écrasement silencieux).
    ordre: 'ordre' in raw ? raw.ordre : existing.ordre,
  });
  assertTemoignageValide(rawInput, merged);
  const record = await store.updateTemoignage(temoignageId, {
    organisationId: session.organisationId,
    citation: merged.citation,
    prenom: merged.prenom,
    editionReference: merged.editionReference,
    ordre: merged.ordre,
  });
  if (!record) {
    throw new TemoignageNotFoundError();
  }
  return toTemoignageSummary(record);
}

export async function deleteTemoignage(
  session: SessionRecord,
  temoignageId: string,
  deps: RetourImagesServiceDeps = {},
): Promise<{ ok: true }> {
  const store = deps.store ?? getRetourImagesStore();
  const deleted = await store.deleteTemoignage(temoignageId, session.organisationId);
  if (!deleted) {
    throw new TemoignageNotFoundError();
  }
  return { ok: true };
}

/**
 * Lecture dynamique de la page publique /retour-en-images — chaque requête
 * relit la base. Seule une PANNE DE BASE dégrade en page vide (trailer absent,
 * section témoignages absente — la page rend intro + galerie) ; toute autre
 * erreur est repropagée (un bug de code doit éclater, pas se taire).
 */
export async function getRetourImagesPage(
  deps: RetourImagesServiceDeps = {},
): Promise<RetourImagesPageView> {
  const store = deps.store ?? getRetourImagesStore();
  try {
    const { trailerUrl, temoignages } = await store.readDefaultOrgRetourImages();
    return resolveRetourImagesPage({ trailerUrl, temoignages });
  } catch (error) {
    if (!(error instanceof DbUnavailableError)) {
      throw error;
    }
    console.warn(
      '[vitrine] page retour en images sans matière dynamique (base indisponible) :',
      error.message,
    );
    return RETOUR_IMAGES_PAGE_VIDE;
  }
}
