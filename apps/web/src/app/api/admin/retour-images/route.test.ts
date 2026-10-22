import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getRetourImages, POST as postTemoignage } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { InvalidTemoignageFieldsError } from '@/modules/retour-images/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const serviceMock = vi.hoisted(() => ({
  getRetourImagesAdminState: vi.fn(),
  createTemoignage: vi.fn(),
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

const TEMOIGNAGE = {
  id: 'temoignage-1',
  citation: 'Des sentiers magnifiques.',
  prenom: 'Yacine',
  editionReference: 'Trail 2026',
  ordre: 1,
  createdAt: '2026-10-22T09:00:00.000Z',
};

const STATE = { trailerUrl: 'https://youtu.be/AbCdEf12345', temoignages: [TEMOIGNAGE] };

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/retour-images', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

function requestWithBody(
  raw: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  withCookie = true,
  length: number | null = raw.length,
  path = '/api/admin/retour-images',
): NextRequest {
  return new NextRequest(BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(length === null ? {} : { 'content-length': String(length) }),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: method === 'DELETE' ? undefined : raw,
    ...(method === 'DELETE' ? {} : { duplex: 'half' }),
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  serviceMock.getRetourImagesAdminState.mockReset();
  serviceMock.createTemoignage.mockReset();
});

describe('GET /api/admin/retour-images', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getRetourImages(getRequest(false));
    expect(response.status).toBe(401);
    expect(serviceMock.getRetourImagesAdminState).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden, aucune donnée exposée', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getRetourImages(getRequest());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(serviceMock.getRetourImagesAdminState).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getRetourImages(getRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('session organisateur : 200 avec trailer + témoignages et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.getRetourImagesAdminState.mockResolvedValue(STATE);
    const response = await getRetourImages(getRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(STATE);
    expect(serviceMock.getRetourImagesAdminState).toHaveBeenCalledWith(SESSION_ORGANISATEUR);
  });
});

describe('POST /api/admin/retour-images', () => {
  const VALID = JSON.stringify({
    citation: 'Des sentiers magnifiques.',
    prenom: 'Yacine',
    editionReference: 'Trail 2026',
  });

  it('sans cookie : 401, service non appelé', async () => {
    const response = await postTemoignage(requestWithBody(VALID, 'POST', false));
    expect(response.status).toBe(401);
    expect(serviceMock.createTemoignage).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postTemoignage(requestWithBody(VALID, 'POST'));
    expect(response.status).toBe(403);
    expect(serviceMock.createTemoignage).not.toHaveBeenCalled();
  });

  it('corps illisible : 400 admin.retour-images.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postTemoignage(requestWithBody('pas du json', 'POST'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.invalid_body');
    expect(serviceMock.createTemoignage).not.toHaveBeenCalled();
  });

  it('corps trop volumineux : 400 admin.retour-images.body_too_large', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postTemoignage(requestWithBody(VALID, 'POST', true, 4097));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.retour-images.body_too_large');
  });

  it('citation absente : 400 admin.retour-images.invalid_fields avec field citation', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.createTemoignage.mockRejectedValue(
      new InvalidTemoignageFieldsError({ citation: 'La citation est obligatoire.' }),
    );
    const response = await postTemoignage(requestWithBody('{}', 'POST'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: { citation?: string };
    };
    expect(body.error.code).toBe('admin.retour-images.invalid_fields');
    expect(body.fields.citation).toContain('obligatoire');
  });

  it('session organisateur : 201 Created renvoie le témoignage créé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.createTemoignage.mockResolvedValue(TEMOIGNAGE);
    const response = await postTemoignage(requestWithBody(VALID, 'POST'));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, temoignage: TEMOIGNAGE });
    expect(serviceMock.createTemoignage).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      JSON.parse(VALID),
    );
  });

  it('erreur inconnue : 500 admin.retour-images.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    serviceMock.createTemoignage.mockRejectedValue(new Error('boom'));
    const response = await postTemoignage(requestWithBody(VALID, 'POST'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.retour-images.internal_error');
    expect(body.error.message).not.toContain('boom');
  });
});
