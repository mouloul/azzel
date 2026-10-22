import type { SessionRecord } from '@/modules/iam/store';

import {
  CONTENU_SLUGS,
  PARCOURS_SLUGS,
  REGION_SLUGS,
  SLUGS_EPREUVES_PARCOURS,
  estBaliséÀConfirmer,
  hasContenuFieldErrors,
  isContenuSlug,
  normalizeContenuInput,
  ordonnerParSlugs,
  validateContenuInput,
  contenuTypeErrors,
  type ContenuFieldErrors,
  type ContenuSlug,
} from './domain';
import {
  ContenuConflitError,
  ContenuNotFoundError,
  InvalidContenuFieldsError,
} from './errors';
import { DbUnavailableError } from '@/modules/iam/errors';
import {
  getContenusStore,
  type ContenuRecord,
  type ContenusStore,
  type EpreuveParcoursRecord,
} from './store';

export interface EpreuveView {
  slug: string;
  nom: string;
  distanceKm: number;
  gpxUrl: string | null;
}

export interface ContenuBlocAdmin {
  slug: ContenuSlug;
  titre: string;
  corps: string;
  updatedAt: string;
  aConfirmer: boolean;
  /** Renseigné pour les blocs parcours (URL GPX + distance de l'épreuve associée). */
  epreuve: EpreuveView | null;
}

export interface ContenusAdminState {
  blocs: ContenuBlocAdmin[];
}

export interface ParcoursBlocView {
  slug: ContenuSlug;
  titre: string;
  corps: string;
  epreuve: EpreuveView | null;
}

export interface ParcoursPageView {
  blocs: ParcoursBlocView[];
}

export interface RegionBlocView {
  slug: ContenuSlug;
  titre: string;
  corps: string;
}

export interface RegionPageView {
  blocs: RegionBlocView[];
}

export const PARCOURS_PAGE_VIDE: ParcoursPageView = { blocs: [] };
export const REGION_PAGE_VIDE: RegionPageView = { blocs: [] };

export interface ContenusServiceDeps {
  store?: ContenusStore;
}

function toEpreuveView(record: EpreuveParcoursRecord): EpreuveView {
  return {
    slug: record.slug,
    nom: record.nom,
    distanceKm: record.distanceKm,
    gpxUrl: record.gpxUrl,
  };
}

function toBlocAdmin(
  record: ContenuRecord,
  epreuve: EpreuveParcoursRecord | null,
): ContenuBlocAdmin {
  return {
    slug: record.slug as ContenuSlug,
    titre: record.titre,
    corps: record.corps,
    updatedAt: record.updatedAt.toISOString(),
    aConfirmer: estBaliséÀConfirmer(record.corps),
    epreuve: epreuve ? toEpreuveView(epreuve) : null,
  };
}

export async function getContenusAdminState(
  session: SessionRecord,
  deps: ContenusServiceDeps = {},
): Promise<ContenusAdminState> {
  const store = deps.store ?? getContenusStore();
  const [contenus, epreuves] = await Promise.all([
    store.listContenusBySlugs(session.organisationId, CONTENU_SLUGS),
    store.listEpreuvesParcours(session.organisationId),
  ]);
  const epreuveParSlug = new Map(epreuves.map((epreuve) => [epreuve.slug, epreuve]));
  return {
    blocs: ordonnerParSlugs(contenus, CONTENU_SLUGS).map((record) => {
      const epreuveSlug = SLUGS_EPREUVES_PARCOURS[
        record.slug as keyof typeof SLUGS_EPREUVES_PARCOURS
      ];
      return toBlocAdmin(record, epreuveSlug ? (epreuveParSlug.get(epreuveSlug) ?? null) : null);
    }),
  };
}

export async function getContenu(
  session: SessionRecord,
  slug: string,
  deps: ContenusServiceDeps = {},
): Promise<ContenuBlocAdmin> {
  const store = deps.store ?? getContenusStore();
  if (!isContenuSlug(slug)) {
    throw new ContenuNotFoundError();
  }
  const [record, epreuves] = await Promise.all([
    store.findContenuBySlug(session.organisationId, slug),
    store.listEpreuvesParcours(session.organisationId),
  ]);
  if (!record) {
    throw new ContenuNotFoundError();
  }
  const epreuveSlug = SLUGS_EPREUVES_PARCOURS[slug as keyof typeof SLUGS_EPREUVES_PARCOURS];
  const epreuve = epreuveSlug
    ? ((epreuves.find((candidate) => candidate.slug === epreuveSlug) ?? null))
    : null;
  return toBlocAdmin(record, epreuve);
}

/**
 * Écrit un bloc (titre, corps) et, pour les blocs parcours, l'URL GPX de
 * l'épreuve associée si le corps de requête la fournit (fusion : clé absente =
 * valeur conservée). Validation : titre ≤ 120, corps ≤ 20 000, gpx https
 * facultative ; gpxUrl sur un bloc sans tracé → erreur champ nommé.
 *
 * Verrou optimiste : un bloc EXISTANT exige `updatedAt` = version lue (ISO,
 * celle renvoyée par l'API) ; décalée ou absente → 409 conflit. Un bloc ABSENT
 * est créé (upsert — organisation non seedée). La course concurrente entre
 * lecture et écriture est rattrapée au store (0 ligne → 409).
 */
