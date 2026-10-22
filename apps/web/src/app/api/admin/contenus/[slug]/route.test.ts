import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getContenuRoute, PUT as putContenu } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  ContenuConflitError,
  ContenuNotFoundError,
  InvalidContenuFieldsError,
} from '@/modules/contenus/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const contenusServiceMock = vi.hoisted(() => ({
  getContenu: vi.fn(),
  updateContenu: vi.fn(),
}));

vi.mock(
  '@/modules/contenus/service',
  () =>
    contenusServiceMock as unknown as typeof import('@/modules/contenus/service'),
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

const CONTENU = {
  slug: 'parcours-longue',
  titre: 'Trail long — 35 km',
  corps: 'L’épreuve phare.',
  updatedAt: '2026-10-22T09:00:00.000Z',
  aConfirmer: true,
  epreuve: { slug: 'longue', nom: 'La Longue — 35 km', distanceKm: 35, gpxUrl: null },
};

function context(slug = 'parcours-longue'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

function getRequest(withCookie = true, slug = 'parcours-longue'): NextRequest {
  return new NextRequest(`${BASE}/api/admin/contenus/${slug}`, {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

function putRequest(
  raw: string,
  withCookie = true,
  length: number | null = raw.length,
  slug = 'parcours-longue',
): NextRequest {
  return new NextRequest(`${BASE}/api/admin/contenus/${slug}`, {
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
  contenusServiceMock.getContenu.mockReset();
  contenusServiceMock.updateContenu.mockReset();
});

describe('GET /api/admin/contenus/[slug]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getContenuRoute(getRequest(false), context());
    expect(response.status).toBe(401);
    expect(contenusServiceMock.getContenu).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden, aucune donnée exposée', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getContenuRoute(getRequest(), context());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(contenusServiceMock.getContenu).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getContenuRoute(getRequest(), context());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('slug inconnu : 404 admin.contenus.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.getContenu.mockRejectedValue(new ContenuNotFoundError());
    const response = await getContenuRoute(getRequest(true, 'inconnu'), context('inconnu'));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.contenus.not_found');
  });

  it('session organisateur : 200 avec le bloc et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.getContenu.mockResolvedValue(CONTENU);
    const response = await getContenuRoute(getRequest(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, contenu: CONTENU });
    expect(contenusServiceMock.getContenu).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'parcours-longue',
    );
  });
});

describe('PUT /api/admin/contenus/[slug]', () => {
  const VALID = JSON.stringify({ titre: 'Trail long — 35 km', corps: 'Texte.' });

  it('sans cookie : 401, service non appelé', async () => {
    const response = await putContenu(putRequest(VALID, false), context());
    expect(response.status).toBe(401);
    expect(contenusServiceMock.updateContenu).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await putContenu(putRequest(VALID), context());
    expect(response.status).toBe(403);
    expect(contenusServiceMock.updateContenu).not.toHaveBeenCalled();
  });

  it('corps illisible : 400 admin.contenus.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await putContenu(putRequest('pas du json'), context());
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.contenus.invalid_body');
    expect(contenusServiceMock.updateContenu).not.toHaveBeenCalled();
  });

  it('corps trop volumineux : 400 admin.contenus.body_too_large (cap au-dessus de 96 Kio)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await putContenu(putRequest(VALID, true, 96 * 1024 + 1), context());
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.contenus.body_too_large');
    expect(contenusServiceMock.updateContenu).not.toHaveBeenCalled();
  });

  it('champs invalides : 400 admin.contenus.invalid_fields avec fields nommés', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.updateContenu.mockRejectedValue(
      new InvalidContenuFieldsError({ corps: 'Le contenu est obligatoire.' }),
    );
    const response = await putContenu(putRequest('{}'), context());
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: { corps?: string };
    };
    expect(body.error.code).toBe('admin.contenus.invalid_fields');
    expect(body.fields.corps).toContain('obligatoire');
  });

  it('bloc introuvable : 404 admin.contenus.not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.updateContenu.mockRejectedValue(new ContenuNotFoundError());
    const response = await putContenu(putRequest(VALID), context());
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.contenus.not_found');
  });

  it('édition concurrente : 409 admin.contenus.conflit avec action de rechargement', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.updateContenu.mockRejectedValue(new ContenuConflitError());
    const response = await putContenu(putRequest(VALID), context());
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('admin.contenus.conflit');
    expect(body.error.action).toContain('Recharge la page');
  });

  it('session organisateur : 200 renvoie le bloc mis à jour, slug et corps transmis', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.updateContenu.mockResolvedValue(CONTENU);
    const response = await putContenu(putRequest(VALID), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, contenu: CONTENU });
    expect(contenusServiceMock.updateContenu).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'parcours-longue',
      { titre: 'Trail long — 35 km', corps: 'Texte.' },
    );
  });

  it('erreur inconnue : 500 admin.contenus.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    contenusServiceMock.updateContenu.mockRejectedValue(new Error('boom'));
    const response = await putContenu(putRequest(VALID), context());
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.contenus.internal_error');
    expect(body.error.message).not.toContain('boom');
  });
});
