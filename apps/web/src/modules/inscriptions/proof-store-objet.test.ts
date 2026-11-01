import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectProofFormat } from './proof-format';
import {
  DEFAULT_PROOF_BUCKET,
  ObjetProofStore,
  ObjetProofStoreConfigError,
  ObjetProofStoreError,
  PROOF_STORAGE_BUCKET_ENV,
  PROOF_STORAGE_DRIVER_ENV,
  PROOF_STORAGE_KEY_ENV,
  PROOF_STORAGE_URL_ENV,
  normaliserUrlStockage,
  type ProofTransport,
} from './proof-store-objet';
import {
  LocalDiskProofStore,
  getProofStore,
  isSafeStorageKey,
  resetProofStoreForTests,
  sha256Hex,
} from './proof-store';

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

function pdfBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
  bytes.fill(0x20, 9);
  return bytes;
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

const BASE_URL = 'https://projet-exemple.supabase.co/storage/v1';
const CLE = 'cle-de-service-factice';

interface AppelEnregistre {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

function corpsEnvoye(init: RequestInit): Uint8Array | null {
  const body = init.body;
  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  return null;
}

function normaliserEnTetes(init: RequestInit): Record<string, string> {
  const brut = (init.headers ?? {}) as Record<string, string>;
  const sortie: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(brut)) {
    sortie[nom.toLowerCase()] = valeur;
  }
  return sortie;
}

/**
 * Doublure du transport : un stockage objet en mémoire qui répond comme l'API
 * Storage — y compris ses deux arêtes (404 à la suppression d'un objet absent,
 * et code réel dans le corps d'une réponse 400).
 *
 * La clé d'accès n'étant pas disponible dans cette session, c'est contre cette
 * doublure que l'implémentation est éprouvée ; la vérification contre le
 * stockage réel reste un reste-à-faire explicite.
 */
class StockageFactice {
  readonly objets = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly appels: AppelEnregistre[] = [];
  /** Forme de la réponse d'absence : `404` franc, ou `400` au code enfoui. */
  absenceEn400 = false;

  readonly transport: ProofTransport = async (url, init) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const body = corpsEnvoye(init);
    this.appels.push({ url, method, headers: normaliserEnTetes(init), body });

    const chemin = new URL(url).pathname;
    const prefixe = `/storage/v1/object/${DEFAULT_PROOF_BUCKET}/`;
    if (!chemin.startsWith(prefixe)) {
      return new Response('route inconnue', { status: 404 });
    }
    const cle = decodeURIComponent(chemin.slice(prefixe.length));

