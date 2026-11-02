import { randomUUID } from 'node:crypto';

import { readEnv } from '@/modules/iam/env';

import {
  PROOF_EXTENSION_BY_FORMAT,
  PROOF_MIME_BY_FORMAT,
  detectProofFormat,
  type ProofFormat,
} from './proof-format';
import { isSafeStorageKey, sha256Hex, type ProofStore } from './proof-store';

import type { StoredProofFile } from './store';

/**
 * Stockage des preuves de paiement sur un stockage objet (story 8.2).
 *
 * `LocalDiskProofStore` écrit sur le disque local : le système de fichiers
 * d'une fonction serverless est éphémère et en lecture seule hors `/tmp`, une
 * preuve téléversée y disparaîtrait entre deux invocations. Cette seconde
 * implémentation de la même interface `ProofStore` parle à l'API Storage de
 * Supabase, qui est compatible avec le reste du dépôt sans toucher un seul
 * appelant : le point de bascule est `getProofStore()`.
 *
 * Trois routes suffisent (confirmées sur la spécification OpenAPI officielle
 * du service, https://supabase.github.io/storage/api.json, le 2026-11-01) :
 *   POST   {base}/object/{bucket}/{clé}   — dépôt
 *   GET    {base}/object/{bucket}/{clé}   — relecture
 *   DELETE {base}/object/{bucket}/{clé}   — suppression
 * authentifiées par `Authorization: Bearer <clé de service>`.
 *
 * `fetch` plutôt que `@supabase/supabase-js` : trois appels HTTP ne justifient
 * pas une dépendance volumineuse (principe de technologie ennuyeuse de la
 * spine), et `fetch` est natif sur la plateforme visée.
 *
 * **Le bucket est privé.** Les preuves sont des données personnelles de
 * coureurs : les octets transitent par le backend, jamais par une URL publique
 * ni par une URL signée remise au navigateur.
 *
 * Les cinq invariants de l'implémentation disque sont conservés à l'identique :
 * refus d'écriture quand le contenu détecté ne concorde pas avec le format
 * déclaré, clés opaques satisfaisant `isSafeStorageKey`, `read` d'une clé
 * inconnue qui rend l'absence sans lever, `remove` idempotent, et les mêmes
 * métadonnées en retour de `put`.
 */

/** Sélecteur d'implémentation. Absent ou `disque` : le disque local, le défaut. */
export const PROOF_STORAGE_DRIVER_ENV = 'PROOF_STORAGE_DRIVER';
/** Racine de l'API Storage, p. ex. `https://<ref>.supabase.co/storage/v1`. */
export const PROOF_STORAGE_URL_ENV = 'PROOF_STORAGE_URL';
/** Clé de service (secrète) portée en `Authorization: Bearer`. */
export const PROOF_STORAGE_KEY_ENV = 'PROOF_STORAGE_KEY';
/** Nom du bucket privé. */
export const PROOF_STORAGE_BUCKET_ENV = 'PROOF_STORAGE_BUCKET';

/** Valeur du sélecteur qui désigne le stockage objet. */
export const PROOF_STORAGE_DRIVER_OBJET = 'objet';
/** Valeur du sélecteur qui désigne le disque local — le défaut. */
export const PROOF_STORAGE_DRIVER_DISQUE = 'disque';

export const DEFAULT_PROOF_BUCKET = 'preuves';

/** Opérations nommées dans les erreurs : jamais d'échec silencieux. */
type OperationStockage = 'dépôt' | 'relecture' | 'suppression';

/**
 * Transport HTTP, injectable. En production c'est `fetch` ; les tests passent
 * une doublure, aucune clé de stockage n'étant disponible pour les éprouver
 * contre le service réel.
 */
export type ProofTransport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Configuration incomplète : échec à la construction, nommant la variable
 * manquante. Sans cela, l'erreur surviendrait en 401 opaque au premier
 * téléversement d'un coureur.
 */
/**
 * Reconnaît une clé destinée au navigateur. Deux familles coexistent chez
 * l'hébergeur : le préfixe `sb_publishable_` du système actuel, et le jeton
 * JWT portant le rôle `anon` de l'ancien. Aucune des deux ne peut lire un
 * bucket privé.
 */
export function estClePubliable(key: string): boolean {
  if (key.startsWith('sb_publishable_')) {
    return true;
  }
  const corps = key.split('.')[1];
  if (corps === undefined) {
    return false;
  }
  try {
    const charge: unknown = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'));
    return (
      typeof charge === 'object' &&
      charge !== null &&
      (charge as { role?: unknown }).role === 'anon'
    );
  } catch {
    return false;
  }
}

