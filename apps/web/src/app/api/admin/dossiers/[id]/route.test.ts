import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getDossier } from './route';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getDossierDetail: vi.fn(),
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

const DETAIL = {
  coureur: {
    id: 'coureur-1',
    epreuve: 'longue',
    epreuveNom: 'La Longue — 35 km',
    distanceKm: 35,
    prenom: 'Yani',
    nom: 'Ulahianne',
    telephone: '+213555010203',
    contactUrgenceNom: 'Lounis Ulahianne',
    contactUrgenceTelephone: '0555010204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
    age: 36,
    categorie: 'Senior',
    status: 'en constitution',
    refusalReason: null,
    dechargeAccepte: null,
    reglementAccepte: null,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
  },
  email: 'yani@exemple.dz',
  preuveActive: {
    id: 'preuve-1',
    depositedAt: '2026-10-21T10:30:00.000Z',
    sizeBytes: 2048,
    mime: 'image/jpeg',
  },
};

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/dossiers/coureur-1`, {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.getDossierDetail.mockReset();
});

describe('GET /api/admin/dossiers/[id]', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await getDossier(getRequest(false), context('coureur-1'));
    expect(response.status).toBe(401);
    expect(inscriptionsServiceMock.getDossierDetail).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getDossier(getRequest(), context('coureur-1'));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(inscriptionsServiceMock.getDossierDetail).not.toHaveBeenCalled();
  });

  it('session organisateur : 200 avec le détail, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.getDossierDetail.mockResolvedValue(DETAIL);

    const response = await getDossier(getRequest(), context('coureur-1'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual(DETAIL);
    expect(inscriptionsServiceMock.getDossierDetail).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'coureur-1',
    );
  });

  it('dossier absent ou hors org : 404 enveloppe admin.dossier_not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.getDossierDetail.mockResolvedValue(null);

    const response = await getDossier(getRequest(), context('inconnu'));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.dossier_not_found');
  });
});