    if (method === 'POST') {
      if (this.objets.has(cle)) {
        return this.absence(); // ne devrait jamais arriver : clés UUID
      }
      this.objets.set(cle, {
        bytes: body ?? new Uint8Array(),
        contentType: normaliserEnTetes(init)['content-type'] ?? 'application/octet-stream',
      });
      return Response.json({ Key: `${DEFAULT_PROOF_BUCKET}/${cle}` }, { status: 200 });
    }
    if (method === 'GET') {
      const objet = this.objets.get(cle);
      if (!objet) {
        return this.absence();
      }
      const copie = new ArrayBuffer(objet.bytes.byteLength);
      new Uint8Array(copie).set(objet.bytes);
      return new Response(copie, {
        status: 200,
        headers: { 'content-type': objet.contentType },
      });
    }
    if (method === 'DELETE') {
      if (!this.objets.delete(cle)) {
        return this.absence();
      }
      return Response.json({ message: 'Successfully deleted' }, { status: 200 });
    }
    return new Response('méthode inconnue', { status: 405 });
  };

  private absence(): Response {
    if (this.absenceEn400) {
      // Arête connue : HTTP 400, vrai code dans le corps.
      return Response.json(
        { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' },
        { status: 400 },
      );
    }
    return Response.json(
      { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' },
      { status: 404 },
    );
  }
}

function storeFactice(stockage: StockageFactice): ObjetProofStore {
  return new ObjetProofStore({ baseUrl: BASE_URL, key: CLE, transport: stockage.transport });
}

describe('ObjetProofStore — dépôt', () => {
  it('put : objet écrit sous une clé opaque, métadonnées exactes, en-têtes de l’API Storage', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);
    const bytes = jpegBytes(2048);

    const stored = await store.put(bytes, 'jpeg');

    expect(isSafeStorageKey(stored.storageKey)).toBe(true);
    expect(stored.storageKey).toMatch(/\.jpg$/);
    expect(stored.mime).toBe('image/jpeg');
    expect(stored.sizeBytes).toBe(2048);
    expect(stored.sha256).toBe(sha256Hex(bytes));

    expect(stockage.appels).toHaveLength(1);
    const appel = stockage.appels[0] as AppelEnregistre;
    expect(appel.method).toBe('POST');
    expect(appel.url).toBe(`${BASE_URL}/object/${DEFAULT_PROOF_BUCKET}/${stored.storageKey}`);
    expect(appel.headers.authorization).toBe(`Bearer ${CLE}`);
    expect(appel.headers['content-type']).toBe('image/jpeg');
    expect(appel.body).not.toBeNull();
    expect(sha256Hex(appel.body as Uint8Array)).toBe(stored.sha256);
  });

  it('put : chaque format range la bonne extension et le bon type MIME', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);

    const jpeg = await store.put(jpegBytes(64), 'jpeg');
    const pdf = await store.put(pdfBytes(64), 'pdf');

    expect(jpeg.storageKey.endsWith('.jpg')).toBe(true);
    expect(pdf.storageKey.endsWith('.pdf')).toBe(true);
    expect(pdf.mime).toBe('application/pdf');
    expect(stockage.objets.size).toBe(2);
    expect([...stockage.objets.keys()].every((cle) => isSafeStorageKey(cle))).toBe(true);
  });

  it('put : format déclaré incohérent avec le contenu — refus, AUCUN appel réseau', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);

    // Octets PDF déclarés JPEG : exactement la ligne de la matrice I/O.
    await expect(store.put(pdfBytes(128), 'jpeg')).rejects.toThrow(/incohérent/);
    // Et des octets sans en-tête connu.
    await expect(store.put(textBytes('pas une image'), 'jpeg')).rejects.toThrow(/incohérent/);

    expect(detectProofFormat(pdfBytes(128))).toBe('pdf');
    expect(stockage.appels).toHaveLength(0);
    expect(stockage.objets.size).toBe(0);
  });

  it('put : panne du stockage (5xx) — erreur nommant l’opération, jamais de succès silencieux', async () => {
    const store = new ObjetProofStore({
      baseUrl: BASE_URL,
      key: CLE,
      transport: async () => new Response('bad gateway', { status: 502 }),
    });

    const echec = store.put(jpegBytes(64), 'jpeg');
    await expect(echec).rejects.toBeInstanceOf(ObjetProofStoreError);
    await expect(echec).rejects.toThrow(/dépôt/);
    await expect(echec).rejects.toThrow(/502/);
  });

  it('put : réseau coupé — erreur nommée qui conserve la cause', async () => {
    const store = new ObjetProofStore({
      baseUrl: BASE_URL,
      key: CLE,
      transport: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    await expect(store.put(jpegBytes(64), 'jpeg')).rejects.toThrow(/dépôt.*ECONNREFUSED/s);
  });
});

