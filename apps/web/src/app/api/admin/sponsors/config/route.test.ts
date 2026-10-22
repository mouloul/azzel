import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getConfig, PUT as putConfig } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { SponsorModeInvalidError } from '@/modules/sponsors/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const sponsorsServiceMock = vi.hoisted(() => ({
  getSponsorsAdminState: vi.fn(),
  setSponsorMode: vi.fn(),
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

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/sponsors/config', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

function putRequest(
  raw: string,
  withCookie = true,
  length: number | null = raw.length,
): NextRequest {
  return new NextRequest(BASE + '/api/admin/sponsors/config', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(length === null ? {} : { 'content-length': String(length) }),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: raw,
    duplex: 'half',
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  sponsorsServiceMock.getSponsorsAdminState.mockReset();
  sponsorsServiceMock.setSponsorMode.mockReset();
});

describe('GET /api/admin/sponsors/config', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getConfig(getRequest(false));
    expect(response.status).toBe(401);
    expect(sponsorsServiceMock.getSponsorsAdminState).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getConfig(getRequest());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(sponsorsServiceMock.getSponsorsAdminState).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getConfig(getRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('session organisateur : 200 { mode } et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.getSponsorsAdminState.mockResolvedValue({
      mode: 'B',
      sponsors: [],
    });
    const response = await getConfig(getRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ mode: 'B' });
  });
});

describe('PUT /api/admin/sponsors/config', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await putConfig(putRequest('{"mode":"B"}', false));
    expect(response.status).toBe(401);
    expect(sponsorsServiceMock.setSponsorMode).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden — un coureur ne bascule jamais le mode', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await putConfig(putRequest('{"mode":"B"}'));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(sponsorsServiceMock.setSponsorMode).not.toHaveBeenCalled();
  });

  it('corps illisible : 400 admin.sponsors.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await putConfig(putRequest('pas du json'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.sponsors.invalid_body');
  });

  it('mode invalide : 400 admin.sponsors.mode_invalid', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.setSponsorMode.mockRejectedValue(new SponsorModeInvalidError());
    const response = await putConfig(putRequest('{"mode":"C"}'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.sponsors.mode_invalid');
  });

  it('session organisateur : 200 renvoie le mode appliqué', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    sponsorsServiceMock.setSponsorMode.mockResolvedValue({
      mode: 'B',
      updatedAt: '2026-10-21T10:00:00.000Z',
    });
    const response = await putConfig(putRequest('{"mode":"B"}'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      mode: 'B',
      updatedAt: '2026-10-21T10:00:00.000Z',
    });
    expect(sponsorsServiceMock.setSponsorMode).toHaveBeenCalledWith(SESSION_ORGANISATEUR, {
      mode: 'B',
    });
  });
});
