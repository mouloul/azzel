import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getEdossard } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { NoEditionError } from '@/modules/inscriptions/errors';

// Story 6.1 — tests de GET /api/coureur/e-dossard : garde coureur (Bearer ou
// cookie), dossier non validé → { disponible: false } SANS QR, validé → état
// + payloadQr `azzel-e1:<jeton>` (contrat shared, jamais le dossard nu),
// no-store, 503 sans édition / base indisponible.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  obtenirEdossard: vi.fn(),
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

const EDOSSARD = {
  jeton: 'AbCdEfGhIjKlMnOpQrStUv',
  dossard: 184,
  prenom: 'Yacine',
  nom: 'Amrani',
  epreuveNom: 'La Grande Boucle — 35 km',
  editionNom: 'Édition 2027',
};

function requete(headers: Record<string, string>): NextRequest {
  return new NextRequest(BASE + '/api/coureur/e-dossard', { headers });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.obtenirEdossard.mockReset();
});

describe('GET /api/coureur/e-dossard', () => {
  it('sans cookie ni Bearer : 401 iam.unauthenticated, service non appelé', async () => {
    const response = await getEdossard(requete({}));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(inscriptionsServiceMock.obtenirEdossard).not.toHaveBeenCalled();
  });

  it('Bearer invalide : 401 iam.unauthenticated', async () => {
    iamServiceMock.getSession.mockResolvedValue(null);
    const response = await getEdossard(requete({ authorization: 'Bearer jeton-revoque' }));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
  });

  it('session volontaire : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue({ ...SESSION_COUREUR, role: 'volontaire' });
    const response = await getEdossard(requete({ authorization: 'Bearer jeton' }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
  });

  it('dossier non validé : { disponible: false }, aucun QR, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.obtenirEdossard.mockResolvedValue(null);

    const response = await getEdossard(requete({ authorization: 'Bearer jeton' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { disponible: boolean };
    expect(body).toEqual({ disponible: false });
  });

  it('dossier validé : état complet + payloadQr azzel-e1:<jeton>', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.obtenirEdossard.mockResolvedValue(EDOSSARD);

    const response = await getEdossard(requete({ authorization: 'Bearer jeton' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as typeof EDOSSARD & {
      disponible: boolean;
      payloadQr: string;
    };
    expect(body.disponible).toBe(true);
    expect(body.jeton).toBe(EDOSSARD.jeton);
    expect(body.dossard).toBe(184);
    expect(body.prenom).toBe('Yacine');
    // Contrat shared : le QR encode le JETON unique, jamais le dossard nu.
    expect(body.payloadQr).toBe(`azzel-e1:${EDOSSARD.jeton}`);
    expect(body.payloadQr).not.toContain('184');
  });

  it('cookie web : même réponse que le Bearer', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.obtenirEdossard.mockResolvedValue(EDOSSARD);
    const response = await getEdossard(requete({ cookie: 'azzel_session=jeton-cookie' }));
    expect(response.status).toBe(200);
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-cookie');
    const body = (await response.json()) as { disponible: boolean };
    expect(body.disponible).toBe(true);
  });

  it('aucune édition : 503 coureur.no_edition (tutoiement, jamais admin.*)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.obtenirEdossard.mockRejectedValue(new NoEditionError());
    const response = await getEdossard(requete({ authorization: 'Bearer jeton' }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('coureur.no_edition');
    expect(body.error.action).toContain('appelle');
  });

  it('base indisponible : 503 inscriptions.db_unavailable', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    inscriptionsServiceMock.obtenirEdossard.mockRejectedValue(new DbUnavailableError());
    const response = await getEdossard(requete({ authorization: 'Bearer jeton' }));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.db_unavailable');
  });
});
