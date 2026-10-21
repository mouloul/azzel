import type { SessionRecord } from '@/modules/iam/store';

import {
  deriveAgeAndCategory,
  hasFieldErrors,
  isRegistrationOpen,
  normalizeInscriptionInput,
  validateInscriptionInput,
  type AgeCategory,
} from './domain';
import { InvalidFieldsError, RegistrationClosedError } from './errors';
import {
  getInscriptionsStore,
  type CoureurRecord,
  type EditionRecord,
  type EpreuveRecord,
  type InscriptionsStore,
} from './store';

export interface CoureurSummary {
  id: string;
  epreuve: string;
  epreuveNom: string;
  distanceKm: number;
  prenom: string;
  nom: string;
  telephone: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateNaissance: string;
  tailleTshirt: string;
  age: number;
  categorie: AgeCategory;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface EditionSummary {
  id: string;
  slug: string;
  nom: string;
  dateCourse: string;
  registrationClosesAt: string;
  registrationOpen: boolean;
}

export interface EpreuveSummary {
  id: string;
  slug: string;
  nom: string;
  distanceKm: number;
}

export interface InscriptionState {
  edition: EditionSummary | null;
  epreuves: EpreuveSummary[];
  coureur: CoureurSummary | null;
}

export interface InscriptionsServiceDeps {
  store?: InscriptionsStore;
}

function toCoureurSummary(record: CoureurRecord): CoureurSummary {
  return {
    id: record.id,
    epreuve: record.epreuveSlug,
    epreuveNom: record.epreuveNom,
    distanceKm: record.distanceKm,
    prenom: record.prenom,
    nom: record.nom,
    telephone: record.telephone,
    contactUrgenceNom: record.contactUrgenceNom,
    contactUrgenceTelephone: record.contactUrgenceTelephone,
    dateNaissance: record.dateNaissance,
    tailleTshirt: record.tailleTshirt,
    age: record.age,
    categorie: record.categorieAge as AgeCategory,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toEditionSummary(edition: EditionRecord): EditionSummary {
  return {
    id: edition.id,
    slug: edition.slug,
    nom: edition.nom,
    dateCourse: edition.dateCourse,
    registrationClosesAt: edition.registrationClosesAt.toISOString(),
    registrationOpen: isRegistrationOpen(edition.registrationClosesAt),
  };
}

function toEpreuveSummary(epreuve: EpreuveRecord): EpreuveSummary {
  return {
    id: epreuve.id,
    slug: epreuve.slug,
    nom: epreuve.nom,
    distanceKm: epreuve.distanceKm,
  };
}

export async function getInscriptionState(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<InscriptionState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, epreuves: [], coureur: null };
  }
  const epreuves = await store.listEpreuves(edition.id, session.organisationId);
  const coureur = await store.findCoureurByAccount(
    session.accountId,
    edition.id,
    session.organisationId,
  );
  return {
    edition: toEditionSummary(edition),
    epreuves: epreuves.map(toEpreuveSummary),
    coureur: coureur ? toCoureurSummary(coureur) : null,
  };
}

export async function submitInscription(
  session: SessionRecord,
  rawInput: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<CoureurSummary> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  if (!isRegistrationOpen(edition.registrationClosesAt)) {
    throw new RegistrationClosedError(edition.registrationClosesAt);
  }
  const epreuves = await store.listEpreuves(edition.id, session.organisationId);
  const input = normalizeInscriptionInput(rawInput);
  const errors = validateInscriptionInput(
    input,
    epreuves.map((epreuve) => epreuve.slug),
    edition.dateCourse,
  );
  if (hasFieldErrors(errors)) {
    throw new InvalidFieldsError(errors);
  }
  const epreuve = epreuves.find((candidate) => candidate.slug === input.epreuve);
  if (!epreuve) {
    throw new InvalidFieldsError({ epreuve: 'Choisis ton épreuve.' });
  }
  const derived = deriveAgeAndCategory(input.dateNaissance, edition.dateCourse);
  if (!derived) {
    throw new InvalidFieldsError({ dateNaissance: 'Date de naissance invalide.' });
  }
  const record = await store.upsertCoureur({
    organisationId: session.organisationId,
    accountId: session.accountId,
    editionId: edition.id,
    epreuveId: epreuve.id,
    prenom: input.prenom,
    nom: input.nom,
    telephone: input.telephone,
    contactUrgenceNom: input.contactUrgenceNom,
    contactUrgenceTelephone: input.contactUrgenceTelephone,
    dateNaissance: input.dateNaissance,
    tailleTshirt: input.tailleTshirt,
    age: derived.age,
    categorieAge: derived.category,
  });
  return toCoureurSummary(record);
}
