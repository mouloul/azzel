import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getSponsors, POST as postSponsor } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { InvalidSponsorFieldsError } from '@/modules/sponsors/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const sponsorsServiceMock = vi.hoisted(() => ({
  getSponsorsAdminState: vi.fn(),
  createSponsor: vi.fn(),
}));

vi.mock(
  '@/modules/sponsors/service',
  () =>
    sponsorsServiceMock as unknown as typeof import('@/modules/sponsors/service'),
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

const SPONSOR = {
  id: 'sponsor-1',
  nom: 'Ifri',
  url: null,
  logoUrl: null,
  signature: true,
  createdAt: '2026-10-21T09:00:00.000Z',
};

const STATE = { mode: 'A', sponsors: [SPONSOR] };

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/sponsors', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

function requestWithBody(
  raw: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  withCookie = true,
  length: number | null = raw.length,
  path = '/api/admin/sponsors',
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
  sponsorsServiceMock.getSponsorsAdminState.mockReset();
  sponsorsServiceMock.createSponsor.mockReset();
});

describe('GET /api/admin/sponsors', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getSponsors(getRequest(false));
    expect(response.status).toBe(401);
    expect(sponsorsServiceMock.getSponsorsAdminState).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden, aucune donnée exposée', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getSponsors(getRequest());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(sponsorsServiceMock.getSponsorsAdminState).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getSponsors(getRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('session organisateur : 200 avec mode + liste et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.getSponsorsAdminState.mockResolvedValue(STATE);
    const response = await getSponsors(getRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(STATE);
    expect(sponsorsServiceMock.getSponsorsAdminState).toHaveBeenCalledWith(SESSION_ORGANISATEUR);
  });
});

describe('POST /api/admin/sponsors', () => {
  const VALID = JSON.stringify({ name: 'Ifri' });

  it('sans cookie : 401, service non appelé', async () => {
    const response = await postSponsor(requestWithBody(VALID, 'POST', false));
    expect(response.status).toBe(401);
    expect(sponsorsServiceMock.createSponsor).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postSponsor(requestWithBody(VALID, 'POST'));
    expect(response.status).toBe(403);
    expect(sponsorsServiceMock.createSponsor).not.toHaveBeenCalled();
  });

  it('corps illisible : 400 admin.sponsors.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postSponsor(requestWithBody('pas du json', 'POST'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.sponsors.invalid_body');
    expect(sponsorsServiceMock.createSponsor).not.toHaveBeenCalled();
  });

  it('corps trop volumineux : 400 admin.sponsors.body_too_large', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postSponsor(requestWithBody(VALID, 'POST', true, 4097));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.sponsors.body_too_large');
  });

  it('champs invalides : 400 admin.sponsors.invalid_fields avec fields nommés', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.createSponsor.mockRejectedValue(
      new InvalidSponsorFieldsError({ name: 'Le nom du sponsor est obligatoire.' }),
    );
    const response = await postSponsor(requestWithBody('{}', 'POST'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: { name?: string };
    };
    expect(body.error.code).toBe('admin.sponsors.invalid_fields');
    expect(body.fields.name).toContain('obligatoire');
  });

  it('session organisateur : 201 Created renvoie le sponsor créé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.createSponsor.mockResolvedValue(SPONSOR);
    const response = await postSponsor(requestWithBody(VALID, 'POST'));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, sponsor: SPONSOR });
    expect(sponsorsServiceMock.createSponsor).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      { name: 'Ifri' },
    );
  });

  it('erreur inconnue : 500 admin.sponsors.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.createSponsor.mockRejectedValue(new Error('boom'));
    const response = await postSponsor(requestWithBody(VALID, 'POST'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.sponsors.internal_error');
    expect(body.error.message).not.toContain('boom');
  });
});