describe('ObjetProofStore — relecture', () => {
  it('put puis read : les octets rendus sont identiques à ceux déposés', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);
    const bytes = jpegBytes(4096);

    const stored = await store.put(bytes, 'jpeg');
    const relu = await store.read(stored.storageKey);

    expect(relu).not.toBeNull();
    expect(Array.from(relu as Uint8Array)).toEqual(Array.from(bytes));
    expect(sha256Hex(relu as Uint8Array)).toBe(stored.sha256);
  });

  it('read : clé inconnue — null, que l’absence arrive en 404 ou en 400 au code enfoui', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);
    const cleInconnue = '11111111-2222-4333-8444-555555555555.jpg';

    expect(await store.read(cleInconnue)).toBeNull();

    stockage.absenceEn400 = true;
    expect(await store.read(cleInconnue)).toBeNull();
    // Les deux formes d'absence ont bien été éprouvées par le réseau.
    expect(stockage.appels).toHaveLength(2);
  });

  it('read : clé malformée — null, AUCUN appel réseau', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);

    expect(await store.read('../../etc/passwd')).toBeNull();
    expect(await store.read('..\\secrets')).toBeNull();
    expect(await store.read('11111111-2222-4333-8444-555555555555.exe')).toBeNull();
    expect(await store.read('')).toBeNull();

    expect(stockage.appels).toHaveLength(0);
  });

  it('read : panne du stockage (5xx) — erreur nommant l’opération, jamais null', async () => {
    const store = new ObjetProofStore({
      baseUrl: BASE_URL,
      key: CLE,
      transport: async () => new Response('indisponible', { status: 503 }),
    });

    const echec = store.read('11111111-2222-4333-8444-555555555555.jpg');
    await expect(echec).rejects.toBeInstanceOf(ObjetProofStoreError);
    await expect(echec).rejects.toThrow(/relecture/);
  });

  it('read : 403 (clé invalide) ne doit JAMAIS passer pour une absence', async () => {
    const store = new ObjetProofStore({
      baseUrl: BASE_URL,
      key: CLE,
      transport: async () =>
        Response.json(
          { statusCode: '403', error: 'Unauthorized', message: 'invalid signature', code: 'InvalidJWT' },
          { status: 403 },
        ),
    });

    await expect(store.read('11111111-2222-4333-8444-555555555555.jpg')).rejects.toThrow(
      /relecture/,
    );
  });
});

describe('ObjetProofStore — suppression', () => {
  it('remove : idempotent — le second appel sur la même clé réussit sans lever', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);
    const stored = await store.put(jpegBytes(64), 'jpeg');

    await expect(store.remove(stored.storageKey)).resolves.toBeUndefined();
    expect(stockage.objets.size).toBe(0);
    await expect(store.remove(stored.storageKey)).resolves.toBeUndefined();

    stockage.absenceEn400 = true;
    await expect(store.remove(stored.storageKey)).resolves.toBeUndefined();
  });

  it('remove : clé malformée — ne lève pas, AUCUN appel réseau', async () => {
    const stockage = new StockageFactice();
    const store = storeFactice(stockage);

    await expect(store.remove('../../etc/passwd')).resolves.toBeUndefined();
    expect(stockage.appels).toHaveLength(0);
  });

  it('remove : panne du stockage (5xx) — erreur nommant l’opération', async () => {
    const store = new ObjetProofStore({
      baseUrl: BASE_URL,
      key: CLE,
      transport: async () => new Response('boom', { status: 500 }),
    });

    const echec = store.remove('11111111-2222-4333-8444-555555555555.jpg');
    await expect(echec).rejects.toBeInstanceOf(ObjetProofStoreError);
    await expect(echec).rejects.toThrow(/suppression/);
  });
});

describe('ObjetProofStore — construction et URL', () => {
  it('construction : URL ou clé absente — échec nommant la variable', () => {
    expect(() => new ObjetProofStore({ baseUrl: '', key: CLE })).toThrow(ObjetProofStoreConfigError);
    expect(() => new ObjetProofStore({ baseUrl: '  ', key: CLE })).toThrow(PROOF_STORAGE_URL_ENV);
    expect(() => new ObjetProofStore({ baseUrl: BASE_URL, key: '' })).toThrow(PROOF_STORAGE_KEY_ENV);
    expect(() => new ObjetProofStore({ baseUrl: BASE_URL, key: CLE, bucket: ' ' })).toThrow(
      PROOF_STORAGE_BUCKET_ENV,
    );
  });

  it('normaliserUrlStockage : URL de projet complétée, chemin explicite respecté', () => {
    expect(normaliserUrlStockage('https://projet.supabase.co')).toBe(
      'https://projet.supabase.co/storage/v1',
    );
    expect(normaliserUrlStockage('https://projet.supabase.co/')).toBe(
      'https://projet.supabase.co/storage/v1',
    );
    expect(normaliserUrlStockage('https://projet.supabase.co/storage/v1/')).toBe(
      'https://projet.supabase.co/storage/v1',
    );
    expect(() => normaliserUrlStockage('pas-une-url')).toThrow(PROOF_STORAGE_URL_ENV);
  });

  it('le bucket configuré est celui adressé', async () => {
    const appels: string[] = [];
    const store = new ObjetProofStore({
      baseUrl: BASE_URL,
      key: CLE,
      bucket: 'preuves-recette',
      transport: async (url) => {
        appels.push(url);
        return Response.json({ Key: 'x' }, { status: 200 });
      },
    });

    const stored = await store.put(jpegBytes(32), 'jpeg');
    expect(appels[0]).toBe(`${BASE_URL}/object/preuves-recette/${stored.storageKey}`);
  });
});

