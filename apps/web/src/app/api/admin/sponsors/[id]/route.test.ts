import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteSponsorRoute, PATCH as patchSponsor } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { SponsorNotFoundError } from '@/modules/sponsors/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const sponsorsServiceMock = vi.hoisted(() => ({
  updateSponsor: vi.fn(),
  deleteSponsor: vi.fn(),
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
  signature: false,
  createdAt: '2026-10-21T09:00:00.000Z',
};

function context(id = 'sponsor-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(
  raw: string,
  withCookie = true,
  length: number | null = raw.length,
): NextRequest {
  return new NextRequest(`${BASE}/api/admin/sponsors/sponsor-1`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(length === null ? {} : { 'content-length': String(length) }),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: raw,
    duplex: 'half',
  });
}

function deleteRequest(withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/sponsors/sponsor-1`, {
    method: 'DELETE',
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  sponsorsServiceMock.updateSponsor.mockReset();
  sponsorsServiceMock.deleteSponsor.mockReset();
});

describe('PATCH /api/admin/sponsors/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await patchSponsor(patchRequest('{"name":"Ifri"}', false), context());
    expect(response.status).toBe(401);
    expect(sponsorsServiceMock.updateSponsor).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden, sans fuite', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await patchSponsor(patchRequest('{"name":"Ifri"}'), context());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(sponsorsServiceMock.updateSponsor).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await patchSponsor(patchRequest('{"name":"Ifri"}'), context());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('corps illisible : 400 admin.sponsors.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await patchSponsor(patchRequest('pas du json'), context());
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.sponsors.invalid_body');
    expect(sponsorsServiceMock.updateSponsor).not.toHaveBeenCalled();
  });

  it('sponsor introuvable (ou d’une autre org) : 404 admin.sponsors.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.updateSponsor.mockRejectedValue(new SponsorNotFoundError());
    const response = await patchSponsor(patchRequest('{"name":"Ifri"}'), context());
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.sponsors.not_found');
  });

  it('session organisateur : 200 renvoie le sponsor mis à jour, id transmis', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.updateSponsor.mockResolvedValue(SPONSOR);
    const response = await patchSponsor(patchRequest('{"name":"Ifri"}'), context('sponsor-1'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, sponsor: SPONSOR });
    expect(sponsorsServiceMock.updateSponsor).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'sponsor-1',
      { name: 'Ifri' },
    );
  });
});

describe('DELETE /api/admin/sponsors/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await deleteSponsorRoute(deleteRequest(false), context());
    expect(response.status).toBe(401);
    expect(sponsorsServiceMock.deleteSponsor).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await deleteSponsorRoute(deleteRequest(), context());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(sponsorsServiceMock.deleteSponsor).not.toHaveBeenCalled();
  });

  it('sponsor introuvable : 404 admin.sponsors.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.deleteSponsor.mockRejectedValue(new SponsorNotFoundError());
    const response = await deleteSponsorRoute(deleteRequest(), context());
    expect(response.status).toBe(404);
  });

  it('session organisateur : 200 { ok: true }', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.deleteSponsor.mockResolvedValue({ ok: true });
    const response = await deleteSponsorRoute(deleteRequest(), context('sponsor-1'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sponsorsServiceMock.deleteSponsor).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'sponsor-1',
    );
  });
});
