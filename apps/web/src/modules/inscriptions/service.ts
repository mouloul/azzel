import type { SessionRecord } from '@/modules/iam/store';
import { processOutbox, type OutboxProcessSummary } from '@/modules/notifications/worker';

import {
  AGE_CATEGORY_LABELS,
  COUREUR_STATUS_REFUSE,
  COUREUR_STATUS_VALIDE,
  canDepositPreuve,
  deriveAgeAndCategory,
  documentTitle,
  hasFieldErrors,
  isRegistrationOpen,
  normalizeInscriptionInput,
  normalizeRefusalReason,
  validateInscriptionInput,
  MAX_REFUSAL_REASON_LENGTH,
  type AgeCategory,
} from './domain';
import {
  BothAcceptancesRequiredError,
  DecisionInvalidError,
  InvalidFieldsError,
  RefusalReasonRequiredError,
  RefusalReasonTooLongError,
  RegistrationClosedError,
} from './errors';
import {
  getInscriptionsStore,
  type CoureurRecord,
  type DossierDecision,
  type DossierListItem,
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
  refusalReason: string | null;
  dechargeAccepte: { acceptedAt: string; version: string } | null;
  reglementAccepte: { acceptedAt: string; version: string } | null;
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
  triggerOutbox?: (limit?: number) => Promise<OutboxProcessSummary | void>;
}

// Envoi best effort post-événement : jamais bloquant pour le parcours coureur
// (FR-6) — erreurs avalées + log, le rejeu repasse par emails:send.
function notifyOutbox(deps: InscriptionsServiceDeps): void {
  const trigger = deps.triggerOutbox ?? processOutbox;
  void (async () => {
    try {
      await trigger();
    } catch (error) {
      console.error('[notifications] envoi best effort après événement a échoué :', error);
    }
  })();
}

function acceptanceSummary(
  acceptedAt: Date | null,
  version: string | null,
): { acceptedAt: string; version: string } | null {
  if (acceptedAt === null || version === null) {
    return null;
  }
  return { acceptedAt: acceptedAt.toISOString(), version };
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
    refusalReason: record.refusalReason,
    dechargeAccepte: acceptanceSummary(record.dechargeAcceptedAt, record.dechargeVersion),
    reglementAccepte: acceptanceSummary(record.reglementAcceptedAt, record.reglementVersion),
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
  notifyOutbox(deps);
  return toCoureurSummary(record);
}

export interface DocumentSummary {
  slug: string;
  titre: string;
  version: string;
  content: string;
}

export interface AcceptanceSummary {
  acceptedAt: string;
  version: string;
}

export interface AcceptancesState {
  edition: EditionSummary | null;
  coureurStatus: string | null;
  documents: DocumentSummary[];
  acceptances: {
    decharge: AcceptanceSummary | null;
    reglement: AcceptanceSummary | null;
  };
}

export interface AcceptancesResult {
  decharge: AcceptanceSummary;
  reglement: AcceptanceSummary;
}

export function normalizeAcceptancesInput(raw: unknown): { decharge: boolean; reglement: boolean } {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    decharge: record.decharge === true,
    reglement: record.reglement === true,
  };
}

export async function getAcceptancesState(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<AcceptancesState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return {
      edition: null,
      coureurStatus: null,
      documents: [],
      acceptances: { decharge: null, reglement: null },
    };
  }
  const [documents, coureur] = await Promise.all([
    store.findDocuments(session.organisationId),
    store.findCoureurByAccount(session.accountId, edition.id, session.organisationId),
  ]);
  return {
    edition: toEditionSummary(edition),
    coureurStatus: coureur ? coureur.status : null,
    documents: documents.map((document) => ({
      slug: document.slug,
      titre: documentTitle(document.slug),
      version: document.version,
      content: document.content,
    })),
    acceptances: {
      decharge: coureur ? acceptanceSummary(coureur.dechargeAcceptedAt, coureur.dechargeVersion) : null,
      reglement: coureur
        ? acceptanceSummary(coureur.reglementAcceptedAt, coureur.reglementVersion)
        : null,
    },
  };
}

export async function acceptDocuments(
  session: SessionRecord,
  rawInput: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<AcceptancesResult> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  const input = normalizeAcceptancesInput(rawInput);
  if (!input.decharge || !input.reglement) {
    throw new BothAcceptancesRequiredError();
  }
  const snapshot = await store.acceptDocuments({
    organisationId: session.organisationId,
    accountId: session.accountId,
    editionId: edition.id,
  });
  return {
    decharge: {
      acceptedAt: snapshot.dechargeAcceptedAt.toISOString(),
      version: snapshot.dechargeVersion,
    },
    reglement: {
      acceptedAt: snapshot.reglementAcceptedAt.toISOString(),
      version: snapshot.reglementVersion,
    },
  };
}

export const CHECKLIST_VALIDATION_EN_ATTENTE = 'En attente de validation par l’organisation';

export const CHECKLIST_PREUVE_INDISPONIBLE = 'Indisponible (réessaie plus tard)';

