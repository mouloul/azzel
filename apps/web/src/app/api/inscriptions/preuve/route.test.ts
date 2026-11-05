import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getPreuve, POST as postPreuve } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  DossierValidatedError,
  NoCoureurError,
  NumeroTransactionDejaUtiliseError,
  ProofFormatError,
  ProofTooLargeError,
  RegistrationClosedError,
} from '@/modules/inscriptions/errors';
import { MAX_UPLOAD_BYTES } from '@/modules/inscriptions/proof-format';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const proofServiceMock = vi.hoisted(() => ({
  getPreuveState: vi.fn(),
  uploadPreuve: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/proof-service',
  () => proofServiceMock as unknown as typeof import('@/modules/inscriptions/proof-service'),
);

const BASE = 'http://localhost:3000';

const SESSION = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const PREUVE = {
  id: 'preuve-1',
  depositedAt: '2026-10-21T10:30:00.000Z',
  sizeBytes: 2048,
  mime: 'image/jpeg',
  format: 'JPEG',
};

const STATE = {
  edition: {
    id: 'edition-1',
    slug: '2027',
    nom: 'Édition 2027',
    dateCourse: '2027-03-26',
    registrationClosesAt: '2027-03-16T22:59:59.000Z',
    registrationOpen: true,
  },
  coureurStatus: 'en constitution',
  preuve: null,
};

const BOUNDARY = 'azzel-test-boundary';

function multipart(
  filename: string,
  bytes: Uint8Array,
  contentType: string,
  field = 'fichier',
  numero: string | null = 'TX1234567890',
): { body: Uint8Array; contentType: string; length: number } {
  const encoder = new TextEncoder();
  const numeroPart =
    numero === null
      ? ''
      : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="numeroTransaction"\r\n\r\n${numero}\r\n`;
  const head = encoder.encode(
    `${numeroPart}--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${BOUNDARY}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, contentType: `multipart/form-data; boundary=${BOUNDARY}`, length: body.length };
}

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.fill(0xab, 4);
  return bytes;
}

function postRequest(
  body: Uint8Array,
  length: number,
  contentType: string,
  withCookie = true,
): NextRequest {
  const bytes = new Uint8Array(body);
  return new NextRequest(BASE + '/api/inscriptions/preuve', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'content-length': String(length),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: bytes.buffer as ArrayBuffer,
    duplex: 'half',
  });
}

function postJsonRequest(raw: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE + '/api/inscriptions/preuve', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(raw.length),
      cookie: 'azzel_session=jeton-session',
      ...headers,
    },
    body: raw,
    duplex: 'half',
  });
}

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/inscriptions/preuve', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  proofServiceMock.getPreuveState.mockReset();
  proofServiceMock.uploadPreuve.mockReset();
});

// Story 3.1 (connexion code unifiée) — surface coureur : toute session d'un
// autre rôle est refusée en 403 iam.forbidden, service jamais appelé.
describe('/api/inscriptions/preuve — rôle unique (story 3.1)', () => {
  for (const role of ['volontaire', 'organisateur'] as const) {
    it(`session ${role} : POST 403 iam.forbidden, service non appelé`, async () => {
      iamServiceMock.getSession.mockResolvedValue({ ...SESSION, role });
      const response = await postPreuve(postJsonRequest('{}'));
      expect(response.status).toBe(403);
      const body = (await response.json()) as { version: number; error: { code: string } };
      expect(body.version).toBe(1);
      expect(body.error.code).toBe('iam.forbidden');
      expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
    });

    it(`session ${role} : GET 403 iam.forbidden, service non appelé`, async () => {
      iamServiceMock.getSession.mockResolvedValue({ ...SESSION, role });
      const response = await getPreuve(getRequest());
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('iam.forbidden');
      expect(proofServiceMock.getPreuveState).not.toHaveBeenCalled();
    });
  }
});

