import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteSecteur, PUT as putSecteur } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  SecteurNomDupliqueError,
  SecteurNotFoundError,
  SecteurOccupeError,
} from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  updateSecteur: vi.fn(),
  deleteSecteur: vi.fn(),
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

function request(id: string, method: 'PUT' | 'DELETE', withCookie = true): NextRequest {
  const headers: Record<string, string> = {
    ...(method === 'PUT'
      ? { 'content-type': 'application/json', 'content-length': '40' }
      : {}),
    ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
  };
  return new NextRequest(`${BASE}/api/admin/missions/secteur/${id}`, {
    method,
    headers,
    body:
      method === 'PUT'
        ? JSON.stringify({ nom: 'Village', lieu: 'Place du village' })
        : undefined,
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.updateSecteur.mockReset();
  missionsServiceMock.deleteSecteur.mockReset();
});

describe('PUT /api/admin/missions/secteur/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await putSecteur(request('secteur-1', 'PUT', false), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(401);
    expect(missionsServiceMock.updateSecteur).not.toHaveBeenCalled();
  });

  it('session coureur : 403', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await putSecteur(request('secteur-1', 'PUT'), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(403);
  });

  it('secteur d’une autre organisation : 404 admin.missions.secteur_not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateSecteur.mockRejectedValue(new SecteurNotFoundError());
    const response = await putSecteur(request('secteur-autre', 'PUT'), {
      params: Promise.resolve({ id: 'secteur-autre' }),
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.missions.secteur_not_found');
  });

  it('nom déjà pris : 409 admin.missions.secteur_duplique', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateSecteur.mockRejectedValue(new SecteurNomDupliqueError());
    const response = await putSecteur(request('secteur-1', 'PUT'), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(409);
  });

  it('session organisateur : 200 { ok: true } (réponse minimale, le client refresh), no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateSecteur.mockResolvedValue({
      id: 'secteur-1',
      nom: 'Village',
      lieu: 'Place du village',
      contact: null,
      missions: [],
    });
    const response = await putSecteur(request('secteur-1', 'PUT'), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(missionsServiceMock.updateSecteur).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'secteur-1',
      expect.objectContaining({ nom: 'Village' }),
    );
  });

  it('base indisponible : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await putSecteur(request('secteur-1', 'PUT'), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(503);
  });
});

describe('DELETE /api/admin/missions/secteur/[id]', () => {
  it('sans cookie : 401', async () => {
    const response = await deleteSecteur(request('secteur-1', 'DELETE', false), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(401);
  });

  it('secteur portant des missions : 409 admin.missions.secteur_occupe « retire ses missions d’abord »', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteSecteur.mockRejectedValue(new SecteurOccupeError(2));
    const response = await deleteSecteur(request('secteur-1', 'DELETE'), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('admin.missions.secteur_occupe');
    expect(body.error.action).toContain('Retire ses missions d’abord');
  });

  it('secteur vide : 200 ok', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteSecteur.mockResolvedValue({ ok: true });
    const response = await deleteSecteur(request('secteur-1', 'DELETE'), {
      params: Promise.resolve({ id: 'secteur-1' }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('secteur inconnu : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteSecteur.mockRejectedValue(new SecteurNotFoundError());
    const response = await deleteSecteur(request('secteur-autre', 'DELETE'), {
      params: Promise.resolve({ id: 'secteur-autre' }),
    });
    expect(response.status).toBe(404);
  });
});
