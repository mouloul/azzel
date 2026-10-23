import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postAnnulationRoute, MAX_CORPS_ANNULATION_OCTETS } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  AnnulationEvenementIntrouvableError,
  AnnulationRetraitRefuseError,
  InvalidAnnulationFieldsError,
} from '@/modules/chrono/errors';

// Story 5.4 — route POST /api/admin/course/annulation : guardAdmin
// (401/403/503), garde de corps (taille, JSON), enveloppes admin.course.*
// (400 champ + fields, 404 introuvable, 409 retrait refusé), 201 créé /
// 200 « déjà annulé » (idempotent) no-store. Isolée par mocks (pattern
// routes admin).

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const chronoServiceMock = vi.hoisted(() => ({
  annulerPassage: vi.fn(),
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

const EVENEMENT_ID = '22222222-3333-4222-8222-222222222222';
const DEMANDE = { evenementId: EVENEMENT_ID, motif: 'Mauvais scan du dossard voisin' };

function request(corps: string | null, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/annulation', {
    method: 'POST',
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
 * Corps CHUNKED sans content-length (stream) : la garde taille ne s'applique
 * qu'au content-length DÉCLARÉ — ici la validation du corps est la défense.
 * C'est le CONTOUR RÉEL de la garde : un envoi volumineux non déclaré passe
 * la garde, la validation du service tranche (ici corps valide → 201).
 */
function requestChunked(corps: string, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/admin/course/annulation', {
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
  chronoServiceMock.annulerPassage.mockReset();
});

describe('POST /api/admin/course/annulation', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE), false));
    expect(response.status).toBe(401);
    expect(chronoServiceMock.annulerPassage).not.toHaveBeenCalled();
  });

  it('session volontaire : 403, service non appelé (admin PC uniquement)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(403);
    expect(chronoServiceMock.annulerPassage).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe admin.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.db_unavailable');
  });

  it('corps CHUNKED sans content-length : la garde taille ne rejette PAS — corps valide 201, corps illisible 400', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockResolvedValue({
      dejaAnnule: false,
      evenementId: EVENEMENT_ID,
      dossard: 101,
      checkpointTitre: 'Scan km 12',
    });
    const valide = await postAnnulationRoute(requestChunked(JSON.stringify(DEMANDE)));
    expect(valide.status).toBe(201);
    expect(chronoServiceMock.annulerPassage).toHaveBeenCalledWith(SESSION_ORGANISATEUR, DEMANDE);

    const illisible = await postAnnulationRoute(requestChunked('{pas-du-json'));
    expect(illisible.status).toBe(400);
    const body = (await illisible.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.annulation_corps_invalide');
  });

  it('garde de corps : JSON illisible → 400, trop grand → 413', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const illisible = await postAnnulationRoute(request('{pas-du-json'));
    expect(illisible.status).toBe(400);
    const body = (await illisible.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.annulation_corps_invalide');
    const tropGrand = await postAnnulationRoute(
      request('x'.repeat(MAX_CORPS_ANNULATION_OCTETS + 1)),
    );
    expect(tropGrand.status).toBe(413);
    const bodyGrand = (await tropGrand.json()) as { error: { code: string } };
    expect(bodyGrand.error.code).toBe('admin.course.annulation_corps_trop_grand');
    expect(chronoServiceMock.annulerPassage).not.toHaveBeenCalled();
  });

  it('champs invalides : 400 enveloppe admin.course.annulation_champs_invalides + fields', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockRejectedValue(
      new InvalidAnnulationFieldsError({ motif: 'Le motif est obligatoire.' }),
    );
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      error: { code: string };
      fields: { motif: string };
    };
    expect(body.error.code).toBe('admin.course.annulation_champs_invalides');
    expect(body.fields.motif).toContain('obligatoire');
  });

  it('introuvable (id inconnu/autre org) : 404 enveloppe admin.course.annulation_introuvable', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockRejectedValue(new AnnulationEvenementIntrouvableError());
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string }; fields?: unknown };
    expect(body.error.code).toBe('admin.course.annulation_introuvable');
    expect(body.fields).toBeUndefined();
  });

  it('retrait refusé (V1) : 409 enveloppe admin.course.annulation_retrait_refuse', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockRejectedValue(new AnnulationRetraitRefuseError());
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.course.annulation_retrait_refuse');
    expect(body.error.message).toBe('Seuls les passages peuvent être annulés.');
  });

  it('annulation nominale : 201 no-store, résultat sérialisé, service appelé avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockResolvedValue({
      dejaAnnule: false,
      evenementId: EVENEMENT_ID,
      dossard: 101,
      checkpointTitre: 'Scan km 12',
    });
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      annulation: {
        dejaAnnule: false,
        evenementId: EVENEMENT_ID,
        dossard: 101,
        checkpointTitre: 'Scan km 12',
      },
    });
    expect(chronoServiceMock.annulerPassage).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      DEMANDE,
    );
  });

  it('déjà annulé (rejeu idempotent) : 200 no-store avec drapeau, PAS d’erreur', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockResolvedValue({
      dejaAnnule: true,
      evenementId: EVENEMENT_ID,
      dossard: 101,
      checkpointTitre: 'Scan km 12',
    });
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { ok: boolean; annulation: { dejaAnnule: boolean } };
    expect(body.ok).toBe(true);
    expect(body.annulation.dejaAnnule).toBe(true);
  });

  it('erreur inattendue : 500 enveloppe admin.course.erreur_inconnue', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    chronoServiceMock.annulerPassage.mockRejectedValue(new Error('boom'));
    const response = await postAnnulationRoute(request(JSON.stringify(DEMANDE)));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.course.erreur_inconnue');
  });
});