export class ObjetProofStoreConfigError extends Error {
  constructor(
    readonly variable: string,
    detail = 'variable absente',
  ) {
    super(
      `stockage objet des preuves : configuration incomplète — ${variable} : ${detail}. ` +
        `Posez ${variable}, ou retirez ${PROOF_STORAGE_DRIVER_ENV} pour revenir au disque local.`,
    );
    this.name = 'ObjetProofStoreConfigError';
  }
}

/** Panne du stockage : l'opération est nommée, l'appelant ne reçoit jamais un succès. */
export class ObjetProofStoreError extends Error {
  constructor(
    readonly operation: OperationStockage,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(`stockage objet des preuves : échec de l'opération « ${operation} » — ${detail}`, options);
    this.name = 'ObjetProofStoreError';
  }
}

export interface ObjetProofStoreOptions {
  /** Racine de l'API Storage, déjà normalisée de préférence. */
  baseUrl: string;
  /** Clé de service portée en `Authorization: Bearer`. */
  key: string;
  bucket?: string;
  transport?: ProofTransport;
}

/**
 * Tolère qu'on donne l'URL du projet plutôt que celle de l'API Storage :
 * `https://<ref>.supabase.co` devient `https://<ref>.supabase.co/storage/v1`.
 * Une URL déjà pourvue d'un chemin est respectée telle quelle, aux « / »
 * terminaux près. Une URL illisible est une configuration incomplète.
 */
export function normaliserUrlStockage(brut: string): string {
  const sans = brut.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(sans);
  } catch {
    throw new ObjetProofStoreConfigError(PROOF_STORAGE_URL_ENV, `URL illisible (« ${brut} »)`);
  }
  if (url.pathname === '' || url.pathname === '/') {
    return `${url.origin}/storage/v1`;
  }
  return sans;
}

/**
 * Corps d'erreur de l'API Storage : `{ statusCode, error, message, code }`.
 * Lu une seule fois, il sert à la fois à reconnaître l'absence et à nommer la
 * panne.
 */
interface CorpsErreur {
  statusCode: string | null;
  code: string | null;
  error: string | null;
  message: string | null;
  brut: string;
}

function champTexte(source: Record<string, unknown>, nom: string): string | null {
  const valeur = source[nom];
  return typeof valeur === 'string' ? valeur : null;
}

async function lireCorpsErreur(response: Response): Promise<CorpsErreur> {
  let brut = '';
  try {
    brut = await response.text();
  } catch {
    brut = '';
  }
  const vide: CorpsErreur = {
    statusCode: null,
    code: null,
    error: null,
    message: null,
    brut,
  };
  if (brut.length === 0) {
    return vide;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(brut);
  } catch {
    return vide;
  }
  if (parsed === null || typeof parsed !== 'object') {
    return vide;
  }
  const objet = parsed as Record<string, unknown>;
  return {
    statusCode: champTexte(objet, 'statusCode'),
    code: champTexte(objet, 'code'),
    error: champTexte(objet, 'error'),
    message: champTexte(objet, 'message'),
    brut,
  };
}

/**
 * Corps binaire pour `fetch`. Une vue `Uint8Array` n'est pas assignable à
 * `BodyInit` sous la configuration TypeScript du dépôt ; la copie est un
 * `ArrayBuffer` propre, détaché de la vue d'origine. Coût négligeable : une
 * preuve pèse au plus 300 Ko (contrainte `size_bytes` de la table `preuve`).
 */
function corpsBinaire(bytes: Uint8Array): ArrayBuffer {
  const copie = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copie).set(bytes);
  return copie;
}

/**
 * Codes d'erreur de l'API Storage désignant un **objet** manquant.
 * Source : documentation officielle des codes d'erreur Storage
 * (https://supabase.com/docs/guides/storage/debugging/error-codes, consultée le
 * 2026-11-02) — `NoSuchKey`, 404, « The specified key does not exist ».
 */
const CODES_OBJET_ABSENT = new Set(['nosuchkey']);

/**
 * Codes de la même table répondant eux aussi en **404**, mais qui désignent une
 * erreur de CONFIGURATION, pas une preuve manquante : `NoSuchBucket` (« The
 * specified bucket does not exist ») et `TenantNotFound`.
 */
const CODES_CONFIGURATION = new Set(['nosuchbucket', 'tenantnotfound']);

