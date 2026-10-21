import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as postDecision } from './route';

import {
  DossierNotFoundError,
  DossierValidatedError,
  RefusalReasonRequiredError,
} from '@/modules/inscriptions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  decideDossier: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
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

const COUREUR_VALIDE = {
  id: 'coureur-1',
  status: 'validé',
  refusalReason: null,
};

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function postRequest(
  raw: string,
  withCookie = true,
  length: number | null = raw.length,
  id = 'coureur-1',
): NextRequest {
  return new NextRequest(`${BASE}/api/admin/dossiers/${id}/decision`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(length === null ? {} : { 'content-length': String(length) }),
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body: raw,
    duplex: 'half',
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.decideDossier.mockReset();
});

describe('POST /api/admin/dossiers/[id]/decision', () => {
  it('sans cookie : 401, service non appelé', async () => {
    const response = await postDecision(
      postRequest('{"decision":"valider"}', false),
      context('coureur-1'),
    );
    expect(response.status).toBe(401);
    expect(inscriptionsServiceMock.decideDossier).not.toHaveBeenCalled();
  });

  it('session coureur : 403 enveloppe iam.forbidden, rien ne change', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await postDecision(
      postRequest('{"decision":"valider"}'),
      context('coureur-1'),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(inscriptionsServiceMock.decideDossier).not.toHaveBeenCalled();
  });

  it('corps illisible : 400 admin.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postDecision(postRequest('pas du json'), context('coureur-1'));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.invalid_body');
    expect(inscriptionsServiceMock.decideDossier).not.toHaveBeenCalled();
  });

  it('corps trop volumineux : 400 admin.body_too_large', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await postDecision(
      postRequest('{"decision":"refuser"}', true, 4097),
      context('coureur-1'),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.body_too_large');
    expect(inscriptionsServiceMock.decideDossier).not.toHaveBeenCalled();
  });

  it('refus sans motif : 400 admin.refusal_reason_required, statut inchangé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.decideDossier.mockRejectedValue(new RefusalReasonRequiredError());

    const response = await postDecision(
      postRequest('{"decision":"refuser","motif":"  "}'),
      context('coureur-1'),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('admin.refusal_reason_required');
    expect(body.error.message).toContain('motif');
  });

  it('validation : 200 avec le coureur mis à jour', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.decideDossier.mockResolvedValue(COUREUR_VALIDE);

    const response = await postDecision(
      postRequest('{"decision":"valider"}'),
      context('coureur-1'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual({ ok: true, coureur: COUREUR_VALIDE });
    expect(inscriptionsServiceMock.decideDossier).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'coureur-1',
      { decision: 'valider' },
    );
  });

  it('refus depuis validé : 409 admin.dossier_valide', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.decideDossier.mockRejectedValue(new DossierValidatedError());

    const response = await postDecision(
      postRequest('{"decision":"refuser","motif":"trop tard"}'),
      context('coureur-1'),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.dossier_valide');
  });

  it('dossier inconnu : 404 admin.dossier_not_found', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    inscriptionsServiceMock.decideDossier.mockRejectedValue(new DossierNotFoundError());

    const response = await postDecision(
      postRequest('{"decision":"valider"}', true, undefined, 'inconnu'),
      context('inconnu'),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.dossier_not_found');
    expect(inscriptionsServiceMock.decideDossier).toHaveBeenCalledWith(
      SESSION_ORGANISATEUR,
      'inconnu',
      { decision: 'valider' },
    );
  });

  it('sans Content-Length (chunked) : 400 admin.invalid_body, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);

    const response = await postDecision(
      postRequest('{"decision":"valider"}', true, null),
      context('coureur-1'),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('admin.invalid_body');
    expect(inscriptionsServiceMock.decideDossier).not.toHaveBeenCalled();
  });
});