export type ChecklistPieceId =
  | 'email'
  | 'epreuve'
  | 'decharge'
  | 'reglement'
  | 'preuve'
  | 'validation';

export interface ChecklistPiece {
  id: ChecklistPieceId;
  libelle: string;
  fait: boolean;
  actionLabel?: string;
  actionHref?: string;
  texteSecondaire?: string;
  motifRefus?: string;
}

export interface ChecklistRecap {
  epreuve: string;
  distanceKm: number;
  categorieAge: string;
  tshirt: string;
  contactUrgenceNom: string;
  contactUrgenceTelephone: string;
  dateCourse: string;
}

export interface ChecklistState {
  edition: EditionSummary | null;
  pieces: ChecklistPiece[];
  recap: ChecklistRecap | null;
}

function checklistPiece(
  id: ChecklistPieceId,
  libelle: string,
  fait: boolean,
  extras: {
    action?: { label: string; href?: string } | null;
    texteSecondaire?: string | null;
    motifRefus?: string | null;
  } = {},
): ChecklistPiece {
  const action = extras.action;
  return {
    id,
    libelle,
    fait,
    ...(action != null ? { actionLabel: action.label } : {}),
    ...(action?.href != null ? { actionHref: action.href } : {}),
    ...(extras.texteSecondaire != null ? { texteSecondaire: extras.texteSecondaire } : {}),
    ...(extras.motifRefus != null ? { motifRefus: extras.motifRefus } : {}),
  };
}

export async function getChecklistState(
  session: SessionRecord,
  deps: InscriptionsServiceDeps = {},
): Promise<ChecklistState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, pieces: [], recap: null };
  }
  const [coureurSettled, preuveSettled] = await Promise.allSettled([
    store.findCoureurByAccount(session.accountId, edition.id, session.organisationId),
    store.findActivePreuveByAccount(session.accountId, edition.id, session.organisationId),
  ]);
  if (coureurSettled.status === 'rejected') {
    throw coureurSettled.reason;
  }
  const coureur = coureurSettled.value;
  const preuve = preuveSettled.status === 'fulfilled' ? preuveSettled.value : null;
  const preuveIndisponible = preuveSettled.status === 'rejected';

  const inscriptionsOuvertes = isRegistrationOpen(edition.registrationClosesAt);
  const neutraliseSiFermees = (
    action: { label: string; href?: string } | null,
  ): { label: string; href?: string } | null => {
    if (action === null || action.href == null || inscriptionsOuvertes) {
      return action;
    }
    return { label: 'Inscriptions fermées' };
  };

  const dechargeFait =
    coureur !== null &&
    coureur.dechargeAcceptedAt !== null &&
    coureur.dechargeVersion !== null;
  const reglementFait =
    coureur !== null &&
    coureur.reglementAcceptedAt !== null &&
    coureur.reglementVersion !== null;
  const refuse = coureur !== null && coureur.status === COUREUR_STATUS_REFUSE;
  const validationFait = coureur !== null && coureur.status === COUREUR_STATUS_VALIDE;
  const peutDeposer = coureur === null || canDepositPreuve(coureur.status);

  let actionPreuve: { label: string; href?: string } | null = null;
  if (!preuveIndisponible) {
    actionPreuve = neutraliseSiFermees(
      preuve !== null
        ? peutDeposer
          ? { label: 'Remplacer ma preuve de paiement', href: '/preuve' }
          : null
        : peutDeposer
          ? { label: 'Dépose ta preuve de paiement CCP', href: '/preuve' }
          : null,
    );
  }

  const pieces: ChecklistPiece[] = [
    checklistPiece('email', 'Email vérifié', true),
    checklistPiece('epreuve', 'Épreuve choisie', coureur !== null, {
      action: neutraliseSiFermees(
        coureur === null
          ? { label: `M’inscrire à l’édition ${edition.slug}`, href: '/inscription' }
          : inscriptionsOuvertes
            ? { label: 'Modifier mon inscription', href: '/inscription' }
            : null,
      ),
    }),
    checklistPiece('decharge', 'Décharge acceptée', dechargeFait, {
      action: dechargeFait
        ? null
        : { label: 'Accepter la décharge et le règlement', href: '/acceptations' },
    }),
    checklistPiece('reglement', 'Règlement accepté', reglementFait, {
      action: reglementFait
        ? null
        : { label: 'Les deux documents s’acceptent ensemble' },
    }),
    checklistPiece('preuve', 'Preuve de paiement CCP déposée', preuve !== null, {
      action: preuveIndisponible ? null : actionPreuve,
      texteSecondaire: preuveIndisponible ? CHECKLIST_PREUVE_INDISPONIBLE : null,
    }),
    checklistPiece('validation', 'Dossier validé', validationFait, {
      action: neutraliseSiFermees(
        refuse && coureur !== null && canDepositPreuve(coureur.status)
          ? { label: 'Déposer une nouvelle preuve', href: '/preuve' }
          : null,
      ),
      texteSecondaire:
        coureur !== null && !validationFait && !refuse
          ? CHECKLIST_VALIDATION_EN_ATTENTE
          : null,
      motifRefus: refuse ? coureur.refusalReason : null,
    }),
  ];

  const recap: ChecklistRecap | null =
    coureur === null
      ? null
      : {
          epreuve: coureur.epreuveNom,
          distanceKm: coureur.distanceKm,
          categorieAge:
            AGE_CATEGORY_LABELS[coureur.categorieAge as AgeCategory] ?? coureur.categorieAge,
          tshirt: coureur.tailleTshirt,
          contactUrgenceNom: coureur.contactUrgenceNom,
          contactUrgenceTelephone: coureur.contactUrgenceTelephone,
          dateCourse: edition.dateCourse,
        };

  return { edition: toEditionSummary(edition), pieces, recap };
}

