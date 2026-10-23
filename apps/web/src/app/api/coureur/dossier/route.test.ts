import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getDossier } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 6.1 — tests de GET /api/coureur/dossier : garde coureur par Bearer OU
// cookie (401 sans session, 403 volontaire/organisateur — enveloppes iam.*),
// forme de la checklist JSON, no-store, 503 base indisponible.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getChecklistState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

const BASE = 'http://localhost:3000';

const SESSION_COUREUR = {
  accountId: 'account-coureur',
  organisationId: 'org-1',
  email: 'yacine@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const CHECKLIST = {
  edition: {
    id: 'edition-1',
    slug: '2027',
    nom: 'Édition 2027',
    dateCourse: '2027-05-16',
    registrationClosesAt: '2027-03-16T22:59:59.000Z',
    registrationOpen: true,
  },
  pieces: [
    { id: 'email', libelle: 'Email vérifié', fait: true },
    { id: 'validation', libelle: 'Dossier validé', fait: false, texteSecondaire: 'En attente' },
  ],
  recap: null,
};

function requete(headers: Record<string, string>): NextRequest {
  return new NextRequest(BASE + '/api/coureur/dossier', { headers });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.getChecklistState.mockReset();
});

describe('GET /api/coureur/dossier', () => {
  it('sans cookie ni Bearer : 401 iam.unauthenticated, service non appelé', async () => {
    const response = await getDossier(requete({}));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(inscriptionsServiceMock.getChecklistState).not.toHaveBeenCalled();
  });

  it('Bearer invalide : 401 iam.unauthenticated', async () => {
    iamServiceMock.getSession.mockResolvedValue(null);
    const response = await getDossier(requete({ authorization: 'Bearer jeton-revoque' }));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-revoque');
  });

  it('Bearer valide, session volontaire : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue({
      ...SESSION_COUREUR,
      role: 'volontaire',
    });
    const response = await getDossier(requete({ authorization: 'Bearer jeton-volontaire' }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(inscriptionsServiceMock.getChecklistState).not.toHaveBeenCalled();
  });

  it('Bearer valide, session organisateur : 403 aussi (surface coureur)', async () => {
    iamServiceMock.getSession.mockResolvedValue({
      ...SESSION_COUREUR,
      role: 'organisateur',
    });
    const response = await getDossier(requete({ authorization: 'Bearer jeton-orga' }));
    expect(response.status).toBe(403);
  });

  it('cookie web : fonctionne aussi (même session, même garde)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(CHECKLIST);
    const response = await getDossier(requete({ cookie: 'azzel_session=jeton-cookie' }));
    expect(response.status).toBe(200);
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-cookie');
  });

  it('Bearer coureur : 200 checklist JSON complète, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(CHECKLIST);

    const response = await getDossier(requete({ authorization: 'Bearer jeton-coureur' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as typeof CHECKLIST;
    expect(body.edition?.nom).toBe('Édition 2027');
    expect(body.pieces).toHaveLength(2);
    expect(body.pieces[0]).toEqual({ id: 'email', libelle: 'Email vérifié', fait: true });
    expect(inscriptionsServiceMock.getChecklistState).toHaveBeenCalledWith(SESSION_COUREUR);
  });

  it('base indisponible (garde) : 503 enveloppe inscriptions.db_unavailable, no-store', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getDossier(requete({ authorization: 'Bearer jeton' }));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.db_unavailable');
  });

  it('service en échec (base) : 503 aussi', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.getChecklistState.mockRejectedValue(new DbUnavailableError());
    const response = await getDossier(requete({ authorization: 'Bearer jeton' }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.db_unavailable');
  });
});