export async function updateContenu(
  session: SessionRecord,
  slug: string,
  rawInput: unknown,
  deps: ContenusServiceDeps = {},
): Promise<ContenuBlocAdmin> {
  const store = deps.store ?? getContenusStore();
  if (!isContenuSlug(slug)) {
    throw new ContenuNotFoundError();
  }
  const raw =
    typeof rawInput === 'object' && rawInput !== null ? (rawInput as Record<string, unknown>) : {};
  const existing = await store.findContenuBySlug(session.organisationId, slug);
  let ancienUpdatedAt: Date | null = null;
  if (existing) {
    ancienUpdatedAt = existing.updatedAt;
    if (raw.updatedAt !== existing.updatedAt.toISOString()) {
      throw new ContenuConflitError();
    }
  }
  const epreuveSlug =
    SLUGS_EPREUVES_PARCOURS[slug as keyof typeof SLUGS_EPREUVES_PARCOURS] ?? null;
  // gpxUrl absente du corps → null : jamais validée ni écrite (fusion au niveau
  // store, l'URL existante est conservée).
  const merged = normalizeContenuInput({
    titre: 'titre' in raw ? raw.titre : (existing?.titre ?? ''),
    corps: 'corps' in raw ? raw.corps : (existing?.corps ?? ''),
    gpxUrl: 'gpxUrl' in raw ? raw.gpxUrl : null,
  });
  const errors: ContenuFieldErrors = {
    ...validateContenuInput(merged),
    ...contenuTypeErrors(rawInput),
  };
  if ('gpxUrl' in raw && epreuveSlug === null) {
    errors.gpxUrl = 'Cette section n’a pas de tracé GPX.';
  }
  if (hasContenuFieldErrors(errors)) {
    throw new InvalidContenuFieldsError(errors);
  }
  const gpxFourni = 'gpxUrl' in raw && epreuveSlug !== null;
  const result = await store.saveContenu({
    organisationId: session.organisationId,
    slug,
    titre: merged.titre,
    corps: merged.corps,
    ancienUpdatedAt,
    gpx: gpxFourni && epreuveSlug !== null ? { epreuveSlug, url: merged.gpxUrl } : undefined,
  });
  if (!result) {
    // Version obsolète entre la lecture et l'écriture (course concurrente).
    throw new ContenuConflitError();
  }
  // Relecture de l'épreuve effective quand l'URL GPX n'était pas fournie
  // (l'épreuve retournée par le store est alors absente de la fusion).
  let epreuve = result.epreuve;
  if (epreuveSlug !== null && !gpxFourni) {
    const epreuves = await store.listEpreuvesParcours(session.organisationId);
    epreuve = epreuves.find((candidate) => candidate.slug === epreuveSlug) ?? null;
  }
  return toBlocAdmin(result.contenu, epreuve);
}

/**
 * Lecture dynamique de la page /parcours — chaque requête relit la base : les
 * modifications de l'organisateur sont visibles au rechargement, sans
 * redéploiement. Seule une PANNE DE BASE dégrade en blocs vides (warning, la
 * page rend sa coquille statique) ; toute autre erreur est repropagée — un bug
 * de code doit éclater (page d'erreur Next), pas se taire.
 */
export async function getParcoursPage(
  deps: ContenusServiceDeps = {},
): Promise<ParcoursPageView> {
  const store = deps.store ?? getContenusStore();
  try {
    const { contenus, epreuves } = await store.readDefaultOrgPageParcours();
    const epreuveParSlug = new Map(epreuves.map((epreuve) => [epreuve.slug, epreuve]));
    return {
      blocs: ordonnerParSlugs(contenus, PARCOURS_SLUGS).map((record) => {
        const epreuveSlug =
          SLUGS_EPREUVES_PARCOURS[record.slug as keyof typeof SLUGS_EPREUVES_PARCOURS];
        return {
          slug: record.slug as ContenuSlug,
          titre: record.titre,
          corps: record.corps,
          epreuve: epreuveSlug ? ((epreuveParSlug.get(epreuveSlug) ?? null)) : null,
        };
      }),
    };
  } catch (error) {
    if (!(error instanceof DbUnavailableError)) {
      throw error;
    }
    console.warn(
      '[vitrine] page parcours sans contenu dynamique (base indisponible) :',
      error.message,
    );
    return PARCOURS_PAGE_VIDE;
  }
}

/** Lecture dynamique de la page /region — mêmes garanties que getParcoursPage. */
export async function getRegionPage(
  deps: ContenusServiceDeps = {},
): Promise<RegionPageView> {
  const store = deps.store ?? getContenusStore();
  try {
    const { contenus } = await store.readDefaultOrgPageRegion();
    return {
      blocs: ordonnerParSlugs(contenus, REGION_SLUGS).map((record) => ({
        slug: record.slug as ContenuSlug,
        titre: record.titre,
        corps: record.corps,
      })),
    };
  } catch (error) {
    if (!(error instanceof DbUnavailableError)) {
      throw error;
    }
    console.warn(
      '[vitrine] page région sans contenu dynamique (base indisponible) :',
      error.message,
    );
    return REGION_PAGE_VIDE;
  }
}

export { PARCOURS_SLUGS, REGION_SLUGS };
