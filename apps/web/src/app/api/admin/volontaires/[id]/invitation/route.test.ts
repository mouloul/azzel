import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postInvitation } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { VolontaireDejaActifError, VolontaireNotFoundError } from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  renvoyerInvitation: vi.fn(),
}));

vi.mock(
  '@/modules/missions/service',
  () =>
    missionsServiceMock as unknown as typeof import('@/modules/missions/service'),
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

function request(id: string, withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/volontaires/${id}/invitation`, {
    method: 'POST',
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.renvoyerInvitation.mockReset();
});

describe('POST /api/admin/volontaires/[id]/invitation — renvoi manuel', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postInvitation(request('v-1', false), {
      params: Promise.resolve({ id: 'v-1' }),
    });
    expect(response.status).toBe(401);
    expect(missionsServiceMock.renvoyerInvitation).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postInvitation(request('v-1'), {
      params: Promise.resolve({ id: 'v-1' }),
    });
    expect(response.status).toBe(403);
  });

  it('base indisponible (garde) : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postInvitation(request('v-1'), {
      params: Promise.resolve({ id: 'v-1' }),
    });
    expect(response.status).toBe(503);
  });

  it('session organisateur : 200 avec email (aucune expiration — plus de jeton), no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.renvoyerInvitation.mockResolvedValue({
      email: 'kahina@exemple.dz',
    });
    const response = await postInvitation(request('v-1'), {
      params: Promise.resolve({ id: 'v-1' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      email: 'kahina@exemple.dz',
    });
    expect(missionsServiceMock.renvoyerInvitation).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'v-1',
    );
  });

  it('volontaire d’une autre organisation : 404 admin.volontaires.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.renvoyerInvitation.mockRejectedValue(new VolontaireNotFoundError());
    const response = await postInvitation(request('v-autre'), {
      params: Promise.resolve({ id: 'v-autre' }),
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.volontaires.not_found');
  });

  it('volontaire déjà activé : 409 admin.volontaires.deja_actif', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.renvoyerInvitation.mockRejectedValue(new VolontaireDejaActifError());
    const response = await postInvitation(request('v-1'), {
      params: Promise.resolve({ id: 'v-1' }),
    });
    expect(response.status).toBe(409);
  });
});
