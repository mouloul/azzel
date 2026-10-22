import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getEtat } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 3.3 — tests de GET /api/volontaires/etat : garde rôle volontaire
// (401 sans session, 403 coureur/organisateur — pattern des routes admin
// volontaires), forme de la réponse (fiche étendue + assistance + generéA),
// no-store, 503 base indisponible.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  getMissionsVolontaireState: vi.fn(),
}));

vi.mock(
  '@/modules/missions/service',
  () =>
    missionsServiceMock as unknown as typeof import('@/modules/missions/service'),
);

// L'assistance vient de l'environnement serveur : stubbé pour que le test
// ne dépende pas d'un AZZEL_ASSISTANCE_PHONE posé par la CI.
const assistanceMock = vi.hoisted(() => ({
  readAssistancePhone: vi.fn(() => '+213 555 010 200'),
}));

vi.mock(
  '@/lib/assistance-phone',
  () => assistanceMock as unknown as typeof import('@/lib/assistance-phone'),
);

const BASE = 'http://localhost:3000';

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const SESSION_COUREUR = { ...SESSION_VOLONTAIRE, accountId: 'account-coureur', role: 'coureur' };
const SESSION_ORGANISATEUR = {
  ...SESSION_VOLONTAIRE,
  accountId: 'account-admin',
  role: 'organisateur',
};

const MISSION = {
  id: 'mission-1',
  secteurNom: 'Village',
  secteurLieu: 'Place du village',
  secteurContact: '+213 555 010 203',
  type: 'accueil',
  typeLabel: 'Accueil',
  titre: 'Accueil village',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
  consignes: null,
  couverture: 'couverte',
  couvertureLabel: 'Couverte',
};

const ETAT = {
  editionNom: 'Édition 2027',
  mesMissions: [MISSION],
  missions: [MISSION],
};

function requete(withCookie: boolean): NextRequest {
  return new NextRequest(BASE + '/api/volontaires/etat', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.getMissionsVolontaireState.mockReset();
});

describe('GET /api/volontaires/etat', () => {
  it('sans cookie : 401 iam.unauthenticated, service non appelé', async () => {
    const response = await getEtat(requete(false));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(missionsServiceMock.getMissionsVolontaireState).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getEtat(requete(true));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(missionsServiceMock.getMissionsVolontaireState).not.toHaveBeenCalled();
  });

  it('session organisateur : 403 aussi (surface volontaire uniquement)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await getEtat(requete(true));
    expect(response.status).toBe(403);
  });

  it('base indisponible (garde) : 503 enveloppe terrain volontaires.db_unavailable, jamais admin.*', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getEtat(requete(true));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('volontaires.db_unavailable');
    expect(body.error.action).toContain('Réessaie');
  });

  it('service en échec (base) : 503 enveloppe volontaires.db_unavailable aussi', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    missionsServiceMock.getMissionsVolontaireState.mockRejectedValue(new DbUnavailableError());
    const response = await getEtat(requete(true));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.db_unavailable');
  });

  it('session volontaire : 200, forme complète {editionNom, assistancePhone, mesMissions, missions, generéA}, no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const response = await getEtat(requete(true));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      editionNom: string;
      assistancePhone: string;
      mesMissions: typeof MISSION[];
      missions: typeof MISSION[];
      generéA: string;
    };
    expect(body.editionNom).toBe('Édition 2027');
    expect(body.assistancePhone).toBe('+213 555 010 200');
    expect(body.mesMissions[0]).toMatchObject({
      secteurLieu: 'Place du village',
      secteurContact: '+213 555 010 203',
    });
    expect(body.missions).toHaveLength(1);
    // generéA : ISO 8601 UTC (…Z) parseable — la fraîcheur en dépend.
    expect(body.generéA).toMatch(/Z$/);
    expect(Number.isNaN(new Date(body.generéA).getTime())).toBe(false);
  });
});
