import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteMission, PUT as putMission } from './route';

import { MissionNotFoundError } from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  updateMission: vi.fn(),
  deleteMission: vi.fn(),
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

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'kahina@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const CORPS = {
  secteurId: 'secteur-1',
  type: 'accueil',
  titre: 'Accueil village',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
};

function request(id: string, method: 'PUT' | 'DELETE', withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/missions/mission/${id}`, {
    method,
    headers: {
      ...(method === 'PUT'
        ? {
            'content-type': 'application/json',
            'content-length': String(JSON.stringify(CORPS).length),
          }
        : {}),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: method === 'PUT' ? JSON.stringify(CORPS) : undefined,
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.updateMission.mockReset();
  missionsServiceMock.deleteMission.mockReset();
});

describe('PUT /api/admin/missions/mission/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await putMission(request('mission-1', 'PUT', false), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    expect(response.status).toBe(401);
    expect(missionsServiceMock.updateMission).not.toHaveBeenCalled();
  });

  it('session volontaire (non-organisateur) : 403', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await putMission(request('mission-1', 'PUT'), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    expect(response.status).toBe(403);
    expect(missionsServiceMock.updateMission).not.toHaveBeenCalled();
  });

  it('mission d’une autre organisation : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateMission.mockRejectedValue(new MissionNotFoundError());
    const response = await putMission(request('mission-autre', 'PUT'), {
      params: Promise.resolve({ id: 'mission-autre' }),
    });
    expect(response.status).toBe(404);
  });

  it('session organisateur : 200 { ok: true } (réponse minimale, le client refresh), no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateMission.mockResolvedValue({
      id: 'mission-1',
      ...CORPS,
      typeLabel: 'Accueil',
      consignes: null,
      affectations: [],
      couverture: 'vacante',
      couvertureLabel: 'Vacante',
    });
    const response = await putMission(request('mission-1', 'PUT'), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(missionsServiceMock.updateMission).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'mission-1',
      CORPS,
    );
  });
});

describe('DELETE /api/admin/missions/mission/[id]', () => {
  it('sans cookie : 401', async () => {
    const response = await deleteMission(request('mission-1', 'DELETE', false), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('mission affectée : 200 — suppression + cascade affectations (service)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteMission.mockResolvedValue({ ok: true });
    const response = await deleteMission(request('mission-1', 'DELETE'), {
      params: Promise.resolve({ id: 'mission-1' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('mission inconnue : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteMission.mockRejectedValue(new MissionNotFoundError());
    const response = await deleteMission(request('mission-autre', 'DELETE'), {
      params: Promise.resolve({ id: 'mission-autre' }),
    });
    expect(response.status).toBe(404);
  });
});
