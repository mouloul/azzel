import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getAcceptances, POST as postAcceptances } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  BothAcceptancesRequiredError,
  DossierValidatedError,
  NoCoureurError,
  RegistrationClosedError,
} from '@/modules/inscriptions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  acceptDocuments: vi.fn(),
  getAcceptancesState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

const BASE = 'http://localhost:3000';

const SESSION = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const ACCEPTANCES = {
  decharge: { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' },
  reglement: { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' },
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
  coureurStatus: 'en constitution',
  documents: [
    {
      slug: 'decharge',
      titre: 'Décharge de bonne santé',
      version: 'v1',
      content: '[TEXTE PROVISOIRE — à remplacer par l’organisateur.]',
    },
    {
      slug: 'reglement',
      titre: 'Règlement intérieur',
      version: 'v1',
      content: '[TEXTE PROVISOIRE — à remplacer par l’organisateur.]',
    },
  ],
  acceptances: { decharge: null, reglement: null },
};

function postRequest(body: string, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/inscriptions/acceptances', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(body.length),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body,
    duplex: 'half',
  });
}

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/inscriptions/acceptances', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.acceptDocuments.mockReset();
  inscriptionsServiceMock.getAcceptancesState.mockReset();
});

describe('POST /api/inscriptions/acceptances', () => {
  it('sans cookie : 401 enveloppe acceptances.unauthenticated, service non appelé', async () => {
    const response = await postAcceptances(postRequest('{}', false));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('acceptances.unauthenticated');
    expect(inscriptionsServiceMock.acceptDocuments).not.toHaveBeenCalled();
  });

  it('session invalide : 401', async () => {
    iamServiceMock.getSession.mockResolvedValue(null);

    const response = await postAcceptances(postRequest('{}'));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.unauthenticated');
    expect(inscriptionsServiceMock.acceptDocuments).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe acceptances.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());

    const response = await postAcceptances(postRequest('{}'));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.db_unavailable');
  });

  it('corps illisible : 400 enveloppe acceptances.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postAcceptances(postRequest('{pas du json'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.invalid_body');
    expect(inscriptionsServiceMock.acceptDocuments).not.toHaveBeenCalled();
  });

  it('corps tableau JSON : 400 enveloppe acceptances.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postAcceptances(postRequest('[true]'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.invalid_body');
    expect(inscriptionsServiceMock.acceptDocuments).not.toHaveBeenCalled();
  });

  it('une seule case (décharge sans règlement) : 400 enveloppe acceptances.both_required (rejet du service)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.acceptDocuments.mockRejectedValue(
      new BothAcceptancesRequiredError(),
    );
    const payload = { decharge: true };

    const response = await postAcceptances(postRequest(JSON.stringify(payload)));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.both_required');
  });

  it('non inscrit : 409 enveloppe acceptances.no_coureur', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.acceptDocuments.mockRejectedValue(new NoCoureurError());

    const response = await postAcceptances(
      postRequest(JSON.stringify({ decharge: true, reglement: true })),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.no_coureur');
  });

  it('après clôture : 403 enveloppe inscriptions.closed', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.acceptDocuments.mockRejectedValue(
      new RegistrationClosedError(new Date('2027-03-16T22:59:59.000Z')),
    );

    const response = await postAcceptances(
      postRequest(JSON.stringify({ decharge: true, reglement: true })),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('inscriptions.closed');
    expect(body.error.message).toContain('16 mars 2027');
  });

  it('dossier validé : 409 enveloppe inscriptions.dossier_valide', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.acceptDocuments.mockRejectedValue(new DossierValidatedError());

    const response = await postAcceptances(
      postRequest(JSON.stringify({ decharge: true, reglement: true })),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.dossier_valide');
  });

  it('les deux cases : 200 avec horodatages et versions, service appelé avec la session et le corps', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.acceptDocuments.mockResolvedValue(ACCEPTANCES);
    const payload = { decharge: true, reglement: true };

    const response = await postAcceptances(postRequest(JSON.stringify(payload)));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      acceptances: typeof ACCEPTANCES;
    };
    expect(body.ok).toBe(true);
    expect(body.acceptances).toEqual(ACCEPTANCES);
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-session');
    expect(inscriptionsServiceMock.acceptDocuments).toHaveBeenCalledWith(SESSION, payload);
  });

  it('erreur inconnue : 500 enveloppe acceptances.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.acceptDocuments.mockRejectedValue(new Error('boom'));

    const response = await postAcceptances(
      postRequest(JSON.stringify({ decharge: true, reglement: true })),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('acceptances.internal_error');
    expect(body.error.message).not.toContain('boom');
  });

  it('corps de plus de 32 Ko : 400 enveloppe acceptances.body_too_large, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postAcceptances(
      new NextRequest(BASE + '/api/inscriptions/acceptances', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'azzel_session=jeton-session',
          'content-length': '40000',
        },
        body: '{}',
        duplex: 'half',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.body_too_large');
    expect(inscriptionsServiceMock.acceptDocuments).not.toHaveBeenCalled();
  });

  it('sans Content-Length (chunked) : 400 enveloppe acceptances.body_too_large, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postAcceptances(
      new NextRequest(BASE + '/api/inscriptions/acceptances', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'azzel_session=jeton-session' },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{}'));
            controller.close();
          },
        }),
        duplex: 'half',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.body_too_large');
    expect(inscriptionsServiceMock.acceptDocuments).not.toHaveBeenCalled();
  });
});

describe('GET /api/inscriptions/acceptances', () => {
  it('sans cookie : 401', async () => {
    const response = await getAcceptances(getRequest(false));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.unauthenticated');
  });

  it('session valide : 200 avec l’état des acceptations', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.getAcceptancesState.mockResolvedValue(STATE);

    const response = await getAcceptances(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual(STATE);
    expect(inscriptionsServiceMock.getAcceptancesState).toHaveBeenCalledWith(SESSION);
  });

  it('base indisponible : 503 enveloppe acceptances.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());

    const response = await getAcceptances(getRequest());

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('acceptances.db_unavailable');
    expect(inscriptionsServiceMock.getAcceptancesState).not.toHaveBeenCalled();
  });
});
