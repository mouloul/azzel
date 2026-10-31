import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postCode } from './code/route';
import { POST as postLogout } from './logout/route';
import { GET as getSessionRoute } from './session/route';
import { POST as postVerify } from './verify/route';

import { InvalidCodeError, RateLimitedError } from '@/modules/iam/errors';

const serviceMock = vi.hoisted(() => ({
  requestLoginCode: vi.fn(),
  verifyLoginCode: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => serviceMock as unknown as typeof import('@/modules/iam/service'),
);

const prochaineEtapeMock = vi.hoisted(() => ({
  prochaineEtapeCoureurPourJeton: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/prochaine-etape',
  () =>
    prochaineEtapeMock as unknown as typeof import('@/modules/inscriptions/prochaine-etape'),
);

const BASE = 'http://localhost:3000';

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    duplex: 'half',
  });
}

beforeEach(() => {
  serviceMock.requestLoginCode.mockReset();
  serviceMock.verifyLoginCode.mockReset();
  serviceMock.getSession.mockReset();
  serviceMock.logout.mockReset();
  prochaineEtapeMock.prochaineEtapeCoureurPourJeton.mockReset();
  prochaineEtapeMock.prochaineEtapeCoureurPourJeton.mockResolvedValue('/espace-coureur');
});

describe('POST /api/auth/verify', () => {
  it('pose le cookie de session httpOnly, 30 jours, racine', async () => {
    serviceMock.verifyLoginCode.mockResolvedValue({
      token: 'jeton-session',
      email: 'coureur@exemple.dz',
      role: 'coureur',
    });

    const response = await postVerify(
      jsonRequest('/api/auth/verify', { email: 'coureur@exemple.dz', code: '123456' }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      email: string;
      redirectTo: string;
    };
    // La destination vient du serveur : un coureur va dans son espace.
    expect(body).toEqual({
      ok: true,
      email: 'coureur@exemple.dz',
      redirectTo: '/espace-coureur',
    });
    const setCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('azzel_session='));
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=lax');
    expect(serviceMock.verifyLoginCode).toHaveBeenCalledWith('coureur@exemple.dz', '123456');
  });

  it('coureur web : redirigé vers la première étape non faite de son dossier', async () => {
    serviceMock.verifyLoginCode.mockResolvedValue({
      token: 'jeton-session',
      email: 'coureur@exemple.dz',
      role: 'coureur',
    });
    prochaineEtapeMock.prochaineEtapeCoureurPourJeton.mockResolvedValue('/acceptations');

    const response = await postVerify(
      jsonRequest('/api/auth/verify', { email: 'coureur@exemple.dz', code: '123456' }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { redirectTo: string };
    expect(body.redirectTo).toBe('/acceptations');
    // L'étape est calculée à partir du jeton tout juste émis (checklist serveur).
    expect(prochaineEtapeMock.prochaineEtapeCoureurPourJeton).toHaveBeenCalledWith(
      'jeton-session',
    );
  });

  it.each([
    ['organisateur', '/admin/dossiers'],
    ['volontaire', '/volontaires'],
  ])('%s web : espace du rôle, sans calcul d’étape coureur', async (role, attendu) => {
    serviceMock.verifyLoginCode.mockResolvedValue({
      token: 'jeton-session',
      email: `${role}@exemple.dz`,
      role,
    });

    const response = await postVerify(
      jsonRequest('/api/auth/verify', { email: `${role}@exemple.dz`, code: '123456' }),
    );

    const body = (await response.json()) as { redirectTo: string };
    expect(body.redirectTo).toBe(attendu);
    expect(prochaineEtapeMock.prochaineEtapeCoureurPourJeton).not.toHaveBeenCalled();
  });

  it('story 6.1 — client natif : le jeton de session est renvoyé UNE fois dans le corps', async () => {
    serviceMock.verifyLoginCode.mockResolvedValue({
      token: 'jeton-natif-clair',
      email: 'coureur@exemple.dz',
      role: 'coureur',
    });

    const response = await postVerify(
      jsonRequest('/api/auth/verify', {
        email: 'coureur@exemple.dz',
        code: '123456',
        client: 'native',
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      email: string;
      token?: string;
      redirectTo: string;
    };
    expect(body).toEqual({
      ok: true,
      email: 'coureur@exemple.dz',
      token: 'jeton-natif-clair',
      redirectTo: '/espace-coureur',
    });
    // Contrat natif inchangé : espace du rôle, pas d'étape de dossier.
    expect(prochaineEtapeMock.prochaineEtapeCoureurPourJeton).not.toHaveBeenCalled();
    // Le token voyage dans le corps : aucun intermédiaire ne doit cacher la réponse.
    expect(response.headers.get('cache-control')).toBe('no-store');
    // Le cookie httpOnly reste posé (web inchangé ; sans effet pour l'app).
    const setCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('azzel_session=jeton-natif-clair'));
    expect(setCookie).toBeDefined();
  });

  it('story 6.1 — client natif, code faux : enveloppe iam.code_invalid SANS cookie ni token', async () => {
    serviceMock.verifyLoginCode.mockRejectedValue(new InvalidCodeError());

    const response = await postVerify(
      jsonRequest('/api/auth/verify', {
        email: 'coureur@exemple.dz',
        code: '000000',
        client: 'native',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.error.code).toBe('iam.code_invalid');
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe('POST /api/auth/code', () => {
  it('429 avec Retry-After et enveloppe iam.rate_limited', async () => {
    serviceMock.requestLoginCode.mockRejectedValue(new RateLimitedError(120));

    const response = await postCode(
      jsonRequest('/api/auth/code', { email: 'coureur@exemple.dz' }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('120');
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('iam.rate_limited');
  });
});

describe('POST /api/auth/code — IP transmise pour le quota anti-abus', () => {
  const hopsOrigine = process.env.AZZEL_TRUSTED_PROXY_HOPS;

  afterEach(() => {
    if (hopsOrigine === undefined) {
      delete process.env.AZZEL_TRUSTED_PROXY_HOPS;
    } else {
      process.env.AZZEL_TRUSTED_PROXY_HOPS = hopsOrigine;
    }
  });

  function codeRequest(headers: Record<string, string>): NextRequest {
    return new NextRequest(BASE + '/api/auth/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ email: 'coureur@exemple.dz' }),
      duplex: 'half',
    });
  }

  it('un proxy de confiance : l’adresse retenue est celle qu’il a posée (la dernière)', async () => {
    process.env.AZZEL_TRUSTED_PROXY_HOPS = '1';
    serviceMock.requestLoginCode.mockResolvedValue(undefined);

    // Le client a préfixé l’en-tête avec une adresse de son choix : seule
    // l’entrée ajoutée par NOTRE proxy compte.
    await postCode(codeRequest({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }));

    expect(serviceMock.requestLoginCode).toHaveBeenCalledWith(
      'coureur@exemple.dz',
      {},
      { clientIp: '203.0.113.7' },
    );
  });

  it('adresse normalisée : port retiré, IPv6 regroupée par /64', async () => {
    process.env.AZZEL_TRUSTED_PROXY_HOPS = '1';
    serviceMock.requestLoginCode.mockResolvedValue(undefined);

    await postCode(codeRequest({ 'x-forwarded-for': '203.0.113.7:443' }));
    expect(serviceMock.requestLoginCode).toHaveBeenLastCalledWith(
      'coureur@exemple.dz',
      {},
      { clientIp: '203.0.113.7' },
    );

    await postCode(codeRequest({ 'x-forwarded-for': '[2001:DB8:0:1:abcd::1]:443' }));
    expect(serviceMock.requestLoginCode).toHaveBeenLastCalledWith(
      'coureur@exemple.dz',
      {},
      { clientIp: '2001:db8:0:1' },
    );
  });

  it('sans proxy de confiance déclaré : x-forwarded-for ignoré, clientIp null', async () => {
    delete process.env.AZZEL_TRUSTED_PROXY_HOPS;
    serviceMock.requestLoginCode.mockResolvedValue(undefined);

    const response = await postCode(
      codeRequest({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.9' }),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.requestLoginCode).toHaveBeenCalledWith(
      'coureur@exemple.dz',
      {},
      { clientIp: null },
    );
  });

  it('proxy de confiance mais en-tête absent (appel direct) : clientIp null', async () => {
    process.env.AZZEL_TRUSTED_PROXY_HOPS = '1';
    serviceMock.requestLoginCode.mockResolvedValue(undefined);

    const response = await postCode(codeRequest({}));

    expect(response.status).toBe(200);
    expect(serviceMock.requestLoginCode).toHaveBeenCalledWith(
      'coureur@exemple.dz',
      {},
      { clientIp: null },
    );
  });
});

describe('GET /api/auth/session', () => {
  it('sans cookie : 401 avec enveloppe iam.unauthenticated', async () => {
    const response = await getSessionRoute(new NextRequest(BASE + '/api/auth/session'));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(serviceMock.getSession).not.toHaveBeenCalled();
  });

  it('session valide : 200 avec email, rôle et date de création', async () => {
    serviceMock.getSession.mockResolvedValue({
      accountId: 'account-1',
      organisationId: 'org-1',
      email: 'organisateur@exemple.dz',
      role: 'organisateur',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
    });

    const response = await getSessionRoute(
      new NextRequest(BASE + '/api/auth/session', {
        headers: { cookie: 'azzel_session=jeton-session' },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      email: string;
      role: string;
      createdAt: string;
    };
    expect(body).toEqual({
      email: 'organisateur@exemple.dz',
      role: 'organisateur',
      createdAt: '2026-10-01T10:00:00.000Z',
    });
  });

  it('story 6.1 — session via Authorization: Bearer (app native)', async () => {
    serviceMock.getSession.mockResolvedValue({
      accountId: 'account-1',
      organisationId: 'org-1',
      email: 'coureur@exemple.dz',
      role: 'coureur',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
    });

    const response = await getSessionRoute(
      new NextRequest(BASE + '/api/auth/session', {
        headers: { authorization: 'Bearer jeton-natif' },
      }),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.getSession).toHaveBeenCalledWith('jeton-natif');
    const body = (await response.json()) as { email: string; role: string };
    expect(body.email).toBe('coureur@exemple.dz');
    expect(body.role).toBe('coureur');
  });

  it('story 6.1 — Bearer invalide : 401 enveloppe iam.unauthenticated', async () => {
    serviceMock.getSession.mockResolvedValue(null);

    const response = await getSessionRoute(
      new NextRequest(BASE + '/api/auth/session', {
        headers: { authorization: 'Bearer jeton-revoque' },
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
  });
});

describe('POST /api/auth/logout', () => {
  it('révoque la session et vide le cookie', async () => {
    serviceMock.logout.mockResolvedValue(undefined);

    const response = await postLogout(
      new NextRequest(BASE + '/api/auth/logout', {
        method: 'POST',
        headers: { cookie: 'azzel_session=jeton-session' },
      }),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.logout).toHaveBeenCalledWith('jeton-session');
    const setCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('azzel_session='));
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('Max-Age=0');
  });

  it('story 6.1 — déconnexion via Authorization: Bearer (app native)', async () => {
    serviceMock.logout.mockResolvedValue(undefined);

    const response = await postLogout(
      new NextRequest(BASE + '/api/auth/logout', {
        method: 'POST',
        headers: { authorization: 'Bearer jeton-natif' },
      }),
    );

    expect(response.status).toBe(200);
    expect(serviceMock.logout).toHaveBeenCalledWith('jeton-natif');
  });
});
