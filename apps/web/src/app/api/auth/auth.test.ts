import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postCode } from './code/route';
import { POST as postLogout } from './logout/route';
import { GET as getSessionRoute } from './session/route';
import { POST as postVerify } from './verify/route';

import { RateLimitedError } from '@/modules/iam/errors';

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
});

describe('POST /api/auth/verify', () => {
  it('pose le cookie de session httpOnly, 30 jours, racine', async () => {
    serviceMock.verifyLoginCode.mockResolvedValue({
      token: 'jeton-session',
      email: 'coureur@exemple.dz',
    });

    const response = await postVerify(
      jsonRequest('/api/auth/verify', { email: 'coureur@exemple.dz', code: '123456' }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; email: string };
    expect(body).toEqual({ ok: true, email: 'coureur@exemple.dz' });
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
});
