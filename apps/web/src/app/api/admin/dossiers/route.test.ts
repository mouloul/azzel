import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as listDossiers } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getDossiersState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
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

const STATE = {
  edition: {
    id: 'edition-1',
    slug: '2027',
    nom: 'Édition 2027',
    dateCourse: '2027-03-26',
    registrationClosesAt: '2027-03-16T22:59:59.000Z',
    registrationOpen: true,
  },
  dossiers: [
    {
      coureurId: 'coureur-1',
      prenom: 'Yani',
      nom: 'Ulahianne',
      email: 'yani@exemple.dz',
      epreuveNom: 'La Grande Boucle — 35 km',
      status: 'en constitution',
      dossard: null,
      refusalReason: null,
      hasActivePreuve: true,
      preuveDepositedAt: '2026-10-21T10:30:00.000Z',
      acceptationsCompletes: true,
      createdAt: '2026-10-20T08:00:00.000Z',
      updatedAt: '2026-10-21T10:30:00.000Z',
    },
    {
      coureurId: 'coureur-2',
      prenom: 'Iness',
      nom: 'Cherchée',
      email: 'iness@exemple.dz',
      epreuveNom: 'La Boucle Moyenne — 12 km',
      status: 'validé',
      dossard: 12,
      refusalReason: null,
      hasActivePreuve: true,
      preuveDepositedAt: '2026-10-21T11:00:00.000Z',
      acceptationsCompletes: true,
      createdAt: '2026-10-19T08:00:00.000Z',
      updatedAt: '2026-10-21T11:00:00.000Z',
    },
  ],
};

function getRequest(withCookie = true, query = ''): NextRequest {
  return new NextRequest(BASE + '/api/admin/dossiers' + query, {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.getDossiersState.mockReset();
});

describe('GET /api/admin/dossiers', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await listDossiers(getRequest(false));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(inscriptionsServiceMock.getDossiersState).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden, aucune donnée exposée', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await listDossiers(getRequest());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('iam.forbidden');
    expect(inscriptionsServiceMock.getDossiersState).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await listDossiers(getRequest());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('session organisateur : 200 avec la liste et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.getDossiersState.mockResolvedValue(STATE);

    const response = await listDossiers(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual(STATE);
    expect(inscriptionsServiceMock.getDossiersState).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      null,
    );
  });

  it('paramètre q transmis au service', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.getDossiersState.mockResolvedValue(STATE);

    const response = await listDossiers(getRequest(true, '?q=ulahianne'));

    expect(response.status).toBe(200);
    expect(inscriptionsServiceMock.getDossiersState).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'ulahianne',
    );
  });

  it('erreur inconnue : 500 admin.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.getDossiersState.mockRejectedValue(new Error('boom'));

    const response = await listDossiers(getRequest());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.internal_error');
    expect(body.error.message).not.toContain('boom');
  });
});
