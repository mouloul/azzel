import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PUT as putHeuresDepartRoute, MAX_CORPS_HEURES_DEPART_OCTETS } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  HeuresDepartEpreuveInconnueError,
  InvalidHeuresDepartFieldsError,
} from '@/modules/chrono/errors';

// Story 7.1 — route PUT /api/admin/course/heures-depart : guardAdmin
// (401/403/503), garde de corps (taille, JSON), enveloppes admin.course.*
// (400 champ + fields PAR ÉPREUVE, 400 épreuve inconnue), 200 no-store avec
// l'état serveur complet. Isolée par mocks (pattern routes admin).

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const chronoServiceMock = vi.hoisted(() => ({
  enregistrerHeuresDepart: vi.fn(),
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

const CORPS = {
  heures: [
    { epreuveId: '11111111-1111-4111-8111-111111111111', heureDepart: '2027-05-16T08:00:00.000Z' },
    { epreuveId: '22222222-2222-4222-8222-222222222222', heureDepart: null },
  ],
};

const ETAT_SERVEUR = [
  {
    epreuveId: '11111111-1111-4111-8111-111111111111',
    epreuveSlug: 'longue',
    epreuveNom: 'La Longue — 35 km',
    distanceKm: 35,
    heureDepart: '2027-05-16T08:00:00.000Z',
  },
  {
    epreuveId: '22222222-2222-4222-8222-222222222222',
    epreuveSlug: 'moyenne',
    epreuveNom: 'La Moyenne — 12 km',
    distanceKm: 12,
    heureDepart: null,
  },
];

function request(corps: string | null, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/heures-depart', {
    method: 'PUT',
    headers: {
      ...(corps !== null
        ? { 'content-type': 'application/json', 'content-length': String(corps.length) }
        : {}),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    ...(corps !== null ? { body: corps } : {}),
  });
}

/**
 * Corps CHUNKED sans content-length : la garde ne se contourne pas — la
 * lecture est TOUJOURS bornée (calque sync tracking 6.2), le corps n'est
 * jamais parsé.
 */
function requestChunked(corps: string, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/heures-depart', {
    method: 'PUT',
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
  chronoServiceMock.enregistrerHeuresDepart.mockReset();
});

describe('PUT /api/admin/course/heures-depart', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS), false));
    expect(response.status).toBe(401);
    expect(chronoServiceMock.enregistrerHeuresDepart).not.toHaveBeenCalled();
  });

  it('session VOLONTAIRE : 403, service non appelé (la référence horaire est organisateur)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS)));
    expect(response.status).toBe(403);
    expect(chronoServiceMock.enregistrerHeuresDepart).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS)));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('garde de corps : JSON illisible → 400, trop grand → 413', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const illisible = await putHeuresDepartRoute(request('{pas-du-json'));
    expect(illisible.status).toBe(400);
    const body = (await illisible.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.heures_depart_corps_invalide');

    const tropGrand = await putHeuresDepartRoute(
      request('x'.repeat(MAX_CORPS_HEURES_DEPART_OCTETS + 1)),
    );
    expect(tropGrand.status).toBe(413);
    const bodyTropGrand = (await tropGrand.json()) as { error: { code: string } };
    expect(bodyTropGrand.error.code).toBe('admin.course.heures_depart_corps_trop_grand');
    expect(chronoServiceMock.enregistrerHeuresDepart).not.toHaveBeenCalled();
  });

  it('content-length ABSENTE (corps chunké) ou non numérique → 413, le corps n’est JAMAIS lu sans borne', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const sansLongueur = await putHeuresDepartRoute(requestChunked(JSON.stringify(CORPS)));
    expect(sansLongueur.status).toBe(413);
    expect(chronoServiceMock.enregistrerHeuresDepart).not.toHaveBeenCalled();

    const nonNumerique = new NextRequest(BASE + '/api/admin/course/heures-depart', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'content-length': 'beaucoup',
        cookie: 'azzel_session=jeton-session',
      },
      body: JSON.stringify(CORPS),
    });
    const refus = await putHeuresDepartRoute(nonNumerique);
    expect(refus.status).toBe(413);
    const body = (await refus.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.heures_depart_corps_trop_grand');
    expect(chronoServiceMock.enregistrerHeuresDepart).not.toHaveBeenCalled();
  });

  it('corps sans tableau heures : le service refuse (corps illisible) → 400 mappé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.enregistrerHeuresDepart.mockRejectedValue(
      new (await import('@/modules/chrono/errors')).CorpsHeuresDepartInvalideError(),
    );
    const response = await putHeuresDepartRoute(request(JSON.stringify({ heures: 'matin' })));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.heures_depart_corps_invalide');
  });

  it('heure invalide : 400 + fields PAR ÉPREUVE (ISO sans Z refusé, heure trop ancienne)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.enregistrerHeuresDepart.mockRejectedValue(
      new InvalidHeuresDepartFieldsError({
        '11111111-1111-4111-8111-111111111111': 'Indiquez une date et une heure de départ valides.',
      }),
    );
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS)));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      error: { code: string };
      fields: Record<string, string>;
    };
    expect(body.error.code).toBe('admin.course.heures_depart_champs_invalides');
    expect(body.fields['11111111-1111-4111-8111-111111111111']).toContain('valides');
  });

  it('épreuve inconnue : 400 + erreur champ par épreuve (RLS comprise)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.enregistrerHeuresDepart.mockRejectedValue(
      new HeuresDepartEpreuveInconnueError(['33333333-3333-4333-8333-333333333333']),
    );
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS)));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: Record<string, string>;
    };
    expect(body.error.code).toBe('admin.course.heures_depart_epreuve_inconnue');
    expect(body.fields['33333333-3333-4333-8333-333333333333']).toContain('Épreuve inconnue');
  });

  it('enregistrement nominal : 200 no-store, état serveur complet, service appelé avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.enregistrerHeuresDepart.mockResolvedValue(ETAT_SERVEUR);
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS)));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true, heures: { epreuves: ETAT_SERVEUR } });
    expect(chronoServiceMock.enregistrerHeuresDepart).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      CORPS,
    );
  });

  it('erreur inattendue : 500 enveloppe admin.course.erreur_inconnue', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.enregistrerHeuresDepart.mockRejectedValue(new Error('boom'));
    const response = await putHeuresDepartRoute(request(JSON.stringify(CORPS)));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.erreur_inconnue');
  });
});
