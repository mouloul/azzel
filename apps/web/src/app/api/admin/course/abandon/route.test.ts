import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postAbandonRoute, MAX_CORPS_ABANDON_OCTETS } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  AbandonDejaAbandonneError,
  AbandonDossardInconnuError,
  InvalidAbandonFieldsError,
} from '@/modules/chrono/errors';

// Story 5.3 — route POST /api/admin/course/abandon : guardAdmin (401/403/503),
// garde de corps (taille, JSON), enveloppes admin.course.* (400 champ + fields,
// 409 refus de course), 201 no-store. Isolée par mocks (pattern routes admin).

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const chronoServiceMock = vi.hoisted(() => ({
  saisirAbandon: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const BASE = 'http://localhost:3000';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_VOLONTAIRE = {
  ...SESSION_ORGANISATEUR,
  accountId: 'account-volontaire',
  email: 'volontaire@exemple.dz',
  role: 'volontaire',
};

const SAISIE = { dossard: 102, lieu: 'Col 1200', motif: 'epuisement', heure: '2027-05-16T10:05:00.000Z' };

function request(corps: string | null, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/abandon', {
    method: 'POST',
    headers: {
      ...(corps !== null ? { 'content-type': 'application/json', 'content-length': String(corps.length) } : {}),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    ...(corps !== null ? { body: corps } : {}),
  });
}

/**
 * Corps CHUNKED sans content-length (stream) : la garde taille ne s'applique
 * qu'au content-length DÉCLARÉ — ici la validation du corps est la défense.
 */
function requestChunked(corps: string, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/abandon', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(new TextEncoder().encode(corps));
        controleur.close();
      },
    }),
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  chronoServiceMock.saisirAbandon.mockReset();
});

describe('POST /api/admin/course/abandon', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE), false));
    expect(response.status).toBe(401);
    expect(chronoServiceMock.saisirAbandon).not.toHaveBeenCalled();
  });

  it('session volontaire : 403, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(403);
    expect(chronoServiceMock.saisirAbandon).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('corps CHUNKED sans content-length : la garde ne rejette PAS — corps valide 201, corps illisible 400', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.saisirAbandon.mockResolvedValue({
      dossard: 102,
      lieu: 'Col 1200',
      motif: 'epuisement',
      heure: '2027-05-16T10:05:00.000Z',
    });
    const valide = await postAbandonRoute(requestChunked(JSON.stringify(SAISIE)));
    expect(valide.status).toBe(201);
    expect(chronoServiceMock.saisirAbandon).toHaveBeenCalledWith(SESSION_ORGANISATEUR, SAISIE);

    const illisible = await postAbandonRoute(requestChunked('{pas-du-json'));
    expect(illisible.status).toBe(400);
    const body = (await illisible.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.abandon_corps_invalide');
  });

  it('garde de corps : JSON illisible → 400, trop grand → 413', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const illisible = await postAbandonRoute(request('{pas-du-json'));
    expect(illisible.status).toBe(400);
    const tropGrand = await postAbandonRoute(request('x'.repeat(MAX_CORPS_ABANDON_OCTETS + 1)));
    expect(tropGrand.status).toBe(413);
    const body = (await tropGrand.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.abandon_corps_trop_grand');
    expect(chronoServiceMock.saisirAbandon).not.toHaveBeenCalled();
  });

  it('champs invalides : 400 enveloppe admin.course.abandon_champs_invalides + fields', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.saisirAbandon.mockRejectedValue(
      new InvalidAbandonFieldsError({ heure: 'L’heure d’abandon ne peut pas être dans le futur.' }),
    );
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      error: { code: string };
      fields: { heure: string };
    };
    expect(body.error.code).toBe('admin.course.abandon_champs_invalides');
    expect(body.fields.heure).toContain('futur');
  });

  it('dossard inconnu : 400 enveloppe admin.course.abandon_dossard_inconnu + erreur champ dossard', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.saisirAbandon.mockRejectedValue(new AbandonDossardInconnuError());
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: { dossard: string };
    };
    expect(body.error.code).toBe('admin.course.abandon_dossard_inconnu');
    expect(body.fields.dossard).toContain('Dossard inconnu');
  });

  it('déjà abandonné (AD-3) : 409 enveloppe admin.course.abandon_deja_abandonne, sans fields', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.saisirAbandon.mockRejectedValue(new AbandonDejaAbandonneError());
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string }; fields?: unknown };
    expect(body.error.code).toBe('admin.course.abandon_deja_abandonne');
    expect(body.fields).toBeUndefined();
  });

  it('saisie nominale : 201 no-store, abandon sérialisé, service appelé avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.saisirAbandon.mockResolvedValue({
      dossard: 102,
      lieu: 'Col 1200',
      motif: 'epuisement',
      heure: '2027-05-16T10:05:00.000Z',
    });
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      abandon: { dossard: 102, lieu: 'Col 1200', motif: 'epuisement', heure: '2027-05-16T10:05:00.000Z' },
    });
    expect(chronoServiceMock.saisirAbandon).toHaveBeenCalledWith(SESSION_ORGANISATEUR, SAISIE);
  });

  it('erreur inattendue : 500 enveloppe admin.course.erreur_inconnue', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.saisirAbandon.mockRejectedValue(new Error('boom'));
    const response = await postAbandonRoute(request(JSON.stringify(SAISIE)));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.erreur_inconnue');
  });
});