describe('getProofStore — sélection par configuration', () => {
  const variables = [
    PROOF_STORAGE_DRIVER_ENV,
    PROOF_STORAGE_URL_ENV,
    PROOF_STORAGE_KEY_ENV,
    PROOF_STORAGE_BUCKET_ENV,
  ];
  const sauvegarde = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const nom of variables) {
      sauvegarde.set(nom, process.env[nom]);
      delete process.env[nom];
    }
    resetProofStoreForTests();
  });

  afterEach(() => {
    for (const nom of variables) {
      const valeur = sauvegarde.get(nom);
      if (valeur === undefined) {
        delete process.env[nom];
      } else {
        process.env[nom] = valeur;
      }
    }
    resetProofStoreForTests();
    vi.restoreAllMocks();
  });

  it('aucune configuration de stockage objet : le disque local reste le défaut', () => {
    expect(getProofStore()).toBeInstanceOf(LocalDiskProofStore);
    // Mémoïsation conservée.
    expect(getProofStore()).toBe(getProofStore());
  });

  it('PROOF_STORAGE_DRIVER=disque : disque local explicite', () => {
    process.env[PROOF_STORAGE_DRIVER_ENV] = 'disque';
    expect(getProofStore()).toBeInstanceOf(LocalDiskProofStore);
  });

  it('PROOF_STORAGE_DRIVER=objet configuré : stockage objet retenu et mémoïsé', () => {
    process.env[PROOF_STORAGE_DRIVER_ENV] = 'objet';
    process.env[PROOF_STORAGE_URL_ENV] = BASE_URL;
    process.env[PROOF_STORAGE_KEY_ENV] = CLE;

    const store = getProofStore();
    expect(store).toBeInstanceOf(ObjetProofStore);
    expect(getProofStore()).toBe(store);
  });

  it('stockage objet désigné sans clé : échec nommant la variable, AUCUN appel réseau', () => {
    process.env[PROOF_STORAGE_DRIVER_ENV] = 'objet';
    process.env[PROOF_STORAGE_URL_ENV] = BASE_URL;
    const reseau = vi.spyOn(globalThis, 'fetch');

    expect(() => getProofStore()).toThrow(ObjetProofStoreConfigError);
    expect(() => getProofStore()).toThrow(PROOF_STORAGE_KEY_ENV);
    expect(reseau).not.toHaveBeenCalled();
  });

  it('stockage objet désigné sans URL : échec nommant la variable', () => {
    process.env[PROOF_STORAGE_DRIVER_ENV] = 'objet';
    process.env[PROOF_STORAGE_KEY_ENV] = CLE;

    expect(() => getProofStore()).toThrow(PROOF_STORAGE_URL_ENV);
  });

  it('valeur de sélecteur inconnue : échec nommé, jamais un repli silencieux sur le disque', () => {
    process.env[PROOF_STORAGE_DRIVER_ENV] = 's3';

    expect(() => getProofStore()).toThrow(PROOF_STORAGE_DRIVER_ENV);
    expect(() => getProofStore()).toThrow(/inconnue/);
  });

  it('une configuration incomplète n’est pas mémoïsée : poser la variable suffit à relever', () => {
    process.env[PROOF_STORAGE_DRIVER_ENV] = 'objet';
    process.env[PROOF_STORAGE_URL_ENV] = BASE_URL;
    expect(() => getProofStore()).toThrow(ObjetProofStoreConfigError);

    process.env[PROOF_STORAGE_KEY_ENV] = CLE;
    expect(getProofStore()).toBeInstanceOf(ObjetProofStore);
  });
});
