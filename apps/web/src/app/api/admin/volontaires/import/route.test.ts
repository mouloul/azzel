import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postImport } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { ImportFileInvalidError } from '@/modules/missions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  importVolontaires: vi.fn(),
}));

vi.mock(
  '@/modules/missions/service',
  () =>
    missionsServiceMock as unknown as typeof import('@/modules/missions/service'),
);

const BASE = 'http://localhost:3000';

const SESSION_ORGANISATEUR = {
  accountId: 'account-admin',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_COUREUR = {
  accountId: 'account-coureur',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const RAPPORT = {
  lignes: [
    { ligne: 2, nom: 'Kahina', email: 'kahina@exemple.dz', statut: 'créé' as const },
    { ligne: 3, nom: 'X', email: 'x@exemple.dz', statut: 'rejeté' as const, raison: 'email invalide' },
  ],
  resume: { crees: 1, ignores: 0, rejetes: 1, invitationsEnFile: 1 },
};

function multipartRequest(
  withCookie: boolean,
  options: { contentType?: string; length?: number | null; file?: File | null } = {},
): NextRequest {
  const form = new FormData();
  const file = options.file === undefined ? new File(['Nom;Email\nA;a@x.dz\n'], 'v.csv', { type: 'text/csv' }) : options.file;
  if (file !== null) {
    form.append('fichier', file);
  }
  // Sans contentType explicite, undici pose le multipart avec SA frontière —
  // imposer la nôtre rendrait le corps inanalysable.
  const headers: Record<string, string> = {
    ...(options.length === null ? {} : { 'content-length': String(options.length ?? 200) }),
    ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
  };
  if (options.contentType !== undefined) {
    headers['content-type'] = options.contentType;
  }
  return new NextRequest(BASE + '/api/admin/volontaires/import', {
    method: 'POST',
    headers,
    body: form,
    duplex: 'half',
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.importVolontaires.mockReset();
});

describe('POST /api/admin/volontaires/import', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postImport(multipartRequest(false));
    expect(response.status).toBe(401);
    expect(missionsServiceMock.importVolontaires).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postImport(multipartRequest(true));
    expect(response.status).toBe(403);
    expect(missionsServiceMock.importVolontaires).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503 admin.volontaires.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postImport(multipartRequest(true));
    expect(response.status).toBe(503);
  });

  it('pas de Content-Length : 400 admin.volontaires.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postImport(multipartRequest(true, { length: null }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.volontaires.invalid_body');
  });

  it('corps > 2 Mo : 400 admin.volontaires.import_trop_lourd', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postImport(multipartRequest(true, { length: 2 * 1024 * 1024 + 1 }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.volontaires.import_trop_lourd');
  });

  it('non-multipart : 400', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postImport(multipartRequest(true, { contentType: 'application/json' }));
    expect(response.status).toBe(400);
  });

  it('champ fichier absent : 400', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postImport(multipartRequest(true, { file: null }));
    expect(response.status).toBe(400);
  });

  it('fichier vide (0 octet) : 400 admin.volontaires.import_invalide (pas le message 2 Mo)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postImport(
      multipartRequest(true, { file: new File([], 'v.csv', { type: 'text/csv' }) }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.volontaires.import_invalide');
    expect(missionsServiceMock.importVolontaires).not.toHaveBeenCalled();
  });

  it('session organisateur : 200 avec rapport ligne par ligne et no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.importVolontaires.mockResolvedValue(RAPPORT);
    const response = await postImport(multipartRequest(true));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ rapport: RAPPORT });
    expect(missionsServiceMock.importVolontaires).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      expect.objectContaining({ filename: 'v.csv' }),
    );
  });

  it('fichier illisible : 400 admin.volontaires.import_invalide avec action « vérifie »', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.importVolontaires.mockRejectedValue(new ImportFileInvalidError());
    const response = await postImport(multipartRequest(true));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('admin.volontaires.import_invalide');
    expect(body.error.action).toContain('Vérifie');
  });

  it('erreur inconnue : 500 sans détail interne', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.importVolontaires.mockRejectedValue(new Error('boom'));
    const response = await postImport(multipartRequest(true));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.volontaires.internal_error');
    expect(body.error.message).not.toContain('boom');
  });
});
