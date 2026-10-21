import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getInscriptions, POST as postInscriptions } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import {
  DossierValidatedError,
  InvalidFieldsError,
  RegistrationClosedError,
} from '@/modules/inscriptions/errors';

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  submitInscription: vi.fn(),
  getInscriptionState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

const BASE = 'http://localhost:3000';

const SESSION = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const COUREUR = {
  id: 'coureur-1',
  epreuve: 'longue',
  epreuveNom: 'La Longue — 35 km',
  distanceKm: 35,
  prenom: 'Yani',
  nom: 'Ulahianne',
  telephone: '+213555010203',
  contactUrgenceNom: 'Lounis Ulahianne',
  contactUrgenceTelephone: '0555010204',
  dateNaissance: '1990-05-12',
  tailleTshirt: 'M',
  age: 36,
  categorie: 'Senior',
  status: 'en constitution',
  createdAt: '2026-10-21T08:00:00.000Z',
  updatedAt: '2026-10-21T08:00:00.000Z',
};

function postRequest(body: string, withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/inscriptions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(withCookie ? { cookie: 'azzel_session=jeton-session' } : {}),
    },
    body,
    duplex: 'half',
  });
}

function getRequest(withCookie = true): NextRequest {
  return new NextRequest(BASE + '/api/inscriptions', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  inscriptionsServiceMock.submitInscription.mockReset();
  inscriptionsServiceMock.getInscriptionState.mockReset();
});

describe('POST /api/inscriptions', () => {
  it('sans cookie : 401 enveloppe inscriptions.unauthenticated, service non appelé', async () => {
    const response = await postInscriptions(postRequest('{}', false));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { version: number; error: { code: string } };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('inscriptions.unauthenticated');
    expect(inscriptionsServiceMock.submitInscription).not.toHaveBeenCalled();
  });

  it('session invalide : 401', async () => {
    iamServiceMock.getSession.mockResolvedValue(null);

    const response = await postInscriptions(postRequest('{}'));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.unauthenticated');
    expect(inscriptionsServiceMock.submitInscription).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe inscriptions.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());

    const response = await postInscriptions(postRequest('{}'));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.db_unavailable');
  });

  it('corps illisible : 400 enveloppe inscriptions.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postInscriptions(postRequest('{pas du json'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.invalid_body');
    expect(inscriptionsServiceMock.submitInscription).not.toHaveBeenCalled();
  });

  it('session + dossier complet : 200 avec le coureur, service appelé avec la session', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.submitInscription.mockResolvedValue(COUREUR);
    const payload = { epreuve: 'longue', prenom: 'Yani' };

    const response = await postInscriptions(postRequest(JSON.stringify(payload)));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; coureur: typeof COUREUR };
    expect(body.ok).toBe(true);
    expect(body.coureur).toEqual(COUREUR);
    expect(iamServiceMock.getSession).toHaveBeenCalledWith('jeton-session');
    expect(inscriptionsServiceMock.submitInscription).toHaveBeenCalledWith(SESSION, payload);
  });

  it('champs manquants : 400 enveloppe nommant chaque champ', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.submitInscription.mockRejectedValue(
      new InvalidFieldsError({
        prenom: 'Ton prénom est obligatoire.',
        telephone: 'Ton numéro de téléphone est obligatoire.',
      }),
    );

    const response = await postInscriptions(postRequest('{}'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      version: number;
      error: { code: string };
      fields: Record<string, string>;
    };
    expect(body.version).toBe(1);
    expect(body.error.code).toBe('inscriptions.invalid_fields');
    expect(body.fields.prenom).toBe('Ton prénom est obligatoire.');
    expect(body.fields.telephone).toBe('Ton numéro de téléphone est obligatoire.');
  });

  it('après clôture : 403 enveloppe inscriptions.closed', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.submitInscription.mockRejectedValue(
      new RegistrationClosedError(new Date('2027-03-16T22:59:59.000Z')),
    );

    const response = await postInscriptions(postRequest('{}'));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('inscriptions.closed');
    expect(body.error.message).toContain('16 mars 2027');
  });

  it('dossier déjà validé : 409 enveloppe inscriptions.dossier_valide', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.submitInscription.mockRejectedValue(new DossierValidatedError());

    const response = await postInscriptions(postRequest('{}'));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.dossier_valide');
  });

  it('erreur inconnue : 500 enveloppe inscriptions.internal_error sans détail', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    inscriptionsServiceMock.submitInscription.mockRejectedValue(new Error('boom'));

    const response = await postInscriptions(postRequest('{}'));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('inscriptions.internal_error');
    expect(body.error.message).not.toContain('boom');
  });

  it('corps tableau JSON : 400 enveloppe inscriptions.invalid_body', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postInscriptions(postRequest('["longue"]'));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.invalid_body');
    expect(inscriptionsServiceMock.submitInscription).not.toHaveBeenCalled();
  });

  it('corps de plus de 32 Ko : 400 enveloppe inscriptions.body_too_large, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);

    const response = await postInscriptions(
      new NextRequest(BASE + '/api/inscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'azzel_session=jeton-session', 'content-length': '40000' },
        body: '{}',
        duplex: 'half',
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.body_too_large');
    expect(inscriptionsServiceMock.submitInscription).not.toHaveBeenCalled();
  });
});

describe('GET /api/inscriptions', () => {
  it('sans cookie : 401', async () => {
    const response = await getInscriptions(getRequest(false));

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.unauthenticated');
  });

  it('session valide : 200 avec l’état du formulaire', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION);
    const state = {
      edition: {
        id: 'edition-1',
        slug: '2027',
        nom: 'Édition 2027',
        dateCourse: '2027-03-26',
        registrationClosesAt: '2027-03-16T22:59:59.000Z',
        registrationOpen: true,
      },
      epreuves: [
        { id: 'ep-1', slug: 'longue', nom: 'La Longue — 35 km', distanceKm: 35 },
        { id: 'ep-2', slug: 'moyenne', nom: 'La Moyenne — 12 km', distanceKm: 12 },
      ],
      coureur: null,
    };
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue(state);

    const response = await getInscriptions(getRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(state);
    expect(inscriptionsServiceMock.getInscriptionState).toHaveBeenCalledWith(SESSION);
  });

  it('base indisponible : 503 enveloppe inscriptions.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());

    const response = await getInscriptions(getRequest());

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('inscriptions.db_unavailable');
    expect(inscriptionsServiceMock.getInscriptionState).not.toHaveBeenCalled();
  });
});
