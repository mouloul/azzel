import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readEnv } from '@/modules/iam/env';

import {
  PROOF_EXTENSION_BY_FORMAT,
  PROOF_MIME_BY_FORMAT,
  detectProofFormat,
  type ProofFormat,
} from './proof-format';

import {
  ObjetProofStore,
  ObjetProofStoreConfigError,
  PROOF_STORAGE_DRIVER_DISQUE,
  PROOF_STORAGE_DRIVER_ENV,
  PROOF_STORAGE_DRIVER_OBJET,
  readObjetProofStoreOptions,
  readProofStorageDriver,
} from './proof-store-objet';

import type { StoredProofFile } from './store';

export const DEFAULT_STORAGE_DIR = './data/preuves';

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/;

export interface ProofStore {
  put(bytes: Uint8Array, format: ProofFormat): Promise<StoredProofFile>;
  read(storageKey: string): Promise<Uint8Array | null>;
  remove(storageKey: string): Promise<void>;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function formatForMime(mime: string): ProofFormat | null {
  const entry = (Object.entries(PROOF_MIME_BY_FORMAT) as [ProofFormat, string][]).find(
    ([, candidate]) => candidate === mime,
  );
  return entry ? entry[0] : null;
}

export function isSafeStorageKey(storageKey: string): boolean {
  return STORAGE_KEY_PATTERN.test(storageKey);
}

export function readStorageDir(): string {
  return readEnv('STORAGE_DIR') ?? DEFAULT_STORAGE_DIR;
}

export class LocalDiskProofStore implements ProofStore {
  constructor(private readonly dir: string = readStorageDir()) {}

  async put(bytes: Uint8Array, format: ProofFormat): Promise<StoredProofFile> {
    const detected = detectProofFormat(bytes);
    if (detected !== format) {
      throw new Error(
        'format de preuve incohérent avec le contenu détecté : écriture sur disque refusée',
      );
    }
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await mkdir(this.dir, { recursive: true });
    const storageKey = `${randomUUID()}.${PROOF_EXTENSION_BY_FORMAT[format]}`;
    const target = path.join(/*turbopackIgnore: true*/ this.dir, storageKey);
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, buffer);
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    return {
      storageKey,
      mime: PROOF_MIME_BY_FORMAT[format],
      sizeBytes: buffer.byteLength,
      sha256: sha256Hex(buffer),
    };
  }

  async read(storageKey: string): Promise<Uint8Array | null> {
    if (!isSafeStorageKey(storageKey)) {
      return null;
    }
    try {
      const buffer = await readFile(path.join(/*turbopackIgnore: true*/ this.dir, storageKey));
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<void> {
    if (!isSafeStorageKey(storageKey)) {
      return;
    }
    try {
      await unlink(path.join(/*turbopackIgnore: true*/ this.dir, storageKey));
    } catch {
      // fichier déjà absent : rien à faire
    }
  }
}

type ProofStoreGlobals = typeof globalThis & { __azzelProofStore?: ProofStore };

/**
 * Fabrique l'implémentation désignée par la configuration (story 8.2).
 *
 * **Le disque local reste le défaut** : sans `PROOF_STORAGE_DRIVER`, rien ne
 * change et un développeur qui clone le dépôt n'a besoin d'aucune clé. Seule
 * la valeur `objet` retient le stockage objet ; une valeur inconnue est une
 * erreur nommée plutôt qu'un repli silencieux sur le disque, qui ferait
 * disparaître les preuves en hébergé sans que personne s'en aperçoive.
 *
 * Aucun appelant n'est modifié : ce point de bascule est le seul.
 */
export function createProofStore(): ProofStore {
  const driver = readProofStorageDriver();
  if (driver === null || driver === PROOF_STORAGE_DRIVER_DISQUE) {
    return new LocalDiskProofStore();
  }
  if (driver === PROOF_STORAGE_DRIVER_OBJET) {
    return new ObjetProofStore(readObjetProofStoreOptions());
  }
  throw new ObjetProofStoreConfigError(
    PROOF_STORAGE_DRIVER_ENV,
    `valeur « ${driver} » inconnue (attendu : ` +
      `${PROOF_STORAGE_DRIVER_DISQUE} ou ${PROOF_STORAGE_DRIVER_OBJET})`,
  );
}

export function getProofStore(): ProofStore {
  const globals = globalThis as ProofStoreGlobals;
  if (globals.__azzelProofStore) {
    return globals.__azzelProofStore;
  }
  // Une configuration incomplète lève ici : rien n'est mémoïsé, et le prochain
  // appel relèvera une fois la variable posée.
  const store = createProofStore();
  globals.__azzelProofStore = store;
  return store;
}

/** Tests uniquement : oublie le store mémoïsé (isolation entre cas). */
export function resetProofStoreForTests(): void {
  delete (globalThis as ProofStoreGlobals).__azzelProofStore;
}
