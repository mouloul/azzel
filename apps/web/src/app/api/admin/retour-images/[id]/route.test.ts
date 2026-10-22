import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteTemoignage, PATCH as patchTemoignage } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  TemoignageNotFoundError,
} from '@/modules/retour-images/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const serviceMock = vi.hoisted(() => ({
  updateTemoignage: vi.fn(),
  deleteTemoignage: vi.fn(),
}));

vi.mock(
  '@/modules/retour-images/service',
  () => serviceMock as unknown as typeof import('@/modules/retour-images/service'),
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

const ID = '0b6a4fd0-9e26-4d8e-8f2a-1c2b3d4e5f60';

const TEMOIGNAGE = {
  id: ID,
  citation: 'Des sentiers sublimes.',
  prenom: 'Yacine',
  editionReference: 'Trail 2026',
  ordre: 5,
  createdAt: '2026-10-22T09:00:00.000Z',
};

function context(id: string = ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function request(
  method: 'PATCH' | 'DELETE',
  raw?: string,
  withCookie = true,
  length: number | null = raw?.length ?? null,
): NextRequest {
  return new NextRequest(BASE + `/api/admin/retour-images/${ID}`, {
    method,
    headers: {
      ...(raw !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(length !== null && raw !== undefined ? { 'content-length': String(length) } : {}),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    ...(raw !== undefined ? { body: raw, duplex: 'half' as const } : {}),
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  serviceMock.updateTemoignage.mockReset();
  serviceMock.deleteTemoignage.mockReset();
});

describe('PATCH /api/admin/retour-images/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await patchTemoignage(request('PATCH', '{"citation":"x"}', false), context());
    expect(response.status).toBe(401);
    expect(serviceMock.updateTemoignage).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await patchTemoignage(request('PATCH', '{"citation":"x"}'), context());
    expect(response.status).toBe(403);
    expect(serviceMock.updateTemoignage).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await patchTemoignage(request('PATCH', '{"citation":"x"}'), context());
    expect(response.status).toBe(503);
  });

  it('témoignage d’une autre organisation : 404 admin.retour-images.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.updateTemoignage.mockRejectedValue(new TemoignageNotFoundError());
    const response = await patchTemoignage(request('PATCH', '{"citation":"x"}'), context());
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.not_found');
  });

  it('id non-UUID : 404 propre avant SQL (aucun 22P02/500), service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await patchTemoignage(
      request('PATCH', '{"citation":"x"}'),
      context('pas-un-uuid'),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.not_found');
    expect(serviceMock.updateTemoignage).not.toHaveBeenCalled();
  });

  it('session organisateur : 200 avec le témoignage modifié', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.updateTemoignage.mockResolvedValue(TEMOIGNAGE);
    const response = await patchTemoignage(
      request('PATCH', '{"citation":"Des sentiers sublimes.","ordre":5}'),
      context(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, temoignage: TEMOIGNAGE });
    expect(serviceMock.updateTemoignage).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      ID,
      { citation: 'Des sentiers sublimes.', ordre: 5 },
    );
  });
});

describe('DELETE /api/admin/retour-images/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await deleteTemoignage(request('DELETE', undefined, false), context());
    expect(response.status).toBe(401);
    expect(serviceMock.deleteTemoignage).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await deleteTemoignage(request('DELETE'), context());
    expect(response.status).toBe(403);
    expect(serviceMock.deleteTemoignage).not.toHaveBeenCalled();
  });

  it('introuvable : 404 admin.retour-images.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.deleteTemoignage.mockRejectedValue(new TemoignageNotFoundError());
    const response = await deleteTemoignage(request('DELETE'), context());
    expect(response.status).toBe(404);
  });

  it('id non-UUID : 404 propre avant SQL (aucun 22P02/500), service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await deleteTemoignage(request('DELETE'), context('pas-un-uuid'));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.not_found');
    expect(serviceMock.deleteTemoignage).not.toHaveBeenCalled();
  });

  it('session organisateur : 200 { ok: true }', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.deleteTemoignage.mockResolvedValue({ ok: true });
    const response = await deleteTemoignage(request('DELETE'), context());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(serviceMock.deleteTemoignage).toHaveBeenCalledWith(SESSION_ORGANISATEUR, ID);
  });

  it('témoignage déjà supprimé par ailleurs : 404 enveloppe (delete ne peut lever la limite)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.deleteTemoignage.mockRejectedValue(new TemoignageNotFoundError());
    const response = await deleteTemoignage(request('DELETE'), context());
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.not_found');
  });
});
