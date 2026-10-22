import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postMission } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  InvalidMissionFieldsError,
  SecteurNotFoundError,
} from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  createMission: vi.fn(),
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

const CORPS_VALIDE = {
  secteurId: 'secteur-1',
  type: 'scan_checkpoint',
  titre: 'Scan PK 12',
  debutLe: '2027-05-16T05:00:00.000Z',
  finLe: '2027-05-16T11:00:00.000Z',
};

const MISSION = {
  id: 'mission-1',
  secteurId: 'secteur-1',
  type: 'scan_checkpoint',
  typeLabel: 'Scan checkpoint',
  titre: 'Scan PK 12',
  debutLe: '2027-05-16T05:00:00.000Z',
  finLe: '2027-05-16T11:00:00.000Z',
  consignes: null,
  affectations: [],
  couverture: 'vacante',
  couvertureLabel: 'Vacante',
};

function request(withCookie: boolean, corps: unknown = CORPS_VALIDE): NextRequest {
  return new NextRequest(BASE + '/api/admin/missions/mission', {
    method: 'POST',
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
  missionsServiceMock.createMission.mockReset();
});

describe('POST /api/admin/missions/mission', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postMission(request(false));
    expect(response.status).toBe(401);
    expect(missionsServiceMock.createMission).not.toHaveBeenCalled();
  });

  it('session coureur : 403', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postMission(request(true));
    expect(response.status).toBe(403);
    expect(missionsServiceMock.createMission).not.toHaveBeenCalled();
  });

  it('base indisponible : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postMission(request(true));
    expect(response.status).toBe(503);
  });

  it('type hors liste fermée : 400 admin.missions.mission_invalid avec fields.type', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createMission.mockRejectedValue(
      new InvalidMissionFieldsError({ type: 'Choisis un type de mission parmi la liste.' }),
    );
    const response = await postMission(request(true, { ...CORPS_VALIDE, type: 'cuisine' }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string }; fields: { type?: string } };
    expect(body.error.code).toBe('admin.missions.mission_invalid');
    expect(body.fields.type).toContain('type');
  });

  it('horaires invalides (fin ≤ début) : 400 avec fields.finLe', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createMission.mockRejectedValue(
      new InvalidMissionFieldsError({ finLe: 'La fin doit être après le début.' }),
    );
    const response = await postMission(
      request(true, { ...CORPS_VALIDE, finLe: CORPS_VALIDE.debutLe }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { fields: { finLe?: string } };
    expect(body.fields.finLe).toContain('après le début');
  });

  it('secteur d’une autre organisation : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createMission.mockRejectedValue(new SecteurNotFoundError());
    const response = await postMission(request(true, { ...CORPS_VALIDE, secteurId: 'secteur-autre' }));
    expect(response.status).toBe(404);
  });

  it('session organisateur : 201 avec mission vacante et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createMission.mockResolvedValue(MISSION);
    const response = await postMission(request(true));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, mission: MISSION });
  });
});