/**
 * Verdict porté sur une réponse en échec.
 *
 * Le piège que ce classement existe pour éviter : **tout 404 n'est pas une
 * preuve absente.** Un `PROOF_STORAGE_BUCKET` erroné ou une `PROOF_STORAGE_URL`
 * pointant sur un mauvais chemin répond 404 elle aussi ; la lire comme une
 * absence ferait rendre `null` à `read` et réussir `remove`, et l'erreur de
 * configuration se présenterait au comité comme « toutes les preuves ont
 * disparu ». Seul ce qui désigne explicitement un objet manquant vaut absence ;
 * un 404 sans corps exploitable (route introuvable) lève.
 *
 * Deux arêtes connues restent couvertes : l'absence peut arriver en 404 franc
 * comme en **400 portant le vrai code dans le corps**.
 */
type VerdictReponse = 'absence' | 'configuration' | 'panne';

function classerReponse(status: number, corps: CorpsErreur): VerdictReponse {
  const code = corps.code?.toLowerCase() ?? null;
  if (code !== null) {
    if (CODES_OBJET_ABSENT.has(code)) {
      return 'absence';
    }
    if (CODES_CONFIGURATION.has(code)) {
      return 'configuration';
    }
    return 'panne';
  }
  // Ancien système de codes, encore servi : `{ statusCode, error, message }`.
  const texte = `${corps.error ?? ''} ${corps.message ?? ''}`.toLowerCase();
  if (texte.includes('bucket') || texte.includes('tenant')) {
    return 'configuration';
  }
  if (texte.includes('object not found') || corps.error?.toLowerCase() === 'not_found') {
    return 'absence';
  }
  if (status === 404) {
    // 404 sans corps exploitable : la route elle-même est introuvable.
    return 'configuration';
  }
  return 'panne';
}

function detailPanne(status: number, corps: CorpsErreur, verdict: VerdictReponse): string {
  const parts = [`HTTP ${status}`];
  if (corps.statusCode !== null && corps.statusCode !== String(status)) {
    parts.push(`statusCode ${corps.statusCode}`);
  }
  const libelle = corps.message ?? corps.error ?? corps.code;
  if (libelle !== null) {
    parts.push(libelle);
  } else if (corps.brut.length > 0) {
    parts.push(corps.brut.slice(0, 200));
  }
  if (verdict === 'configuration') {
    parts.push(
      `bucket ou route introuvable — vérifiez ${PROOF_STORAGE_BUCKET_ENV} et ${PROOF_STORAGE_URL_ENV} ` +
        '(ce n’est PAS une preuve absente)',
    );
  }
  return parts.join(' — ');
}

export class ObjetProofStore implements ProofStore {
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly key: string;
  private readonly transport: ProofTransport;

  constructor(options: ObjetProofStoreOptions) {
    const baseUrl = options.baseUrl?.trim() ?? '';
    if (baseUrl.length === 0) {
      throw new ObjetProofStoreConfigError(PROOF_STORAGE_URL_ENV);
    }
    const key = options.key?.trim() ?? '';
    if (key.length === 0) {
      throw new ObjetProofStoreConfigError(PROOF_STORAGE_KEY_ENV);
    }
    if (estClePubliable(key)) {
      // Une clé publiable n'a aucun droit sur un bucket privé, mais le stockage
      // ne répond pas « accès refusé » : il répond « objet introuvable », pour ne
      // pas révéler ce que contient le bucket. La panne se présenterait donc
      // comme « toutes les preuves ont disparu », sans jamais parler de droits.
      // On la refuse ici, où la forme de la clé est encore lisible.
      throw new ObjetProofStoreConfigError(
        PROOF_STORAGE_KEY_ENV,
        'clé publiable fournie — elle est destinée au navigateur et ne peut pas ' +
          'lire un bucket privé ; utilisez la clé secrète du projet',
      );
    }
    const bucket = (options.bucket ?? DEFAULT_PROOF_BUCKET).trim();
    if (bucket.length === 0) {
      throw new ObjetProofStoreConfigError(PROOF_STORAGE_BUCKET_ENV);
    }
    this.baseUrl = normaliserUrlStockage(baseUrl);
    this.bucket = bucket;
    this.key = key;
    this.transport = options.transport ?? ((url, init) => fetch(url, init));
  }

  /** `{base}/object/{bucket}/{clé}` — la seule forme d'URL de ce module. */
  private urlObjet(storageKey: string): string {
    return `${this.baseUrl}/object/${encodeURIComponent(this.bucket)}/${encodeURIComponent(storageKey)}`;
  }