export interface DossierListEntry {
  coureurId: string;
  prenom: string;
  nom: string;
  email: string;
  epreuveNom: string;
  status: string;
  refusalReason: string | null;
  hasActivePreuve: boolean;
  preuveDepositedAt: string | null;
  acceptationsCompletes: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DossiersState {
  edition: EditionSummary | null;
  dossiers: DossierListEntry[];
  hasMore: boolean;
}

export interface AdminPreuveSummary {
  id: string;
  depositedAt: string;
  sizeBytes: number;
  mime: string;
}

export interface DossierDetailSummary {
  coureur: CoureurSummary;
  email: string;
  preuveActive: AdminPreuveSummary | null;
  decidePar: { email: string; decidedAt: string } | null;
}

function toDossierListEntry(item: DossierListItem): DossierListEntry {
  return {
    coureurId: item.coureurId,
    prenom: item.prenom,
    nom: item.nom,
    email: item.email,
    epreuveNom: item.epreuveNom,
    status: item.status,
    refusalReason: item.refusalReason,
    hasActivePreuve: item.hasActivePreuve,
    preuveDepositedAt: item.preuveDepositedAt ? item.preuveDepositedAt.toISOString() : null,
    acceptationsCompletes: item.acceptationsCompletes,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function getDossiersState(
  session: SessionRecord,
  rawSearch?: string | null,
  deps: InscriptionsServiceDeps = {},
): Promise<DossiersState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, dossiers: [], hasMore: false };
  }
  const search = typeof rawSearch === 'string' ? rawSearch.trim() : '';
  const list = await store.listCoureurs({
    organisationId: session.organisationId,
    editionId: edition.id,
    search: search.length > 0 ? search.slice(0, 100) : undefined,
  });
  return {
    edition: toEditionSummary(edition),
    dossiers: list.items.map(toDossierListEntry),
    hasMore: list.hasMore,
  };
}

export async function getDossierDetail(
  session: SessionRecord,
  coureurId: string,
  deps: InscriptionsServiceDeps = {},
): Promise<DossierDetailSummary | null> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return null;
  }
  const detail = await store.findDossierDetail({
    organisationId: session.organisationId,
    editionId: edition.id,
    coureurId,
  });
  if (!detail) {
    return null;
  }
  return {
    coureur: toCoureurSummary(detail.coureur),
    email: detail.email,
    preuveActive: detail.preuveActive
      ? {
          id: detail.preuveActive.id,
          depositedAt: detail.preuveActive.createdAt.toISOString(),
          sizeBytes: detail.preuveActive.sizeBytes,
          mime: detail.preuveActive.mime,
        }
      : null,
    decidePar: detail.decidePar
      ? { email: detail.decidePar.email, decidedAt: detail.decidePar.decidedAt.toISOString() }
      : null,
  };
}

export function normalizeDecisionInput(
  raw: unknown,
): { decision: DossierDecision; refusalReason: string | null } {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const decision = record.decision;
  if (decision !== 'valider' && decision !== 'refuser') {
    throw new DecisionInvalidError();
  }
  if (decision === 'valider') {
    return { decision, refusalReason: null };
  }
  const refusalReason = normalizeRefusalReason(record.motif);
  if (refusalReason.length === 0) {
    throw new RefusalReasonRequiredError();
  }
  if (refusalReason.length > MAX_REFUSAL_REASON_LENGTH) {
    throw new RefusalReasonTooLongError(MAX_REFUSAL_REASON_LENGTH);
  }
  return { decision, refusalReason };
}

export async function decideDossier(
  session: SessionRecord,
  coureurId: string,
  rawInput: unknown,
  deps: InscriptionsServiceDeps = {},
): Promise<CoureurSummary> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new Error('Aucune édition configurée : exécute pnpm -F @azzel/web db:migrate');
  }
  const input = normalizeDecisionInput(rawInput);
  const record = await store.decideDossier({
    organisationId: session.organisationId,
    editionId: edition.id,
    coureurId,
    decision: input.decision,
    refusalReason: input.refusalReason,
    decidedBy: session.accountId,
  });
  notifyOutbox(deps);
  return toCoureurSummary(record);
}
