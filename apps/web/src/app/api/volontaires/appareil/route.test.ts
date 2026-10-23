import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as enregistrerAppareilRoute } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  AppareilClientInvalideError,
  AppareilRevokedError,
  PlafondAppareilsError,
} from '@/modules/chrono/errors';

// Story 4.5 — tests de POST /api/volontaires/appareil : enregistrement du
// canal sync, exigé par SESSION volontaire (jamais coureur/organisateur,
// jamais Bearer seul) ; le jeton brut n'apparaît que dans la réponse 200 ;
// enveloppes terrain volontaires.* sur toute erreur.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const chronoServiceMock = vi.hoisted(() => ({
  enregistrerAppareil: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const BASE = 'http://localhost:3000/api/volontaires/appareil';

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function requete(corps: string, avecCookie = true): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(avecCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: corps,
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  chronoServiceMock.enregistrerAppareil.mockReset();
});

describe('POST /api/volontaires/appareil', () => {
  it('sans cookie : 401 iam.unauthenticated, service non appelé', async () => {
    const response = await enregistrerAppareilRoute(requete('{"appareilId":"app-1"}', false));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(chronoServiceMock.enregistrerAppareil).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden (seul un volontaire atteste un appareil)', async () => {
    iamServiceMock.getSession.mockResolvedValue({ ...SESSION_VOLONTAIRE, role: 'coureur' });
    const response = await enregistrerAppareilRoute(requete('{"appareilId":"app-1"}'));
    expect(response.status).toBe(403);
    expect(chronoServiceMock.enregistrerAppareil).not.toHaveBeenCalled();
  });

  it('corps illisible ou sans appareilId : 400 volontaires.appareil.client_invalide', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    chronoServiceMock.enregistrerAppareil.mockRejectedValue(new AppareilClientInvalideError());
    const response = await enregistrerAppareilRoute(requete('{"appareilId":""}'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.appareil.client_invalide');
  });

  it('appareil révoqué : 401 dédié volontaires.sync.appareil_revoked (pas de retour silencieux)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    chronoServiceMock.enregistrerAppareil.mockRejectedValue(new AppareilRevokedError());
    const response = await enregistrerAppareilRoute(requete('{"appareilId":"app-1"}'));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.sync.appareil_revoked');
  });

  it('plafond d’appareils atteint : 409 admin.appareils.plafond, action « Appelle le PC »', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    chronoServiceMock.enregistrerAppareil.mockRejectedValue(new PlafondAppareilsError(50));
    const response = await enregistrerAppareilRoute(requete('{"appareilId":"app-51"}'));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('admin.appareils.plafond');
    expect(body.error.action).toContain('Appelle le PC');
  });

  it('base indisponible : 503 volontaires.db_unavailable', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    chronoServiceMock.enregistrerAppareil.mockRejectedValue(new DbUnavailableError());
    const response = await enregistrerAppareilRoute(requete('{"appareilId":"app-1"}'));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.db_unavailable');
  });

  it('session volontaire : 200 { appareilId, jeton } no-store, appareilClient transmis', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    chronoServiceMock.enregistrerAppareil.mockResolvedValue({
      appareilId: 'appareil-uuid-1',
      jeton: 'jeton-brut-une-fois',
      rotation: false,
    });
    const response = await enregistrerAppareilRoute(requete('{"appareilId":"app-client-1"}'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { appareilId: string; jeton: string };
    expect(body).toEqual({ appareilId: 'appareil-uuid-1', jeton: 'jeton-brut-une-fois' });
    expect(chronoServiceMock.enregistrerAppareil).toHaveBeenCalledWith(
      SESSION_VOLONTAIRE,
      'app-client-1',
    );
  });
});
