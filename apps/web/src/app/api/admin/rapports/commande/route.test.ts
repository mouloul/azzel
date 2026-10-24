import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getCommande } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 7.4 — route GET /api/admin/rapports/commande : même contrat que le
// rapport post-course (garde organisateur, aucun octet avant validation, CSV
// RFC 4180 attachment daté, no-store, 503 douce). Isolée par mocks.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const rapportsServiceMock = vi.hoisted(() => ({
  genererCommande: vi.fn(),
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
  return new NextRequest(BASE + '/api/admin/rapports/commande', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  rapportsServiceMock.genererCommande.mockReset();
});

describe('GET /api/admin/rapports/commande', () => {
  it('sans cookie : 401, service non appelé, aucun octet de CSV', async () => {
    const response = await getCommande(request(false));
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).not.toContain('text/csv');
    expect(rapportsServiceMock.genererCommande).not.toHaveBeenCalled();
  });

  it('session VOLONTAIRE : 403 enveloppe admin.*, service non appelé (la commande est organisateur)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await getCommande(request());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(rapportsServiceMock.genererCommande).not.toHaveBeenCalled();
  });

  it('base indisponible (garde OU service) : 503 douce, jamais un CSV partiel', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const garde = await getCommande(request());
    expect(garde.status).toBe(503);

    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererCommande.mockRejectedValue(new DbUnavailableError());
    const service = await getCommande(request());
    expect(service.status).toBe(503);
    expect(service.headers.get('content-type')).not.toContain('text/csv');
    const body = (await service.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('erreur inattendue : 500 enveloppe admin.rapports.erreur_inconnue', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererCommande.mockRejectedValue(new Error('boom'));
    const response = await getCommande(request());
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.rapports.erreur_inconnue');
  });

  it('nominal : 200 CSV commande (BOM, tailles, totaux, zéro stock), attachment daté, no-store — service appelé avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererCommande.mockResolvedValue({
      nomFichier: 'azzel-commande-2027-2026-10-24.csv',
      contenu:
        '\uFEFFGénéré le 24/10/2026 10:00:00\r\n\r\nCommande t-shirts par épreuve et taille (validés)\r\nÉpreuve;XS;S;M;L;XL;XXL;Total\r\n\r\nZéro stock\r\nZéro stock : commandé = validé',
    });
    const response = await getCommande(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="azzel-commande-2027-2026-10-24.csv"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const octets = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(octets.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const texte = new TextDecoder('utf-8').decode(octets);
    expect(texte).toContain('Zéro stock : commandé = validé');
    expect(rapportsServiceMock.genererCommande).toHaveBeenCalledWith(SESSION_ORGANISATEUR);
  });

  it('slug d’édition PIÉGÉ : nom de fichier sanitizé dans Content-Disposition', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    rapportsServiceMock.genererCommande.mockResolvedValue({
      nomFichier: 'azzel-commande-"2027"\r\n.csv',
      contenu: '\uFEFFZéro stock',
    });
    const response = await getCommande(request());
    expect(response.status).toBe(200);
    // `"` + CR + LF → trois tirets : la valeur reste `attachment; filename="[\w.-]+"`.
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="azzel-commande--2027---.csv"',
    );
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="[\w.-]+"$/,
    );
  });
});
