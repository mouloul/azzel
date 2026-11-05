import type { SessionRecord } from '@/modules/iam/store';

import { dateCourseAffichee, isRegistrationOpen } from './domain';
import {
  NoEditionError,
  NumeroTransactionInvalideError,
  PreuveNotFoundError,
  PreuveStorageError,
  ProofFormatError,
  ProofTooLargeError,
  RegistrationClosedError,
} from './errors';
import { normaliserNumeroTransaction } from './numero-transaction';
import { MAX_PROOF_BYTES, PROOF_FORMAT_LABELS, detectProofFormat, type ProofFormat } from './proof-format';
import { getProofStore, type ProofStore } from './proof-store';
import type { EditionSummary } from './service';
import {
  getInscriptionsStore,
  type EditionRecord,
  type InscriptionsStore,
  type PreuveRecord,
} from './store';

export interface PreuveSummary {
  id: string;
  depositedAt: string;
  sizeBytes: number;
  mime: string;
  format: string;
  /** null : preuve déposée avant la saisie du numéro. */
  numeroTransaction: string | null;
}

export interface PreuveState {
  edition: EditionSummary | null;
  coureurStatus: string | null;
  refusalReason: string | null;
  preuve: PreuveSummary | null;
  /** Story 9.4 (fil d'étapes) : les DEUX documents (décharge + règlement)
   *  sont acceptés — lu sur le même enregistrement coureur, aucune requête
   *  supplémentaire. N'alimente que l'affichage. */
  documentsAcceptes: boolean;
}

export interface PreuveServiceDeps {
  store?: InscriptionsStore;
  proofStore?: ProofStore;
}

function formatLabelForMime(mime: string): string {
  const entry = (Object.entries(PROOF_FORMAT_LABELS) as [ProofFormat, string][]).find(
    ([candidate]) =>
      mime === (candidate === 'pdf' ? 'application/pdf' : `image/${candidate}`),
  );
  return entry ? entry[1] : mime;
}

function toPreuveSummary(record: PreuveRecord): PreuveSummary {
  return {
    id: record.id,
    depositedAt: record.createdAt.toISOString(),
    sizeBytes: record.sizeBytes,
    mime: record.mime,
    format: formatLabelForMime(record.mime),
    numeroTransaction: record.numeroTransaction,
  };
}

function toEditionSummary(edition: EditionRecord): EditionSummary {
  const dateAffichee = dateCourseAffichee(edition.dateCourse, edition.dateCoursePublique);
  return {
    id: edition.id,
    slug: edition.slug,
    nom: edition.nom,
    dateCourse: edition.dateCourse,
    dateCourseLibelle: dateAffichee.libelle,
    dateCoursePhrase: dateAffichee.phrase,
    registrationClosesAt: edition.registrationClosesAt.toISOString(),
    registrationOpen: isRegistrationOpen(edition.registrationClosesAt),
  };
}

export async function getPreuveState(
  session: SessionRecord,
  deps: PreuveServiceDeps = {},
): Promise<PreuveState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return {
      edition: null,
      coureurStatus: null,
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    };
  }
  const coureur = await store.findCoureurByAccount(
    session.accountId,
    edition.id,
    session.organisationId,
  );
  const preuve = coureur
    ? await store.findActivePreuveByAccount(session.accountId, edition.id, session.organisationId)
    : null;
  return {
    edition: toEditionSummary(edition),
    coureurStatus: coureur ? coureur.status : null,
    refusalReason: coureur ? coureur.refusalReason : null,
    preuve: preuve ? toPreuveSummary(preuve) : null,
    documentsAcceptes:
      coureur !== null &&
      coureur.dechargeAcceptedAt !== null &&
      coureur.reglementAcceptedAt !== null,
  };
}

export interface UploadPreuveOptions extends PreuveServiceDeps {
  /**
   * Numéro de transaction du reçu. Le dépôt par l'API le EXIGE (voir la route) ;
   * il reste optionnel ici pour les dépôts programmatiques (jeu de données de
   * démonstration) qui n'ont pas de vrai reçu.
   */
  numeroTransaction?: string;
}

export async function uploadPreuve(
  session: SessionRecord,
  bytes: Uint8Array,
  deps: UploadPreuveOptions = {},
): Promise<PreuveSummary> {
  let numeroTransaction: string | null = null;
  if (deps.numeroTransaction !== undefined) {
    const lu = normaliserNumeroTransaction(deps.numeroTransaction);
    if (!lu.ok) {
      throw new NumeroTransactionInvalideError({ numeroTransaction: lu.message });
    }
    numeroTransaction = lu.numero;
  }
  const store = deps.store ?? getInscriptionsStore();
  const proofStore = deps.proofStore ?? getProofStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    throw new NoEditionError();
  }
  if (!isRegistrationOpen(edition.registrationClosesAt)) {
    throw new RegistrationClosedError(edition.registrationClosesAt);
  }
  const format = detectProofFormat(bytes);
  if (format === null) {
    throw new ProofFormatError();
  }
  if (bytes.byteLength > MAX_PROOF_BYTES) {
    throw new ProofTooLargeError(bytes.byteLength);
  }
  const file = await proofStore.put(bytes, format);
  let saved: { preuve: PreuveRecord; replaced: PreuveRecord | null };
  try {
    saved = await store.savePreuve({
      organisationId: session.organisationId,
      accountId: session.accountId,
      editionId: edition.id,
      file,
      numeroTransaction,
    });
  } catch (error) {
    await proofStore.remove(file.storageKey).catch(() => undefined);
    throw error;
  }
  if (saved.preuve.storageKey !== file.storageKey) {
    // déduplication décidée en transaction (même checksum) : la preuve existante reste
    // l'active, le fichier fraîchement écrit est orphelin — on le retire (best effort).
    await proofStore.remove(file.storageKey).catch(() => undefined);
  }
  return toPreuveSummary(saved.preuve);
}

export interface AdminPreuveFile {
  preuve: PreuveRecord;
  bytes: Uint8Array;
}

export async function readPreuveForOrganisation(
  session: SessionRecord,
  preuveId: string,
  deps: PreuveServiceDeps = {},
): Promise<AdminPreuveFile> {
  const store = deps.store ?? getInscriptionsStore();
  const proofStore = deps.proofStore ?? getProofStore();
  const preuve = await store.findPreuveByIdForOrganisation(preuveId, session.organisationId);
  if (!preuve) {
    throw new PreuveNotFoundError();
  }
  const bytes = await proofStore.read(preuve.storageKey);
  if (!bytes) {
    console.error(
      '[admin] preuve %s : fichier %s illisible sur le stockage',
      preuve.id,
      preuve.storageKey,
    );
    throw new PreuveStorageError(preuve.storageKey);
  }
  return { preuve, bytes };
}
