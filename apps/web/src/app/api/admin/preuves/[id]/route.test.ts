import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as downloadPreuve } from './route';

import {
  PreuveNotFoundError,
  PreuveStorageError,
} from '@/modules/inscriptions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const proofServiceMock = vi.hoisted(() => ({
  readPreuveForOrganisation: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/proof-service',
  () => proofServiceMock as unknown as typeof import('@/modules/inscriptions/proof-service'),
);

const BASE = 'http://localhost:3000';

const SESSION_ORGANISATEUR = {
  accountId: 'account-admin',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_COUREUR = {
  accountId: 'account-coureur',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.fill(0xab, 4);
  return bytes;
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/preuves/preuve-1`, {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  proofServiceMock.readPreuveForOrganisation.mockReset();
});

describe('GET /api/admin/preuves/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await downloadPreuve(getRequest(false), context('preuve-1'));
    expect(response.status).toBe(401);
    expect(proofServiceMock.readPreuveForOrganisation).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await downloadPreuve(getRequest(), context('preuve-1'));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(proofServiceMock.readPreuveForOrganisation).not.toHaveBeenCalled();
  });

  it('preuve absente ou hors org : 404 enveloppe admin.preuve_not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    proofServiceMock.readPreuveForOrganisation.mockRejectedValue(new PreuveNotFoundError());

    const response = await downloadPreuve(getRequest(), context('preuve-1'));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.preuve_not_found');
  });

  it('fichier illisible sur le stockage : 500 enveloppe admin.preuve_storage_error', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    proofServiceMock.readPreuveForOrganisation.mockRejectedValue(
      new PreuveStorageError('uuid.jpg'),
    );

    const response = await downloadPreuve(getRequest(), context('preuve-1'));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.preuve_storage_error');
  });

  it('erreur inconnue côté service : 500 admin.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    proofServiceMock.readPreuveForOrganisation.mockRejectedValue(new Error('boom'));

    const response = await downloadPreuve(getRequest(), context('preuve-1'));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.internal_error');
    expect(body.error.message).not.toContain('boom');
  });

  it('preuve de l’organisation : stream avec mime et filename issus de la base', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const bytes = jpegBytes(2048);
    proofServiceMock.readPreuveForOrganisation.mockResolvedValue({
      preuve: {
        id: 'preuve-1',
        organisationId: 'org-1',
        coureurId: 'coureur-1',
        storageKey: '0dd1662a-1cd6-4a1a-8df1-3f6f6f0a1234.jpg',
        mime: 'image/jpeg',
        sizeBytes: 2048,
        sha256: 'abc',
        status: 'active',
        createdAt: new Date('2026-10-21T10:30:00.000Z'),
      },
      bytes,
    });

    const response = await downloadPreuve(getRequest(), context('preuve-1'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-length')).toBe('2048');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="0dd1662a-1cd6-4a1a-8df1-3f6f6f0a1234.jpg"',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBe(2048);
    expect(Array.from(body.slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(proofServiceMock.readPreuveForOrganisation).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'preuve-1',
    );
  });
});
