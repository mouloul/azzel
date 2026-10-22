import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getConfig, PUT as putConfig } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { InvalidTrailerUrlError } from '@/modules/retour-images/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const serviceMock = vi.hoisted(() => ({
  getRetourImagesAdminState: vi.fn(),
  setTrailerUrl: vi.fn(),
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

function request(
  method: 'GET' | 'PUT' = 'GET',
  raw?: string,
  withCookie = true,
  length: number | null = raw?.length ?? null,
): NextRequest {
  return new NextRequest(BASE + '/api/admin/retour-images/config', {
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
  serviceMock.getRetourImagesAdminState.mockReset();
  serviceMock.setTrailerUrl.mockReset();
});

describe('GET /api/admin/retour-images/config', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getConfig(request('GET', undefined, false));
    expect(response.status).toBe(401);
    expect(serviceMock.getRetourImagesAdminState).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getConfig(request());
    expect(response.status).toBe(403);
    expect(serviceMock.getRetourImagesAdminState).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getConfig(request());
    expect(response.status).toBe(503);
  });

  it('session organisateur : 200 avec l’URL courante', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.getRetourImagesAdminState.mockResolvedValue({
      trailerUrl: 'https://youtu.be/AbCdEf12345',
      temoignages: [],
    });
    const response = await getConfig(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trailerUrl: 'https://youtu.be/AbCdEf12345',
    });
  });
});

describe('PUT /api/admin/retour-images/config', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await putConfig(request('PUT', '{"trailerUrl":""}', false));
    expect(response.status).toBe(401);
    expect(serviceMock.setTrailerUrl).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await putConfig(request('PUT', '{"trailerUrl":""}'));
    expect(response.status).toBe(403);
    expect(serviceMock.setTrailerUrl).not.toHaveBeenCalled();
  });

  it('corps illisible : 400 admin.retour-images.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await putConfig(request('PUT', 'pas du json'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.invalid_body');
  });

  it('URL non https : 400 champ nommé trailerUrl (comme le GPX)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.setTrailerUrl.mockRejectedValue(
      new InvalidTrailerUrlError({
        trailerUrl: 'L’adresse de la vidéo doit commencer par https://.',
      }),
    );
    const response = await putConfig(request('PUT', '{"trailerUrl":"http://video.dz/t.mp4"}'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: { trailerUrl?: string };
    };
    expect(body.error.code).toBe('admin.retour-images.invalid_trailer_url');
    expect(body.fields.trailerUrl).toContain('https://');
  });

  it('URL vide : retrait propre (null) — pas encore de vidéo', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.setTrailerUrl.mockResolvedValue({
      trailerUrl: null,
      updatedAt: '2026-10-22T09:00:00.000Z',
    });
    const response = await putConfig(request('PUT', '{"trailerUrl":"  "}'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trailerUrl: null,
      updatedAt: '2026-10-22T09:00:00.000Z',
    });
    expect(serviceMock.setTrailerUrl).toHaveBeenCalledWith(SESSION_ORGANISATEUR, {
      trailerUrl: '  ',
    });
  });

  it('URL https valide : 200 avec la config écrite', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.setTrailerUrl.mockResolvedValue({
      trailerUrl: 'https://youtu.be/AbCdEf12345',
      updatedAt: '2026-10-22T09:00:00.000Z',
    });
    const response = await putConfig(
      request('PUT', '{"trailerUrl":"https://youtu.be/AbCdEf12345"}'),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trailerUrl: 'https://youtu.be/AbCdEf12345',
      updatedAt: '2026-10-22T09:00:00.000Z',
    });
  });
});
