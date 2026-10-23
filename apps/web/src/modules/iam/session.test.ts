import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from './errors';
import { readBearerToken, requireRole, requireRolePage, requireSession } from './session';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const REDIRECT_SENTINEL = Symbol('redirect');

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw Object.assign(new Error(`redirect:${destination}`), { sentinel: REDIRECT_SENTINEL, destination });
  }),
}));

vi.mock(
  'next/navigation',
  () => navigationMock as unknown as typeof import('next/navigation'),
);

const headersMock = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock(
  'next/headers',
  () => headersMock as unknown as typeof import('next/headers'),
);

const SESSION_ORGANISATEUR = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_COUREUR = {
  accountId: 'account-2',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_VOLONTAIRE = {
  accountId: 'account-3',
  organisationId: 'org-1',
  email: 'volontaire@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function withCookie(token: string | undefined): void {
  headersMock.cookies.mockResolvedValue({
    get: (name: string) => (name === 'azzel_session' && token ? { value: token } : undefined),
  });
}

function withHeaders(authorization: string | null): void {
  headersMock.headers.mockResolvedValue({
    get: (name: string) => (name === 'authorization' ? authorization : null),
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  navigationMock.redirect.mockClear();
  headersMock.cookies.mockReset();
  headersMock.headers.mockReset();
});

describe('requireRole — garde IAM par rôle', () => {
  it('sans token : unauthenticated sans toucher à la base', async () => {
    const result = await requireRole('organisateur', undefined);
    expect(result).toEqual({ status: 'unauthenticated' });
    expect(iamServiceMock.getSession).not.toHaveBeenCalled();
  });

  it('token inconnu : unauthenticated', async () => {
    iamServiceMock.getSession.mockResolvedValue(null);
    const result = await requireRole('organisateur', 'jeton-inconnu');
    expect(result).toEqual({ status: 'unauthenticated' });
  });

  it('session coureur : forbidden, la session accompagne le refus (redirection ciblée)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const result = await requireRole('organisateur', 'jeton-coureur');
    expect(result).toEqual({ status: 'forbidden', session: SESSION_COUREUR });
  });

  it('session organisateur : authenticated avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const result = await requireRole('organisateur', 'jeton-organisateur');
    expect(result).toEqual({ status: 'authenticated', session: SESSION_ORGANISATEUR });
  });

  it('base indisponible : db-unavailable propagée proprement', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const result = await requireRole('organisateur', 'jeton');
    expect(result).toEqual({ status: 'db-unavailable' });
  });
});

describe('requireRolePage — gardes des pages (redirections)', () => {
  it('sans cookie : redirection vers /connexion', async () => {
    withCookie(undefined);
    const caught = await requireRolePage('organisateur').catch((error: unknown) => error);
    expect(navigationMock.redirect).toHaveBeenCalledWith('/connexion');
    expect(caught).toBeInstanceOf(Error);
  });

  it('session coureur : redirection vers /espace-coureur', async () => {
    withCookie('jeton-coureur');
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    await requireRolePage('organisateur').catch((error: unknown) => error);
    expect(navigationMock.redirect).toHaveBeenCalledWith('/espace-coureur');
  });

  it('story 3.1 — session volontaire : redirection vers /volontaires (son espace)', async () => {
    withCookie('jeton-volontaire');
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    await requireRolePage('organisateur').catch((error: unknown) => error);
    expect(navigationMock.redirect).toHaveBeenCalledWith('/volontaires');
  });

  it('story 3.1 — page volontaire sans cookie : redirection vers /connexion-volontaire', async () => {
    withCookie(undefined);
    await requireRolePage('volontaire').catch((error: unknown) => error);
    expect(navigationMock.redirect).toHaveBeenCalledWith('/connexion-volontaire');
  });

  it('story 3.1 — page volontaire en session coureur : redirection vers /espace-coureur', async () => {
    withCookie('jeton-coureur');
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    await requireRolePage('volontaire').catch((error: unknown) => error);
    expect(navigationMock.redirect).toHaveBeenCalledWith('/espace-coureur');
  });

  it('story 3.1 — page volontaire en session volontaire : authenticated, pas de redirection', async () => {
    withCookie('jeton-volontaire');
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const result = await requireRolePage('volontaire');
    expect(result).toEqual({ status: 'authenticated', session: SESSION_VOLONTAIRE });
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });

  it('session organisateur : authenticated avec la session, pas de redirection', async () => {
    withCookie('jeton-organisateur');
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const result = await requireRolePage('organisateur');
    expect(result).toEqual({ status: 'authenticated', session: SESSION_ORGANISATEUR });
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });

  it('base indisponible : status db-unavailable sans redirection', async () => {
    withCookie('jeton');
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const result = await requireRolePage('organisateur');
    expect(result).toEqual({ status: 'db-unavailable' });
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });
});

describe('readBearerToken — extraction du jeton natif (story 6.1)', () => {
  it('Bearer bien formé : le jeton est extrait tel quel', () => {
    expect(readBearerToken('Bearer jeton-natif-abc123')).toBe('jeton-natif-abc123');
  });

  it('schème insensible à la casse (RFC 7235)', () => {
    expect(readBearerToken('bearer jeton')).toBe('jeton');
    expect(readBearerToken('BEARER jeton')).toBe('jeton');
  });

  it('espaces de tête tolérés, argument unique non vide exigé', () => {
    expect(readBearerToken('  Bearer jeton')).toBe('jeton');
    expect(readBearerToken('Bearer ')).toBeNull();
    expect(readBearerToken('Bearer jeton autre')).toBeNull();
  });

  it('autres schèmes ou absence d’en-tête : null', () => {
    expect(readBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(readBearerToken('')).toBeNull();
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });
});

describe('requireSession — Bearer natif en plus du cookie (story 6.1)', () => {
  it('Bearer seul : même lookup, même sémantique que le cookie', async () => {
    withCookie(undefined);
    withHeaders('Bearer jeton-natif');
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);

    const result = await requireSession();

    expect(result).toEqual({ status: 'authenticated', session: SESSION_ORGANISATEUR });
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-natif');
  });

  it('le Bearer prime sur le cookie', async () => {
    withCookie('jeton-cookie');
    withHeaders('Bearer jeton-natif');
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);

    await requireSession();

    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-natif');
    expect(iamServiceMock.getSession).not.toHaveBeenCalledWith('jeton-cookie');
  });

  it('sans Bearer, le cookie continue de fonctionner (web inchangé)', async () => {
    withCookie('jeton-cookie');
    withHeaders(null);
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);

    const result = await requireSession();

    expect(result).toEqual({ status: 'authenticated', session: SESSION_ORGANISATEUR });
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-cookie');
  });

  it('Bearer invalide (session inconnue/révoquée AD-5) : redirection connexion, comme un cookie périmé', async () => {
    withCookie(undefined);
    withHeaders('Bearer jeton-revoque');
    iamServiceMock.getSession.mockResolvedValue(null);

    await requireSession().catch((error: unknown) => error);

    expect(navigationMock.redirect).toHaveBeenCalledWith('/connexion');
  });

  it('base indisponible via Bearer : db-unavailable sans redirection', async () => {
    withCookie(undefined);
    withHeaders('Bearer jeton');
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());

    const result = await requireSession();

    expect(result).toEqual({ status: 'db-unavailable' });
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });
});
