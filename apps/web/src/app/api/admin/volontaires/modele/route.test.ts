import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getModele } from './route';

// Story 3.1 (patch de revue) — gabarit d'import téléchargeable : garde admin
// (401 / 403) et en-têtes du fichier (.xlsx en pièce jointe, jamais caché).
// Le gabarit est construit par le VRAI service (exceljs) : on vérifie aussi
// que la colonne Téléphone est au format texte.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const BASE = 'http://localhost:3000';

const SESSION_ORGANISATEUR = {
  accountId: 'account-admin',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'volontaire@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function request(withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/volontaires/modele`, {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
});

describe('GET /api/admin/volontaires/modele — gabarit d’import', () => {
  it('sans cookie : 401, aucun fichier', async () => {
    const response = await getModele(request(false));
    expect(response.status).toBe(401);
    expect(response.headers.get('content-disposition')).toBeNull();
  });

  it('session non organisateur (volontaire) : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await getModele(request());
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
  });

  it('session organisateur : 200, xlsx en pièce jointe, no-store, Téléphone en texte', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await getModele(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="volontaires-modele.xlsx"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');

    const octets = new Uint8Array(await response.arrayBuffer());
    // Signature ZIP (PK\x03\x04) : un vrai classeur .xlsx.
    expect(Array.from(octets.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const { Workbook } = await import('exceljs');
    const classeur = new Workbook();
    await classeur.xlsx.load(octets.buffer as ArrayBuffer);
    const feuille = classeur.worksheets[0];
    expect(feuille?.getRow(1).values).toEqual([undefined, 'Nom', 'Email', 'Téléphone']);
    expect(feuille?.getColumn(3).numFmt).toBe('@');
  });
});
