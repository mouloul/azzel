import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getAnnuaire } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';
import { AucuneEditionError } from '@/modules/missions/errors';
import { ANNUAIRE_SCHEMA_VERSION, estAnnuaireValide } from '@azzel/shared';

// Story 3.4 — tests de GET /api/volontaires/annuaire : garde rôle volontaire
// (401 sans session, 403 coureur/organisateur), payload = contrat shared
// versionné (version/editionId/genereA/coureurs triés, validé par
// estAnnuaireValide), no-store, 503 enveloppes terrain volontaires.*.

const iamServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock(
  '@/modules/iam/service',
  () => iamServiceMock as unknown as typeof import('@/modules/iam/service'),
);

const missionsServiceMock = vi.hoisted(() => ({
  getAnnuaireEdition: vi.fn(),
}));

vi.mock(
  '@/modules/missions/service',
  () =>
    missionsServiceMock as unknown as typeof import('@/modules/missions/service'),
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

function requete(withCookie: boolean): NextRequest {
  return new NextRequest(BASE + '/api/volontaires/annuaire', {
    headers: withCookie ? { cookie: 'azzel_session=jeton-session' } : {},
  });
}

beforeEach(() => {
  iamServiceMock.getSession.mockReset();
  missionsServiceMock.getAnnuaireEdition.mockReset();
});

describe('GET /api/volontaires/annuaire', () => {
  it('sans cookie : 401 iam.unauthenticated, service non appelé', async () => {
    const response = await getAnnuaire(requete(false));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.unauthenticated');
    expect(missionsServiceMock.getAnnuaireEdition).not.toHaveBeenCalled();
  });

  it('session coureur : 403 iam.forbidden, service non appelé', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_COUREUR);
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('iam.forbidden');
    expect(missionsServiceMock.getAnnuaireEdition).not.toHaveBeenCalled();
  });

  it('session organisateur : 403 aussi (surface volontaire uniquement)', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_ORGANISATEUR);
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(403);
  });

  it('base indisponible (garde) : 503 enveloppe terrain volontaires.db_unavailable', async () => {
    iamServiceMock.getSession.mockRejectedValue(new DbUnavailableError());
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.db_unavailable');
  });

  it('aucune édition : 503 volontaires.annuaire_sans_edition, jamais admin.*', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    missionsServiceMock.getAnnuaireEdition.mockRejectedValue(new AucuneEditionError());
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.annuaire_sans_edition');
  });

  it('service en échec (base) : 503 volontaires.db_unavailable aussi', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    missionsServiceMock.getAnnuaireEdition.mockRejectedValue(new DbUnavailableError());
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.db_unavailable');
  });

  it('session volontaire : 200, payload = contrat shared validé (version 2, jetons, tri), no-store', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    missionsServiceMock.getAnnuaireEdition.mockResolvedValue({
      version: ANNUAIRE_SCHEMA_VERSION,
      editionId: 'edition-1',
      genereA: '2026-10-22T08:00:00.000Z',
      coureurs: [
        // Contrat v2 (story 4.1) : jeton par coureur, tri par dossard.
        {
          dossard: 1,
          nom: 'Ulahianne',
          prenom: 'Yani',
          jeton: 'jeton-coureur-1-aaaaaa',
        },
        {
          dossard: 12,
          nom: 'Cherchée',
          prenom: 'Iness',
          jeton: 'jeton-coureur-12-aaaaa',
        },
      ],
    });
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(estAnnuaireValide(body)).toBe(true);
    expect(body.version).toBe(ANNUAIRE_SCHEMA_VERSION);
    expect(body.editionId).toBe('edition-1');
    expect(body.coureurs.map((coureur: { dossard: number }) => coureur.dossard)).toEqual([
      1,
      12,
    ]);
    for (const coureur of body.coureurs) {
      expect(coureur.jeton).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });

  it('aucun coureur numéroté : 200 avec coureurs [] — « rien à précharger » côté PWA', async () => {
    iamServiceMock.getSession.mockResolvedValue(SESSION_VOLONTAIRE);
    missionsServiceMock.getAnnuaireEdition.mockResolvedValue({
      version: ANNUAIRE_SCHEMA_VERSION,
      editionId: 'edition-1',
      genereA: '2026-10-22T08:00:00.000Z',
      coureurs: [],
    });
    const response = await getAnnuaire(requete(true));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(estAnnuaireValide(body)).toBe(true);
    expect(body.coureurs).toEqual([]);
  });
});
