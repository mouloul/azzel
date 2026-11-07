import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteVolontaireRoute, PUT as putVolontaire } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  InvalidVolontaireFieldsError,
  VolontaireAffecteError,
  VolontaireEmailPrisError,
  VolontaireEmailReserveError,
  VolontaireNotFoundError,
} from '@/modules/missions/errors';

// Story 3.5 — routes de correction et de suppression d'un volontaire. Pattern
// de la route invitation (3.1) : garde admin d'abord, enveloppe d'erreur
// unique, no-store.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  updateVolontaire: vi.fn(),
  deleteVolontaire: vi.fn(),
}));

vi.mock(
  '@/modules/missions/service',
  () => missionsServiceMock as unknown as typeof import('@/modules/missions/service'),
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

const SAISIE = { nom: 'Kahina Ait', email: 'kahina@exemple.dz', telephone: null };

function requetePut(corps: unknown, withCookie = true): NextRequest {
  const body = JSON.stringify(corps);
  return new NextRequest(`${BASE}/api/admin/volontaires/v-1`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).length),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body,
  });
}

function requeteDelete(withCookie = true): NextRequest {
  return new NextRequest(`${BASE}/api/admin/volontaires/v-1`, {
    method: 'DELETE',
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

const params = { params: Promise.resolve({ id: 'v-1' }) };

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.updateVolontaire.mockReset();
  missionsServiceMock.deleteVolontaire.mockReset();
});

describe('PUT /api/admin/volontaires/[id] — correction d’un volontaire', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await putVolontaire(requetePut(SAISIE, false), params);
    expect(response.status).toBe(401);
    expect(missionsServiceMock.updateVolontaire).not.toHaveBeenCalled();
  });

  it('session volontaire : 403 — la correction reste à l’organisation', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await putVolontaire(requetePut(SAISIE), params);
    expect(response.status).toBe(403);
    expect(missionsServiceMock.updateVolontaire).not.toHaveBeenCalled();
  });

  it('base indisponible (garde) : 503', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await putVolontaire(requetePut(SAISIE), params);
    expect(response.status).toBe(503);
  });

  it('succès : 200 no-store, corps transmis tel quel, renvoi d’invitation remonté', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateVolontaire.mockResolvedValue({
      volontaire: { id: 'v-1', email: 'kahina@exemple.dz' },
      invitationRenvoyee: true,
    });
    const response = await putVolontaire(requetePut(SAISIE), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      invitationRenvoyee: true,
      email: 'kahina@exemple.dz',
    });
    expect(missionsServiceMock.updateVolontaire).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'v-1',
      SAISIE,
    );
  });

  it('champs invalides : 400 avec les erreurs PAR CHAMP dans le corps', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateVolontaire.mockRejectedValue(
      new InvalidVolontaireFieldsError({ email: 'Cet email n’est pas valide.' }),
    );
    const response = await putVolontaire(requetePut({ nom: 'A', email: 'x' }), params);
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string };
      fields: { email?: string };
    };
    expect(body.error.code).toBe('admin.volontaires.champs_invalides');
    expect(body.fields.email).toBeTypeOf('string');
  });

  it('adresse prise : 409 avec le champ email ; adresse réservée : 409 dédié', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.updateVolontaire.mockRejectedValueOnce(new VolontaireEmailPrisError());
    const pris = await putVolontaire(requetePut(SAISIE), params);
    expect(pris.status).toBe(409);
    const corpsPris = (await pris.json()) as { error: { code: string }; fields: { email?: string } };
    expect(corpsPris.error.code).toBe('admin.volontaires.email_pris');
    expect(corpsPris.fields.email).toBeTypeOf('string');

    missionsServiceMock.updateVolontaire.mockRejectedValueOnce(new VolontaireEmailReserveError());
    const reserve = await putVolontaire(requetePut(SAISIE), params);
    expect(reserve.status).toBe(409);
    const corpsReserve = (await reserve.json()) as { error: { code: string } };
    expect(corpsReserve.error.code).toBe('admin.volontaires.email_reserve');
  });

  it('corps illisible : 400, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const requete = new NextRequest(`${BASE}/api/admin/volontaires/v-1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'content-length': '7',
        cookie: 'azzel_session=jeton-session',
      },
      body: 'pas-json',
    });
    const response = await putVolontaire(requete, params);
    expect(response.status).toBe(400);
    expect(missionsServiceMock.updateVolontaire).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/volontaires/[id] — suppression d’un volontaire', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await deleteVolontaireRoute(requeteDelete(false), params);
    expect(response.status).toBe(401);
    expect(missionsServiceMock.deleteVolontaire).not.toHaveBeenCalled();
  });

  it('session volontaire : 403', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await deleteVolontaireRoute(requeteDelete(), params);
    expect(response.status).toBe(403);
  });

  it('succès : 200 no-store { ok: true }', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteVolontaire.mockResolvedValue({ ok: true });
    const response = await deleteVolontaireRoute(requeteDelete(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(missionsServiceMock.deleteVolontaire).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'v-1',
    );
  });

  it('volontaire encore affecté : 409 nommant le nombre de missions', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteVolontaire.mockRejectedValue(new VolontaireAffecteError(2));
    const response = await deleteVolontaireRoute(requeteDelete(), params);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.volontaires.affecte');
    expect(body.error.message).toContain('2');
  });

  it('volontaire d’une autre organisation : 404', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    missionsServiceMock.deleteVolontaire.mockRejectedValue(new VolontaireNotFoundError());
    const response = await deleteVolontaireRoute(requeteDelete(), params);
    expect(response.status).toBe(404);
  });
});
