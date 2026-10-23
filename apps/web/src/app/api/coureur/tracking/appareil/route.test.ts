import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as appareilRoute, MAX_CORPS_APPAREIL_OCTETS } from './route';

import { AppareilClientInvalideError, AppareilRevokedError } from '@/modules/tracking/errors';

// Story 6.2 — tests de POST /api/coureur/tracking/appareil : garde SESSION
// coureur (le Bearer de session, jamais le jeton appareil ici), garde taille
// de corps AVANT request.json() (content-length EXIGÉE), corps
// { appareilClient }, jeton BRUT retourné UNE fois, réponse renommée
// { appareilServeurId, jeton } (l'id serveur ≠ appareilId client du corps
// sync), enveloppes tracking.*, no-store. Un appareil révoqué ne récupère
// jamais de jeton (AD-5).

const guardMock = vi.hoisted(() => ({
  guardCoureur: vi.fn(),
  coureurErrorResponse: (apiError: { status: number; envelope: unknown }) =>
    Response.json(apiError.envelope, {
      status: apiError.status,
      headers: { 'Cache-Control': 'no-store' },
    }),
}));

vi.mock(
  '@/app/api/coureur/guard',
  () => guardMock as unknown as typeof import('@/app/api/coureur/guard'),
);

const trackingServiceMock = vi.hoisted(() => ({
  enregistrerAppareilCoureur: vi.fn(),
}));

vi.mock(
  '@/modules/tracking/service',
  () => trackingServiceMock as unknown as typeof import('@/modules/tracking/service'),
);

const BASE = 'http://localhost:3000/api/coureur/tracking/appareil';

const SESSION = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@test.azzel',
  role: 'coureur',
  createdAt: new Date(),
};

function requete(corps: string, entetes: Record<string, string> = {}): NextRequest {
  // Content-length EXPLICITE : un Request de test ne la pose jamais seule
  // (en-tête interdit côté fetch) alors qu'un client HTTP réel l'envoie
  // toujours — la route l'EXIGE (garde taille sans échappatoire chunked).
  return new NextRequest(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(corps).length),
      ...entetes,
    },
    body: corps,
  });
}

/** Requête en corps CHUNKED (stream) : fetch ne pose PAS de content-length. */
function requeteChunked(entetes: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(new TextEncoder().encode('{"appareilClient":"app-1"}'));
        controleur.close();
      },
    }),
    duplex: 'half',
  });
}

beforeEach(() => {
  guardMock.guardCoureur.mockReset();
  trackingServiceMock.enregistrerAppareilCoureur.mockReset();
  guardMock.guardCoureur.mockResolvedValue({ session: SESSION });
  trackingServiceMock.enregistrerAppareilCoureur.mockResolvedValue({
    appareilId: 'appareil-uuid-1',
    jeton: 'jeton-brut-une-fois',
    rotation: false,
  });
});

describe('POST /api/coureur/tracking/appareil — garde session coureur', () => {
  it('sans session : 401/403 remonté tel quel, service non appelé', async () => {
    guardMock.guardCoureur.mockResolvedValue({
      response: Response.json(
        { version: 1, error: { code: 'iam.unauthenticated', message: 'x', action: 'y' } },
        { status: 401 },
      ),
    });
    const response = await appareilRoute(requete(JSON.stringify({ appareilClient: 'app-1' })));
    expect(response.status).toBe(401);
    expect(trackingServiceMock.enregistrerAppareilCoureur).not.toHaveBeenCalled();
  });

  it('garde en erreur (403) : réponse de garde servie no-store', async () => {
    guardMock.guardCoureur.mockResolvedValue({
      response: Response.json(
        {
          version: 1,
          error: {
            code: 'iam.forbidden',
            message: 'Réservé aux coureurs.',
            action: 'Connecte-toi avec ton compte coureur.',
          },
        },
        { status: 403 },
      ),
    });
    const response = await appareilRoute(requete(JSON.stringify({ appareilClient: 'app-1' })));
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(trackingServiceMock.enregistrerAppareilCoureur).not.toHaveBeenCalled();
  });
});

describe('POST /api/coureur/tracking/appareil — garde taille du corps', () => {
  it(`Content-Length > ${MAX_CORPS_APPAREIL_OCTETS} : 413 tracking.corps_trop_grand AVANT request.json()`, async () => {
    const response = await appareilRoute(
      new NextRequest(BASE, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer jeton-session',
          'content-length': String(MAX_CORPS_APPAREIL_OCTETS + 1),
        },
        body: '{ "appareilClient": "app", "remplissage": "peu importe — jamais lu" }',
      }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.corps_trop_grand');
    expect(trackingServiceMock.enregistrerAppareilCoureur).not.toHaveBeenCalled();
  });

  it('Content-Length ABSENTE (corps chunked) : 413 — la garde ne se contourne pas', async () => {
    const response = await appareilRoute(
      requeteChunked({ authorization: 'Bearer jeton-session' }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.corps_trop_grand');
    expect(trackingServiceMock.enregistrerAppareilCoureur).not.toHaveBeenCalled();
  });
});

describe('POST /api/coureur/tracking/appareil — enregistrement', () => {
  it('200 : jeton BRUT + appareilServeurId (≠ appareilId client), no-store, session au service', async () => {
    const response = await appareilRoute(
      requete(JSON.stringify({ appareilClient: 'app-client-1' }), {
        authorization: 'Bearer jeton-session',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      appareilServeurId: string;
      appareilId?: string;
      jeton: string;
    };
    expect(body.appareilServeurId).toBe('appareil-uuid-1');
    expect(body.appareilId).toBeUndefined();
    expect(body.jeton).toBe('jeton-brut-une-fois');
    expect(trackingServiceMock.enregistrerAppareilCoureur).toHaveBeenCalledWith(
      SESSION,
      'app-client-1',
    );
  });

  it('appareilClient invalide : 400 tracking.appareil_client_invalide', async () => {
    trackingServiceMock.enregistrerAppareilCoureur.mockRejectedValue(
      new AppareilClientInvalideError(),
    );
    const response = await appareilRoute(requete(JSON.stringify({ appareilClient: '' })));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.appareil_client_invalide');
  });

  it('appareil révoqué : 401 DÉDIÉ tracking.appareil_revoked (AD-5)', async () => {
    trackingServiceMock.enregistrerAppareilCoureur.mockRejectedValue(new AppareilRevokedError());
    const response = await appareilRoute(requete(JSON.stringify({ appareilClient: 'app-1' })));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('tracking.appareil_revoked');
    expect(body.error.action).toContain('Appelle');
  });

  it('JSON illisible : 400 (appareilClient absent → invalide)', async () => {
    trackingServiceMock.enregistrerAppareilCoureur.mockRejectedValue(
      new AppareilClientInvalideError(),
    );
    const response = await appareilRoute(requete('{pas-du-json'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.appareil_client_invalide');
  });
});
