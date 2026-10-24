import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getRapportPostCourse } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 7.4 — route GET /api/admin/rapports/post-course : guardAdmin
// (401/403/503 enveloppes admin.*, AUCUN octet de CSV avant la validation),
// CSV RFC 4180 en attachment daté (text/csv; charset=utf-8), no-store, 503
// douce — jamais un CSV à moitié servi. Isolée par mocks (pattern routes
// admin).

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const rapportsServiceMock = vi.hoisted(() => ({
  genererRapportPostCourse: vi.fn(),
}));

vi.mock(
  '@/modules/rapports/service',
  () => rapportsServiceMock as unknown as typeof import('@/modules/rapports/service'),
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

function request(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/rapports/post-course', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  rapportsServiceMock.genererRapportPostCourse.mockReset();
});

describe('GET /api/admin/rapports/post-course', () => {
  it('sans cookie : 401, service non appelé, aucun octet de CSV', async () => {
    const response = await getRapportPostCourse(request(false));
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).not.toContain('text/csv');
    expect(rapportsServiceMock.genererRapportPostCourse).not.toHaveBeenCalled();
  });

  it('session VOLONTAIRE : 403 enveloppe admin.*, service non appelé, aucun octet de CSV', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await getRapportPostCourse(request());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(response.headers.get('content-type')).not.toContain('text/csv');
    expect(rapportsServiceMock.genererRapportPostCourse).not.toHaveBeenCalled();
  });

  it('base indisponible À LA GARDE : 503 enveloppe admin.db_unavailable, aucun octet de CSV', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getRapportPostCourse(request());
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
    expect(rapportsServiceMock.genererRapportPostCourse).not.toHaveBeenCalled();
  });

  it('base indisponible AU SERVICE : 503 douce, jamais un CSV partiel', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererRapportPostCourse.mockRejectedValue(new DbUnavailableError());
    const response = await getRapportPostCourse(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).not.toContain('text/csv');
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('erreur inattendue : 500 enveloppe admin.rapports.erreur_inconnue, sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererRapportPostCourse.mockRejectedValue(new Error('boom'));
    const response = await getRapportPostCourse(request());
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.rapports.erreur_inconnue');
    expect(body.error.message).not.toContain('boom');
  });

  it('nominal : 200 CSV complet (BOM, CRLF, sections), attachment daté, no-store, nosniff — service appelé avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererRapportPostCourse.mockResolvedValue({
      nomFichier: 'azzel-rapport-post-course-2027-2026-10-24.csv',
      contenu: '\uFEFFGénéré le 24/10/2026 10:00:00\r\n\r\nSynthèse\r\nInscrits (total);0',
    });
    const response = await getRapportPostCourse(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="azzel-rapport-post-course-2027-2026-10-24.csv"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    // BOM UTF-8 en tête des octets (EF BB BF) : Excel FR décode les accents.
    const octets = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(octets.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const texte = new TextDecoder('utf-8').decode(octets);
    expect(texte).toContain('Généré le');
    expect(texte).toContain('\r\n');
    expect(rapportsServiceMock.genererRapportPostCourse).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
    );
  });

  it('slug d’édition PIÉGÉ : nom de fichier sanitizé dans Content-Disposition (aucune injection d’en-tête)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererRapportPostCourse.mockResolvedValue({
      nomFichier: 'azzel-rapport-post-course-20 27\r\nX-Evil: 1.csv',
      contenu: '\uFEFFSynthèse',
    });
    const response = await getRapportPostCourse(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="azzel-rapport-post-course-20-27--X-Evil--1.csv"',
    );
    // L'en-tête servi ne porte NI CRLF NI guillemet parasite : la valeur
    // entière est `attachment; filename="[\w.-]+"`, l'injection est morte.
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="[\w.-]+"$/,
    );
    expect(response.headers.get('content-disposition')).not.toMatch(/[\r\n]/);
  });
});