  /**
   * Le jeton porteur seul ne suffit pas : la passerelle refuse la requête avant
   * même d'atteindre le stockage et répond « Invalid Compact JWS », parce
   * qu'elle tente de lire la clé comme un JWT. L'en-tête `apikey` est ce qui
   * l'identifie comme une clé de projet. Constaté contre l'API réelle le
   * 2026-11-02 : sans lui, dépôt, relecture et suppression échouent toutes.
   */
  private enTetes(supplement: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.key}`, apikey: this.key, ...supplement };
  }

  private async appeler(
    operation: OperationStockage,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await this.transport(url, init);
    } catch (error) {
      // Réseau coupé, DNS, TLS : jamais un succès silencieux.
      throw new ObjetProofStoreError(
        operation,
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }

  async put(bytes: Uint8Array, format: ProofFormat): Promise<StoredProofFile> {
    const detected = detectProofFormat(bytes);
    if (detected !== format) {
      // Avant tout appel réseau : un contenu incohérent n'atteint pas le stockage.
      throw new Error(
        'format de preuve incohérent avec le contenu détecté : écriture sur le stockage objet refusée',
      );
    }
    const mime = PROOF_MIME_BY_FORMAT[format];
    const storageKey = `${randomUUID()}.${PROOF_EXTENSION_BY_FORMAT[format]}`;
    const response = await this.appeler('dépôt', this.urlObjet(storageKey), {
      method: 'POST',
      headers: this.enTetes({
        'content-type': mime,
        // Les clés sont des UUID fraîchement tirés : un objet déjà présent
        // signale une anomalie, pas un remplacement à accepter.
        'x-upsert': 'false',
      }),
      body: corpsBinaire(bytes),
    });
    if (!response.ok) {
      const corps = await lireCorpsErreur(response);
      throw new ObjetProofStoreError(
        'dépôt',
        detailPanne(response.status, corps, classerReponse(response.status, corps)),
      );
    }
    return {
      storageKey,
      mime,
      sizeBytes: bytes.byteLength,
      // Empreinte calculée sur les octets reçus, comme sur disque.
      sha256: sha256Hex(bytes),
    };
  }

  async read(storageKey: string): Promise<Uint8Array | null> {
    if (!isSafeStorageKey(storageKey)) {
      // Clé malformée : absence, sans appel réseau.
      return null;
    }
    const response = await this.appeler('relecture', this.urlObjet(storageKey), {
      method: 'GET',
      headers: this.enTetes(),
    });
    if (!response.ok) {
      const corps = await lireCorpsErreur(response);
      const verdict = classerReponse(response.status, corps);
      if (verdict === 'absence') {
        return null;
      }
      throw new ObjetProofStoreError('relecture', detailPanne(response.status, corps, verdict));
    }
    let buffer: ArrayBuffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (error) {
      throw new ObjetProofStoreError(
        'relecture',
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
    return new Uint8Array(buffer);
  }

  async remove(storageKey: string): Promise<void> {
    if (!isSafeStorageKey(storageKey)) {
      return;
    }
    const response = await this.appeler('suppression', this.urlObjet(storageKey), {
      method: 'DELETE',
      headers: this.enTetes(),
    });
    if (response.ok) {
      return;
    }
    const corps = await lireCorpsErreur(response);
    const verdict = classerReponse(response.status, corps);
    if (verdict === 'absence') {
      // Objet déjà supprimé : succès silencieux, comme sur disque.
      return;
    }
    throw new ObjetProofStoreError('suppression', detailPanne(response.status, corps, verdict));
  }
}

/**
 * Lit la configuration du stockage objet. Chaque absence nomme sa variable —
 * aucun appel réseau n'est émis avant que la configuration soit complète.
 */
export function readObjetProofStoreOptions(): ObjetProofStoreOptions {
  const baseUrl = readEnv(PROOF_STORAGE_URL_ENV);
  if (baseUrl === null) {
    throw new ObjetProofStoreConfigError(PROOF_STORAGE_URL_ENV);
  }
  const key = readEnv(PROOF_STORAGE_KEY_ENV);
  if (key === null) {
    throw new ObjetProofStoreConfigError(PROOF_STORAGE_KEY_ENV);
  }
  return {
    baseUrl,
    key,
    bucket: readEnv(PROOF_STORAGE_BUCKET_ENV) ?? DEFAULT_PROOF_BUCKET,
  };
}

/**
 * Valeur du sélecteur, normalisée. `null` quand rien n'est posé : le défaut
 * disque reste le défaut, et un développeur qui clone le dépôt n'a besoin
 * d'aucune clé.
 */
export function readProofStorageDriver(): string | null {
  const brut = readEnv(PROOF_STORAGE_DRIVER_ENV);
  return brut === null ? null : brut.trim().toLowerCase();
}
