import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as listerAppareilsRoute } from './route';
import { POST as revoquerRoute } from './[id]/revoquer/route';

import { AppareilNotFoundError } from '@/modules/chrono/errors';

// Story 4.5 — tests des routes admin appareils : garde organisateur
// (401/403 sinon), liste sérialisée ISO, révocation idempotente et 404
// (appareil d'une autre organisation).

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const chronoServiceMock = vi.hoisted(() => ({
  listerAppareils: vi.fn(),
  revoquerAppareil: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const BASE = 'http://localhost:3000';

const SESSION_ADMIN = {
  accountId: 'account-admin',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const APPAREIL = {
  id: 'appareil-uuid-1',
  appareilClient: 'app-client-1',
  revokedAt: null,
  lastSyncAt: new Date('2027-05-16T07:06:00.000Z'),
  createdAt: new Date('2026-10-23T08:00:00.000Z'),
};

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  chronoServiceMock.listerAppareils.mockReset();
  chronoServiceMock.revoquerAppareil.mockReset();
});

describe('GET /api/admin/appareils', () => {
  it('sans cookie : 401 iam.unauthenticated', async () => {
    const response = await listerAppareilsRoute(
      new NextRequest(BASE + '/api/admin/appareils'),
    );
    expect(response.status).toBe(401);
  });

  it('session volontaire : 403 iam.forbidden (surface PC uniquement)', async () => {
    iamServiceMock.getSession.mockResolvedValue({ ...SESSION_ADMIN, role: 'volontaire' });
    const response = await listerAppareilsRoute(
      new NextRequest(BASE + '/api/admin/appareils', {
        headers: { cookie: 'azzel_session=jeton-session' },
      }),
    );
    expect(response.status).toBe(403);
  });

  it('session organisateur : 200 liste ISO + no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ADMIN);
    chronoServiceMock.listerAppareils.mockResolvedValue([APPAREIL]);
    const response = await listerAppareilsRoute(
      new NextRequest(BASE + '/api/admin/appareils', {
        headers: { cookie: 'azzel_session=jeton-session' },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      appareils: {
        id: string;
        appareilClient: string;
        revokedAt: string | null;
        lastSyncAt: string | null;
        createdAt: string;
      }[];
    };
    expect(body.appareils).toEqual([
      {
        id: 'appareil-uuid-1',
        appareilClient: 'app-client-1',
        revokedAt: null,
        lastSyncAt: '2027-05-16T07:06:00.000Z',
        createdAt: '2026-10-23T08:00:00.000Z',
      },
    ]);
  });
});

describe('POST /api/admin/appareils/[id]/revoquer', () => {
  function requeteRevocation(id: string, avecCookie = true): NextRequest {
    return new NextRequest(`${BASE}/api/admin/appareils/${id}/revoquer`, {
      method: 'POST',
      headers: avecCookie ? { cookie: 'azzel_session=jeton-session' } : {},
    });
  }

  it('sans cookie : 401, révocation non tentée', async () => {
    const response = await revoquerRoute(requeteRevocation('appareil-uuid-1', false), {
      params: Promise.resolve({ id: 'appareil-uuid-1' }),
    });
    expect(response.status).toBe(401);
    expect(chronoServiceMock.revoquerAppareil).not.toHaveBeenCalled();
  });

  it('appareil d’une autre organisation : 404 admin.appareils.not_found, VOUVOIEMENT (jamais volontaires.*)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ADMIN);
    chronoServiceMock.revoquerAppareil.mockRejectedValue(new AppareilNotFoundError());
    const response = await revoquerRoute(requeteRevocation('appareil-etranger'), {
      params: Promise.resolve({ id: 'appareil-etranger' }),
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.appareils.not_found');
    expect(body.error.message).toContain('votre organisation');
  });

  it('nominal : 200 appareil révoqué (revokedAt ISO), id transmis au service', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ADMIN);
    chronoServiceMock.revoquerAppareil.mockResolvedValue({
      ...APPAREIL,
      revokedAt: new Date('2027-05-16T09:00:00.000Z'),
    });
    const response = await revoquerRoute(requeteRevocation('appareil-uuid-1'), {
      params: Promise.resolve({ id: 'appareil-uuid-1' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { appareil: { revokedAt: string } };
    expect(body.appareil.revokedAt).toBe('2027-05-16T09:00:00.000Z');
    expect(chronoServiceMock.revoquerAppareil).toHaveBeenCalledWith(
      SESSION_ADMIN,
      'appareil-uuid-1',
    );
  });
});
