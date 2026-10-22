import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteAffectation, POST as postAffectation } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  InvalidAffectationError,
  MissionNotFoundError,
  VolontaireNotFoundError,
} from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  affecterVolontaire: vi.fn(),
  desaffecterVolontaire: vi.fn(),
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

const CORPS = { missionId: 'mission-1', volontaireId: 'volontaire-1' };

const AVERTISSEMENT = {
  missions: [
    {
      missionId: 'mission-b',
      secteurNom: 'Secteur B',
      typeLabel: 'Sécurité tronçon',
      titre: 'Barrière PK 10',
      debutLe: '2027-05-16T10:00:00.000Z',
      finLe: '2027-05-16T14:00:00.000Z',
    },
  ],
};

function request(
  method: 'POST' | 'DELETE',
  withCookie: boolean,
  corps: unknown = CORPS,
): NextRequest {
  return new NextRequest(BASE + '/api/admin/missions/affectation', {
    method,
    headers: {
      'content-type': 'application/json',
      'content-length': String(JSON.stringify(corps).length),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: typeof corps === 'string' ? corps : JSON.stringify(corps),
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.affecterVolontaire.mockReset();
  missionsServiceMock.desaffecterVolontaire.mockReset();
});

describe('POST /api/admin/missions/affectation', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postAffectation(request('POST', false));
    expect(response.status).toBe(401);
    expect(missionsServiceMock.affecterVolontaire).not.toHaveBeenCalled();
  });

  it('session coureur : 403', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(403);
    expect(missionsServiceMock.affecterVolontaire).not.toHaveBeenCalled();
  });

  it('base indisponible : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(503);
  });

  it('corps incomplet : 400 admin.missions.affectation_invalid', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockRejectedValue(new InvalidAffectationError());
    const response = await postAffectation(request('POST', true, { missionId: 'mission-1' }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.missions.affectation_invalid');
  });

  it('volontaire d’une autre organisation : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockRejectedValue(new VolontaireNotFoundError());
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(404);
  });

  it('mission d’une autre organisation : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockRejectedValue(new MissionNotFoundError());
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(404);
  });

  it('sans chevauchement : 200, cree true, avertissement null, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockResolvedValue({
      ok: true,
      cree: true,
      avertissement: null,
    });
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      cree: true,
      avertissement: null,
    });
  });

  it('chevauchement : 200 quand même — avertissement propagé, jamais bloquant', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockResolvedValue({
      ok: true,
      cree: true,
      avertissement: AVERTISSEMENT,
    });
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { cree: boolean; avertissement: typeof AVERTISSEMENT };
    expect(body.cree).toBe(true);
    expect(body.avertissement.missions[0]?.titre).toBe('Barrière PK 10');
  });

  it('doublon (ré-affectation) : 200 cree false, idempotent', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockResolvedValue({
      ok: true,
      cree: false,
      avertissement: null,
    });
    const response = await postAffectation(request('POST', true));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ cree: false });
  });

  it('corps illisible : 400 (InvalidAffectationError enveloppé par le service)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.affecterVolontaire.mockRejectedValue(new InvalidAffectationError());
    const response = await postAffectation(request('POST', true, ''));
    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/admin/missions/affectation (par corps)', () => {
  it('sans cookie : 401', async () => {
    const response = await deleteAffectation(request('DELETE', false));
    expect(response.status).toBe(401);
    expect(missionsServiceMock.desaffecterVolontaire).not.toHaveBeenCalled();
  });

  it('session coureur : 403', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await deleteAffectation(request('DELETE', true));
    expect(response.status).toBe(403);
  });

  it('corps incomplet : 400', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.desaffecterVolontaire.mockRejectedValue(new InvalidAffectationError());
    const response = await deleteAffectation(
      request('DELETE', true, { volontaireId: 'volontaire-1' }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.missions.affectation_invalid');
  });

  it('dernière affectation supprimée : 200 supprime true (mission repasse vacante)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.desaffecterVolontaire.mockResolvedValue({ ok: true, supprime: true });
    const response = await deleteAffectation(request('DELETE', true));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, supprime: true });
  });

  it('déjà désaffecté : 200 supprime false — idempotent, pas d’erreur', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.desaffecterVolontaire.mockResolvedValue({ ok: true, supprime: false });
    const response = await deleteAffectation(request('DELETE', true));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, supprime: false });
  });
});
