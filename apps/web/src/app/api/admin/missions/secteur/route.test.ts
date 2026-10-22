import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postSecteur } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { InvalidSecteurFieldsError, SecteurNomDupliqueError } from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  createSecteur: vi.fn(),
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

const SECTEUR = { id: 'secteur-1', nom: 'Village', lieu: 'Place du village', contact: null, missions: [] };

function request(
  withCookie: boolean,
  options: { body?: unknown; length?: number | null } = {},
): NextRequest {
  const corps = options.body === undefined ? { nom: 'Village', lieu: 'Place du village' } : options.body;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.length === null ? {} : { 'content-length': String(options.length ?? JSON.stringify(corps).length) }),
    ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
  };
  return new NextRequest(BASE + '/api/admin/missions/secteur', {
    method: 'POST',
    headers,
    body: typeof corps === 'string' ? corps : JSON.stringify(corps),
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.createSecteur.mockReset();
});

describe('POST /api/admin/missions/secteur', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postSecteur(request(false));
    expect(response.status).toBe(401);
    expect(missionsServiceMock.createSecteur).not.toHaveBeenCalled();
  });

  it('session coureur : 403, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postSecteur(request(true));
    expect(response.status).toBe(403);
    expect(missionsServiceMock.createSecteur).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postSecteur(request(true));
    expect(response.status).toBe(503);
  });

  it('sans Content-Length : 400 admin.missions.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postSecteur(request(true, { length: null }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.missions.invalid_body');
  });

  it('corps > 16 Ko : 400 admin.missions.body_too_large, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postSecteur(request(true, { length: 16 * 1024 + 1 }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.missions.body_too_large');
    expect(missionsServiceMock.createSecteur).not.toHaveBeenCalled();
  });

  it('corps non-JSON : 400', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postSecteur(request(true, { body: 'pas-du-json' }));
    expect(response.status).toBe(400);
  });

  it('champs invalides : 400 admin.missions.secteur_invalid avec fields', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createSecteur.mockRejectedValue(
      new InvalidSecteurFieldsError({ nom: 'Le nom du secteur est obligatoire.' }),
    );
    const response = await postSecteur(request(true));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string }; fields: { nom?: string } };
    expect(body.error.code).toBe('admin.missions.secteur_invalid');
    expect(body.fields.nom).toContain('obligatoire');
  });

  it('nom déjà pris sur l’édition : 409 admin.missions.secteur_duplique', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createSecteur.mockRejectedValue(new SecteurNomDupliqueError());
    const response = await postSecteur(request(true));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.missions.secteur_duplique');
  });

  it('session organisateur : 201 avec secteur et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.createSecteur.mockResolvedValue(SECTEUR);
    const response = await postSecteur(request(true));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, secteur: SECTEUR });
    expect(missionsServiceMock.createSecteur).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      expect.objectContaining({ nom: 'Village' }),
    );
  });
});
