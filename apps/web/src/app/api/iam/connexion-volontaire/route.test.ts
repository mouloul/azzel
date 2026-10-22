import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postConnexion } from './route';

import { InvalidCredentialsError, RateLimitedError } from '@/modules/iam/errors';

const iamServiceMock = vi.hoisted(() => ({
  connecterVolontaire: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const BASE = 'http://localhost:3000';

function requestWithBody(
  raw: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(BASE + '/api/iam/connexion-volontaire', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
    duplex: 'half',
  });
}

beforeEach(() => {
  iamServiceMock.connecterVolontaire.mockReset();
});

describe('POST /api/iam/connexion-volontaire — connexion mot de passe (publique)', () => {
  it('identifiants corrects : 200, cookie de session posé, IP transmise au service', async () => {
    iamServiceMock.connecterVolontaire.mockResolvedValue({
      token: 'jeton-session-brut',
      email: 'kahina@exemple.dz',
    });
    const response = await postConnexion(
      requestWithBody(
        JSON.stringify({ email: 'kahina@exemple.dz', motDePasse: 'motdepasse-2026' }),
        { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, email: 'kahina@exemple.dz' });
    expect(response.headers.get('set-cookie')).toContain('azzel_session=jeton-session-brut');
    expect(iamServiceMock.connecterVolontaire).toHaveBeenCalledWith(
      'kahina@exemple.dz',
      'motdepasse-2026',
      {},
      { clientIp: '203.0.113.7' },
    );
  });

  it('quota IP atteint : 429 iam.rate_limited avec Retry-After, aucune session posée', async () => {
    iamServiceMock.connecterVolontaire.mockRejectedValue(new RateLimitedError(900));
    const response = await postConnexion(
      requestWithBody(
        JSON.stringify({ email: 'kahina@exemple.dz', motDePasse: 'motdepasse-2026' }),
      ),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('900');
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.rate_limited');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('mot de passe erroné : 400 générique iam.invalid_credentials, message sans distinction', async () => {
    iamServiceMock.connecterVolontaire.mockRejectedValue(new InvalidCredentialsError());
    const response = await postConnexion(
      requestWithBody(JSON.stringify({ email: 'kahina@exemple.dz', motDePasse: 'mauvais' })),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('iam.invalid_credentials');
    expect(body.error.message).toBe('Email ou mot de passe incorrect.');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('corps illisible : 400 sans appel au service', async () => {
    const response = await postConnexion(requestWithBody('{}'));
    expect(response.status).toBe(400);
    expect(iamServiceMock.connecterVolontaire).not.toHaveBeenCalled();
  });
});
