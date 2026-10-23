import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getEtatCourseRoute } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 5.1 — route GET /api/admin/course/etat : guardAdmin (401/403/503),
// no-store, agrégats complets sérialisés. Isolée par mocks (pattern routes
// admin) : la garde passe par iam/service, l'agrégation par chrono/service.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const chronoServiceMock = vi.hoisted(() => ({
  getEtatCourse: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const BASE = 'http://localhost:3000';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_COUREUR = {
  ...SESSION_ORGANISATEUR,
  accountId: 'account-coureur',
  email: 'coureur@exemple.dz',
  role: 'coureur',
};

const ETAT = {
  edition: { id: 'edition-1', nom: 'Édition 2027' },
  partants: [
    { epreuveId: 'ep-1', epreuveNom: 'La Longue', total: 12 },
    { epreuveId: 'ep-2', epreuveNom: 'La Moyenne', total: 30 },
  ],
  retraits: 42,
  arrives: 7,
  enCourse: 35,
  abandones: 0,
  arriveeDefinie: true,
  checkpoints: [
    {
      id: 'cp-1',
      titre: 'Scan km 12',
      estArrivee: true,
      passages: [{ dossard: 101, horodatageReception: '2027-05-16T07:05:09.000Z' }],
    },
  ],
  alertes: [
    {
      dossard: 101,
      checkpointId: 'cp-1',
      checkpointTitre: 'Scan km 12',
      barriereLe: '2027-05-16T10:00:00.000Z',
      contactSecteur: null,
    },
  ],
  fraicheur: '2027-05-16T07:05:09.000Z',
  genereA: '2027-05-16T07:05:12.000Z',
};

function request(withCookie: boolean): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/etat', {
    method: 'GET',
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  chronoServiceMock.getEtatCourse.mockReset();
});

describe('GET /api/admin/course/etat', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getEtatCourseRoute(request(false));
    expect(response.status).toBe(401);
    expect(chronoServiceMock.getEtatCourse).not.toHaveBeenCalled();
  });

  it('session coureur : 403, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getEtatCourseRoute(request(true));
    expect(response.status).toBe(403);
    expect(chronoServiceMock.getEtatCourse).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getEtatCourseRoute(request(true));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('session organisateur : 200 no-store avec agrégats complets + genereA', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const response = await getEtatCourseRoute(request(true));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, etat: ETAT });
    expect(chronoServiceMock.getEtatCourse).toHaveBeenCalledWith(SESSION_ORGANISATEUR);
  });

  it('erreur inattendue : 500 enveloppe admin.course.erreur_inconnue', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.getEtatCourse.mockRejectedValue(new Error('boom'));
    const response = await getEtatCourseRoute(request(true));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.erreur_inconnue');
  });
});
