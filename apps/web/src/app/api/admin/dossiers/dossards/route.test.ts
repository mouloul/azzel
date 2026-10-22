import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postDossards } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { NoEditionError } from '@/modules/inscriptions/errors';

// Story 3.4 — tests de POST /api/admin/dossiers/dossards : garde admin
// (401 sans session, 403 coureur/volontaire), forme du résultat de lot
// (attribues/premier/dernier), no-store, 503 base indisponible, 503 sans
// édition. Action sans paramètre : aucun corps à valider.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  attribuerDossards: vi.fn(),
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

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'volontaire@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function requete(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/dossiers/dossards', {
    method: 'POST',
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.attribuerDossards.mockReset();
});

describe('POST /api/admin/dossiers/dossards', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postDossards(requete(false));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(inscriptionsServiceMock.attribuerDossards).not.toHaveBeenCalled();
  });

  it('session coureur : 403, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postDossards(requete());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(inscriptionsServiceMock.attribuerDossards).not.toHaveBeenCalled();
  });

  it('session volontaire : 403 aussi (surface admin organisateur uniquement)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await postDossards(requete());
    expect(response.status).toBe(403);
    expect(inscriptionsServiceMock.attribuerDossards).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postDossards(requete());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('aucune édition : 503 admin.no_edition', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.attribuerDossards.mockRejectedValue(new NoEditionError());
    const response = await postDossards(requete());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.no_edition');
  });

  it('lot nominal : 200 { ok, attribues, premier, dernier }, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.attribuerDossards.mockResolvedValue({
      attribues: 12,
      premier: 101,
      dernier: 112,
    });
    const response = await postDossards(requete());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      ok: boolean;
      attribues: number;
      premier: number;
      dernier: number;
    };
    expect(body).toEqual({ ok: true, attribues: 12, premier: 101, dernier: 112 });
  });

  it('rien à attribuer : 200 avec attribues 0 et bornes null (idempotence 2ᵉ clic)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.attribuerDossards.mockResolvedValue({
      attribues: 0,
      premier: null,
      dernier: null,
    });
    const response = await postDossards(requete());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      attribues: number;
      premier: number | null;
      dernier: number | null;
    };
    expect(body.attribues).toBe(0);
    expect(body.premier).toBeNull();
    expect(body.dernier).toBeNull();
  });
});