describe('POST /api/inscriptions/preuve', () => {
  it('sans cookie : 401 enveloppe preuve.unauthenticated, service non appelé', async () => {
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');
    const response = await postPreuve(
      postRequest(part.body, part.length, part.contentType, false),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('preuve.unauthenticated');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('session invalide : 401', async () => {
    iamServiceMock.getSession.mockResolvedValue(null);
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.unauthenticated');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe preuve.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.db_unavailable');
  });

  it('corps JSON au lieu de multipart : 400 enveloppe preuve.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postPreuve(postJsonRequest('{"fichier":"x"}'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.invalid_body');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('multipart sans champ fichier : 400 enveloppe preuve.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const encoder = new TextEncoder();
    const body = encoder.encode(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="numeroTransaction"\r\n\r\nTX1234567890\r\n--${BOUNDARY}\r\nContent-Disposition: form-data; name="autre"\r\n\r\nvaleur\r\n--${BOUNDARY}--\r\n`,
    );

    const response = await postPreuve(
      postRequest(body, body.length, `multipart/form-data; boundary=${BOUNDARY}`),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('preuve.invalid_body');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('sans Content-Length (chunked) : 400 enveloppe preuve.invalid_body, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(
      new NextRequest(BASE + '/api/inscriptions/preuve', {
        method: 'POST',
        headers: {
          'content-type': part.contentType,
          cookie: 'azzel_session=jeton-session',
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(part.body);
            controller.close();
          },
        }),
        duplex: 'half',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.invalid_body');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('multipart corrompu (boundary invalide) : 400 enveloppe preuve.invalid_body, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const encoder = new TextEncoder();
    const body = encoder.encode('pas du tout du multipart');

    const response = await postPreuve(
      postRequest(body, body.length, 'multipart/form-data; boundary=inexistante'),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('preuve.invalid_body');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('fichier vide (0 octet) : 400 enveloppe preuve.invalid_body, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const part = multipart('vide.jpg', new Uint8Array(0), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('preuve.invalid_body');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('Content-Length au-delà de la limite (2 Mo) : 400 enveloppe preuve.body_too_large, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(
      postRequest(part.body, MAX_UPLOAD_BYTES + 1, part.contentType),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.body_too_large');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('format refusé côté service : 400 enveloppe preuve.format listant les formats', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(new ProofFormatError());
    const part = multipart('recu.txt', new TextEncoder().encode('pas une image'), 'text/plain');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('preuve.format');
    expect(body.error.message).toContain('JPEG, PNG, WebP ou PDF');
  });

  it('preuve trop lourde côté service : 400 enveloppe preuve.too_large', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(new ProofTooLargeError(480_000));
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.too_large');
  });

  it('non inscrit : 409 enveloppe preuve.no_coureur', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(new NoCoureurError());
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.no_coureur');
  });

  it('après clôture : 403 enveloppe inscriptions.closed', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(
      new RegistrationClosedError(new Date('2027-03-16T22:59:59.000Z')),
    );
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('inscriptions.closed');
    expect(body.error.message).toContain('16 mars 2027');
  });

  it('dossier validé : 409 enveloppe inscriptions.dossier_valide', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(new DossierValidatedError());
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.dossier_valide');
  });

  it('erreur inconnue : 500 enveloppe preuve.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(new Error('boom'));
    const part = multipart('recu.jpg', jpegBytes(64), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('preuve.internal_error');
    expect(body.error.message).not.toContain('boom');
  });

  it('multipart valide : 200 avec { preuve }, service appelé avec la session et les octets du fichier', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockResolvedValue(PREUVE);
    const bytes = jpegBytes(2048);
    const part = multipart('recu-ccp.jpg', bytes, 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { preuve: typeof PREUVE; ok?: unknown };
    expect(body).toEqual({ preuve: PREUVE });
    expect(body.ok).toBeUndefined();
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-session');
    expect(proofServiceMock.uploadPreuve).toHaveBeenCalledTimes(1);
    const call = proofServiceMock.uploadPreuve.mock.calls[0] as [
      typeof SESSION,
      Uint8Array,
      { numeroTransaction: string },
    ];
    expect(call[2]).toEqual({ numeroTransaction: 'TX1234567890' });
    expect(call[0]).toEqual(SESSION);
    expect(call[1].byteLength).toBe(2048);
    expect(Array.from(call[1].slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });
});

describe('POST /api/inscriptions/preuve — numéro de transaction', () => {
  it('sans numéro : 400 preuve.numero_transaction_invalide, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const part = multipart('recu.jpg', jpegBytes(2048), 'image/jpeg', 'fichier', null);

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.numero_transaction_invalide');
    expect(proofServiceMock.uploadPreuve).not.toHaveBeenCalled();
  });

  it('numéro normalisé : espaces retirés, majuscules', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockResolvedValue(PREUVE);
    const part = multipart('recu.jpg', jpegBytes(2048), 'image/jpeg', 'fichier', ' 0125 9424 6237 ');

    await postPreuve(postRequest(part.body, part.length, part.contentType));

    const call = proofServiceMock.uploadPreuve.mock.calls[0] as unknown[];
    expect(call[2]).toEqual({ numeroTransaction: '012594246237' });
  });

  it('numéro déjà utilisé par un autre dossier : 409', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.uploadPreuve.mockRejectedValue(new NumeroTransactionDejaUtiliseError());
    const part = multipart('recu.jpg', jpegBytes(2048), 'image/jpeg');

    const response = await postPreuve(postRequest(part.body, part.length, part.contentType));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.numero_transaction_deja_utilise');
  });
});

describe('GET /api/inscriptions/preuve', () => {
  it('sans cookie : 401', async () => {
    const response = await getPreuve(getRequest(false));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.unauthenticated');
  });

  it('session valide : 200 avec { preuve }, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    proofServiceMock.getPreuveState.mockResolvedValue(STATE);

    const response = await getPreuve(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({ preuve: null });
    expect(proofServiceMock.getPreuveState).toHaveBeenCalledWith(SESSION);
  });

  it('base indisponible : 503 enveloppe preuve.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());

    const response = await getPreuve(getRequest());

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('preuve.db_unavailable');
    expect(proofServiceMock.getPreuveState).not.toHaveBeenCalled();
  });
});
