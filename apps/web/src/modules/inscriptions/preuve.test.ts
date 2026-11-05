import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import {
  DossierValidatedError,
  NoCoureurError,
  NoEditionError,
  PreuveIdenticalRefusedError,
  PreuveStorageError,
  NumeroTransactionInvalideError,
  ProofFormatError,
  ProofTooLargeError,
  RegistrationClosedError,
  toAdminApiError,
  toPreuveApiError,
} from './errors';
import {
  ACCEPTED_PROOF_FORMATS_LABEL,
  MAX_PROOF_BYTES,
  detectProofFormat,
  formatKiloBytes,
  isAcceptedProofName,
} from './proof-format';
import { LocalDiskProofStore, isSafeStorageKey, sha256Hex } from './proof-store';
import { getPreuveState, uploadPreuve } from './proof-service';
import type { EditionRecord, InscriptionsStore, PreuveRecord } from './store';

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

function pngBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  bytes.fill(0xcd, 12);
  return bytes;
}

function webpBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
    0x20,
  ]);
  bytes.fill(0x9a, 16);
  return bytes;
}

function pdfBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
  bytes.fill(0x20, 9);
  return bytes;
}

function textBytes(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

function heicBytes(): Uint8Array {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  ]);
}

describe('detectProofFormat — magic bytes, jamais l’extension', () => {
  it('vrais en-têtes JPEG, PNG, WebP et PDF reconnus', () => {
    expect(detectProofFormat(jpegBytes(64))).toBe('jpeg');
    expect(detectProofFormat(pngBytes(64))).toBe('png');
    expect(detectProofFormat(webpBytes(64))).toBe('webp');
    expect(detectProofFormat(pdfBytes(64))).toBe('pdf');
  });

  it('fichiers texte, HEIC et en-têtes tronqués refusés', () => {
    expect(detectProofFormat(textBytes('bonjour je suis un reçu'))).toBeNull();
    expect(detectProofFormat(heicBytes())).toBeNull();
    expect(detectProofFormat(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectProofFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectProofFormat(new Uint8Array(0))).toBeNull();
  });

  it('JPEG renommé en .png reste un JPEG (le contenu fait foi)', () => {
    expect(detectProofFormat(jpegBytes(64))).toBe('jpeg');
  });
});

describe('helpers preuve', () => {
  it('sha256Hex : vecteur connu', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('isAcceptedProofName : extensions acceptées, autres refusées', () => {
    expect(isAcceptedProofName('recu.jpg')).toBe(true);
    expect(isAcceptedProofName('recu.JPEG')).toBe(true);
    expect(isAcceptedProofName('recu.png')).toBe(true);
    expect(isAcceptedProofName('recu.webp')).toBe(true);
    expect(isAcceptedProofName('recu.pdf')).toBe(true);
    expect(isAcceptedProofName('recu.heic')).toBe(false);
    expect(isAcceptedProofName('recu.txt')).toBe(false);
    expect(isAcceptedProofName('recu')).toBe(false);
    expect(isAcceptedProofName('recu.php.jpg.exe')).toBe(false);
  });

  it('formatKiloBytes arrondit en Ko', () => {
    expect(formatKiloBytes(0)).toBe('1 Ko');
    expect(formatKiloBytes(1024)).toBe('1 Ko');
    expect(formatKiloBytes(300 * 1024)).toBe('300 Ko');
  });
});

describe('LocalDiskProofStore', () => {
  let dir: string;
  let store: LocalDiskProofStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'azzel-preuve-test-'));
    store = new LocalDiskProofStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('put puis read : aller-retour, nom UUID jamais le nom d’origine, sha et taille exacts', async () => {
    const bytes = jpegBytes(2048);
    const stored = await store.put(bytes, 'jpeg');

    expect(stored.storageKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );
    expect(stored.storageKey).not.toContain('recu');
    expect(stored.mime).toBe('image/jpeg');
    expect(stored.sizeBytes).toBe(2048);
    expect(stored.sha256).toBe(sha256Hex(bytes));

    const read = await store.read(stored.storageKey);
    expect(read).not.toBeNull();
    expect(sha256Hex(read as Uint8Array)).toBe(stored.sha256);
  });

  it('put : chaque format range la bonne extension, aucun fichier temporaire restant', async () => {
    await store.put(pngBytes(128), 'png');
    await store.put(webpBytes(128), 'webp');
    await store.put(pdfBytes(128), 'pdf');
    const names = readdirSync(dir).sort();
    expect(names).toHaveLength(3);
    expect(names.every((name) => isSafeStorageKey(name))).toBe(true);
  });

  it('put refuse d’écrire des octets sans en-tête connu', async () => {
    await expect(store.put(textBytes('pas une image'), 'jpeg')).rejects.toThrow();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('put refuse un format déclaré incohérent avec le contenu détecté (JPEG déclaré PNG)', async () => {
    await expect(store.put(jpegBytes(64), 'png')).rejects.toThrow();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('read : clé inconnue ou malveillante → null, jamais une erreur ni une lecture hors répertoire', async () => {
    expect(await store.read(`${randomUUID()}.jpg`)).toBeNull();
    expect(await store.read('../../etc/passwd')).toBeNull();
    expect(await store.read('..\\secrets')).toBeNull();
    expect(await store.read(`${randomUUID()}.exe`)).toBeNull();
  });
});

describe('toPreuveApiError — enveloppes preuve', () => {
  it('PreuveIdenticalRefusedError : 409 preuve.identique_refusee avec le message dédié', () => {
    const apiError = toPreuveApiError(new PreuveIdenticalRefusedError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('preuve.identique_refusee');
    expect(apiError.envelope.error.message).toContain('déjà été refusée');
    expect(apiError.envelope.error.message).toContain('version différente');
  });

  it('ProofFormatError : 400 preuve.format, message listant les formats acceptés', () => {
    const apiError = toPreuveApiError(new ProofFormatError());
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.version).toBe(1);
    expect(apiError.envelope.error.code).toBe('preuve.format');
    expect(apiError.envelope.error.message).toContain(ACCEPTED_PROOF_FORMATS_LABEL);
  });

  it('ProofTooLargeError : 400 preuve.too_large avec tailles en Ko', () => {
    const apiError = toPreuveApiError(new ProofTooLargeError(480_000));
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.error.code).toBe('preuve.too_large');
    expect(apiError.envelope.error.message).toContain('469 Ko');
    expect(apiError.envelope.error.message).toContain('300 Ko');
  });

  it('NoCoureurError : 409 preuve.no_coureur', () => {
    const apiError = toPreuveApiError(new NoCoureurError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('preuve.no_coureur');
  });

  it('DossierValidatedError : 409 inscriptions.dossier_valide réutilisé', () => {
    const apiError = toPreuveApiError(new DossierValidatedError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('inscriptions.dossier_valide');
  });

  it('RegistrationClosedError : 403 inscriptions.closed réutilisé', () => {
    const apiError = toPreuveApiError(
      new RegistrationClosedError(new Date('2027-03-16T22:59:59.000Z')),
    );
    expect(apiError.status).toBe(403);
    expect(apiError.envelope.error.code).toBe('inscriptions.closed');
    expect(apiError.envelope.error.message).toContain('16 mars 2027');
  });

  it('erreur inconnue : 500 preuve.internal_error sans fuiter le message brut', () => {
    const apiError = toPreuveApiError(new Error('boom'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('preuve.internal_error');
    expect(apiError.envelope.error.message).not.toContain('boom');
  });

  it('PreuveStorageError : 500 admin.preuve_storage_error (téléchargement organisateur)', () => {
    const apiError = toAdminApiError(new PreuveStorageError('uuid.jpg'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('admin.preuve_storage_error');
  });
});

describe('uploadPreuve / getPreuveState — service avec store stubbé et vrai disque', () => {
  const session: SessionRecord = {
    accountId: 'account-1',
    organisationId: 'org-1',
    email: 'coureur@exemple.dz',
    role: 'coureur',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  let dir: string;
  let proofStore: LocalDiskProofStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'azzel-preuve-svc-'));
    proofStore = new LocalDiskProofStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function preuveRecord(overrides: Partial<PreuveRecord> = {}): PreuveRecord {
    return {
      id: 'preuve-1',
      organisationId: session.organisationId,
      coureurId: 'coureur-1',
      storageKey: `${randomUUID()}.jpg`,
      mime: 'image/jpeg',
      sizeBytes: 2048,
      sha256: sha256Hex(jpegBytes(2048)),
      status: 'active',
      createdAt: new Date('2026-10-21T10:30:00.000Z'),
      numeroTransaction: null,
      ...overrides,
    };
  }

  function buildStore(edition: Partial<EditionRecord> = {}): InscriptionsStore & {
    findCurrentEdition: ReturnType<typeof vi.fn>;
    findCoureurByAccount: ReturnType<typeof vi.fn>;
    findActivePreuveByAccount: ReturnType<typeof vi.fn>;
    savePreuve: ReturnType<typeof vi.fn>;
  } {
    const fullEdition: EditionRecord = {
      id: 'edition-1',
      organisationId: 'org-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: '2027-03-26',
      registrationClosesAt: new Date('2100-01-01T00:00:00.000Z'),
      capacite: 600,
      seuilAffichagePlaces: 200,
      capaciteHebergement: 200,
      prixDossardDa: 2000,
      prixHebergementDa: 1500,
      delaiPreuveJours: 2,
      dateCoursePublique: false,
      ...edition,
    };
    const store = {
      findCurrentEdition: vi.fn(async () => fullEdition),
      listEpreuves: vi.fn(async () => []),
      findDocuments: vi.fn(async () => []),
      findCoureurByAccount: vi.fn(async () => null),
      upsertCoureur: vi.fn(),
      acceptDocuments: vi.fn(),
      findActivePreuveByAccount: vi.fn(async () => null),
      savePreuve: vi.fn(async (input: { file: { storageKey: string; mime: string; sizeBytes: number; sha256: string } }) => ({
        preuve: preuveRecord({
          storageKey: input.file.storageKey,
          mime: input.file.mime,
          sizeBytes: input.file.sizeBytes,
          sha256: input.file.sha256,
        }),
        replaced: null,
      })),
    };
    return store as unknown as InscriptionsStore & {
      findCurrentEdition: ReturnType<typeof vi.fn>;
      findCoureurByAccount: ReturnType<typeof vi.fn>;
      findActivePreuveByAccount: ReturnType<typeof vi.fn>;
      savePreuve: ReturnType<typeof vi.fn>;
    };
  }

  it('JPEG valide : fichier écrit (≤ 300 Ko), métadonnées transmises, récap ISO UTC', async () => {
    const store = buildStore();
    const bytes = jpegBytes(120_000);
    const summary = await uploadPreuve(session, bytes, { store, proofStore });

    expect(store.savePreuve).toHaveBeenCalledTimes(1);
    const firstCall = store.savePreuve.mock.calls[0];
    expect(firstCall).toBeDefined();
    const input = (firstCall as unknown as [
      {
        organisationId: string;
        file: { storageKey: string; mime: string; sizeBytes: number; sha256: string };
      },
    ])[0];
    expect(input.file.sizeBytes).toBe(120_000);
    expect(input.file.sizeBytes).toBeLessThanOrEqual(MAX_PROOF_BYTES);
    expect(input.file.mime).toBe('image/jpeg');
    expect(input.file.sha256).toBe(sha256Hex(bytes));
    expect(input.organisationId).toBe(session.organisationId);
    expect(readdirSync(dir)).toEqual([input.file.storageKey]);
    expect(summary.depositedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(summary.format).toBe('JPEG');
  });

  it('le contenu fait foi : octets JPEG stockés en image/jpeg sous clé .jpg, récap JPEG', async () => {
    const store = buildStore();
    const summary = await uploadPreuve(session, jpegBytes(2048), { store, proofStore });

    const key = readdirSync(dir)[0];
    expect(key).toMatch(/\.jpg$/);
    const input = (store.savePreuve.mock.calls[0] as unknown as [
      { file: { mime: string; storageKey: string } },
    ])[0];
    expect(input.file.mime).toBe('image/jpeg');
    expect(input.file.storageKey).toBe(key);
    expect(summary.mime).toBe('image/jpeg');
    expect(summary.format).toBe('JPEG');
  });

  it('numéro de transaction : normalisé puis transmis au store', async () => {
    const store = buildStore();
    await uploadPreuve(session, jpegBytes(1024), {
      store,
      proofStore,
      numeroTransaction: ' 0125 9424 6237 ',
    });
    const input = (store.savePreuve.mock.calls[0] as unknown as [
      { numeroTransaction: string | null },
    ])[0];
    expect(input.numeroTransaction).toBe('012594246237');
  });

  it('numéro de transaction invalide : refusé avant tout stockage', async () => {
    const store = buildStore();
    await expect(
      uploadPreuve(session, jpegBytes(1024), { store, proofStore, numeroTransaction: '12' }),
    ).rejects.toBeInstanceOf(NumeroTransactionInvalideError);
    expect(store.savePreuve).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('nom d’origine jamais utilisé : clé UUID sur disque', async () => {
    const store = buildStore();
    await uploadPreuve(session, jpegBytes(1024), { store, proofStore });
    const key = readdirSync(dir)[0];
    expect(key).toBeDefined();
    expect(key ?? '').toMatch(/\.jpg$/);
    expect((key ?? '').startsWith('photo')).toBe(false);
  });

  it('format refusé (texte forgé .jpg) : ProofFormatError, rien écrit, store non appelé', async () => {
    const store = buildStore();
    await expect(
      uploadPreuve(session, textBytes('pretendu recu'), { store, proofStore }),
    ).rejects.toBeInstanceOf(ProofFormatError);
    expect(store.savePreuve).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('fichier servi > 300 Ko : refus propre preuve.too_large, rien écrit', async () => {
    const store = buildStore();
    await expect(
      uploadPreuve(session, jpegBytes(400_000), { store, proofStore }),
    ).rejects.toBeInstanceOf(ProofTooLargeError);
    expect(store.savePreuve).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('aucune édition configurée : NoEditionError mappée 503 preuve.no_edition', async () => {
    const store = buildStore();
    store.findCurrentEdition.mockResolvedValue(null);
    await expect(uploadPreuve(session, jpegBytes(1024), { store, proofStore })).rejects.toBeInstanceOf(
      NoEditionError,
    );
    const apiError = toPreuveApiError(new NoEditionError());
    expect(apiError.status).toBe(503);
    expect(apiError.envelope.error.code).toBe('preuve.no_edition');
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('déduplication décidée en transaction : preuve existante renvoyée → fichier frais retiré, aucun orphelin', async () => {
    const store = buildStore();
    const bytes = jpegBytes(2048);
    const active = preuveRecord({
      id: 'preuve-existante',
      sha256: sha256Hex(bytes),
      sizeBytes: 2048,
    });
    store.savePreuve.mockResolvedValue({ preuve: active, replaced: null });

    const summary = await uploadPreuve(session, bytes, { store, proofStore });

    expect(store.savePreuve).toHaveBeenCalledTimes(1);
    expect(summary.id).toBe('preuve-existante');
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('inscriptions fermées : refus avant toute écriture disque ou base', async () => {
    const store = buildStore({ registrationClosesAt: new Date('2000-01-01T00:00:00.000Z') });
    await expect(
      uploadPreuve(session, jpegBytes(1024), { store, proofStore }),
    ).rejects.toBeInstanceOf(RegistrationClosedError);
    expect(store.savePreuve).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('échec base (dossier validé) : fichier écrit puis retiré, erreur propagée', async () => {
    const store = buildStore();
    store.savePreuve.mockRejectedValue(new DossierValidatedError());
    await expect(
      uploadPreuve(session, jpegBytes(1024), { store, proofStore }),
    ).rejects.toBeInstanceOf(DossierValidatedError);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('remplacement : l’ancienne preuve renvoyée comme replaced, fichier frais conservé sur disque', async () => {
    const store = buildStore();
    const ancienne = preuveRecord({ id: 'preuve-ancienne' });
    store.savePreuve.mockImplementation(
      async (input: { file: { storageKey: string; mime: string; sizeBytes: number; sha256: string } }) => ({
        preuve: preuveRecord({
          storageKey: input.file.storageKey,
          mime: input.file.mime,
          sizeBytes: input.file.sizeBytes,
          sha256: input.file.sha256,
        }),
        replaced: ancienne,
      }),
    );
    const summary = await uploadPreuve(session, jpegBytes(4096), { store, proofStore });
    expect(summary.id).toBe('preuve-1');
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it('getPreuveState : édition + coureur + preuve active résumés ; refusé porte son motif ; sans coureur → preuve null', async () => {
    const store = buildStore();
    store.findCoureurByAccount.mockResolvedValue({
      id: 'coureur-1',
      status: 'en constitution',
      refusalReason: null,
    });
    store.findActivePreuveByAccount.mockResolvedValue(preuveRecord());
    const avec = await getPreuveState(session, { store, proofStore });
    expect(avec.edition?.registrationOpen).toBe(true);
    expect(avec.coureurStatus).toBe('en constitution');
    expect(avec.refusalReason).toBeNull();
    expect(avec.preuve?.sizeBytes).toBe(2048);
    expect(avec.preuve?.depositedAt).toBe('2026-10-21T10:30:00.000Z');

    const storeRefuse = buildStore();
    storeRefuse.findCoureurByAccount.mockResolvedValue({
      id: 'coureur-1',
      status: 'refusé',
      refusalReason: 'Reçu de paiement illisible',
    });
    storeRefuse.findActivePreuveByAccount.mockResolvedValue(preuveRecord());
    const refuse = await getPreuveState(session, { store: storeRefuse, proofStore });
    expect(refuse.coureurStatus).toBe('refusé');
    expect(refuse.refusalReason).toBe('Reçu de paiement illisible');

    const storeVide = buildStore();
    storeVide.findCoureurByAccount.mockResolvedValue(null);
    const sans = await getPreuveState(session, { store: storeVide, proofStore });
    expect(sans.coureurStatus).toBeNull();
    expect(sans.refusalReason).toBeNull();
    expect(sans.preuve).toBeNull();
  });

  // Story 9.4 — le fil d'étapes de /preuve marque l'étape Documents depuis
  // l'enregistrement coureur déjà lu : vrai seulement avec les DEUX
  // acceptations horodatées (décharge ET règlement, story 1.4).
  it('documentsAcceptes : vrai seulement avec les deux acceptations, faux sinon (fil 9.4)', async () => {
    const storeComplet = buildStore();
    storeComplet.findCoureurByAccount.mockResolvedValue({
      id: 'coureur-1',
      status: 'en constitution',
      refusalReason: null,
      dechargeAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
      dechargeVersion: 'v1',
      reglementAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
      reglementVersion: 'v1',
    });
    const complet = await getPreuveState(session, { store: storeComplet, proofStore });
    expect(complet.documentsAcceptes).toBe(true);

    const storePartiel = buildStore();
    storePartiel.findCoureurByAccount.mockResolvedValue({
      id: 'coureur-1',
      status: 'en constitution',
      refusalReason: null,
      dechargeAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
      dechargeVersion: 'v1',
      reglementAcceptedAt: null,
      reglementVersion: null,
    });
    const partiel = await getPreuveState(session, { store: storePartiel, proofStore });
    expect(partiel.documentsAcceptes).toBe(false);

    const storeSansCoureur = buildStore();
    storeSansCoureur.findCoureurByAccount.mockResolvedValue(null);
    const sansCoureur = await getPreuveState(session, { store: storeSansCoureur, proofStore });
    expect(sansCoureur.documentsAcceptes).toBe(false);
  });
});
