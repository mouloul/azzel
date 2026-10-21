import type { SessionRecord } from '@/modules/iam/store';

import { isRegistrationOpen } from './domain';
import {
  NoEditionError,
  ProofFormatError,
  ProofTooLargeError,
  RegistrationClosedError,
} from './errors';
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
}

export interface PreuveState {
  edition: EditionSummary | null;
  coureurStatus: string | null;
  preuve: PreuveSummary | null;
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

export async function getPreuveState(
  session: SessionRecord,
  deps: PreuveServiceDeps = {},
): Promise<PreuveState> {
  const store = deps.store ?? getInscriptionsStore();
  const edition = await store.findCurrentEdition(session.organisationId);
  if (!edition) {
    return { edition: null, coureurStatus: null, preuve: null };
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
    preuve: preuve ? toPreuveSummary(preuve) : null,
  };
}

export async function uploadPreuve(
  session: SessionRecord,
  bytes: Uint8Array,
  deps: PreuveServiceDeps = {},
): Promise<PreuveSummary> {
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
