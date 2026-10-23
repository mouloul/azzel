import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POSITION_SCHEMA_VERSION,
  SYNC_POSITION_MAX_LOT,
  type PositionTerrain,
} from '@azzel/shared';

import { POST as syncRoute, MAX_CORPS_SYNC_OCTETS } from './route';

import {
  AppareilRevokedError,
  JetonAppareilInvalideError,
} from '@/modules/tracking/errors';

// Story 6.2 — tests de POST /api/coureur/tracking/sync : garde DÉDIÉE par
// Bearer jeton d'appareil SEUL (une session ne vaut RIEN ici — le jeton
// survit à AD-5), Bearer VÉRIFIÉ AVANT le corps (401 ne se masque jamais par
// un 400/413), content-length EXIGÉE (un corps chunké ne contourne pas la
// garde 1 Mo), lot ≤ 200 (413 au-delà), réponse par position + compteurs,
// enveloppes tracking.*, no-store.

const trackingServiceMock = vi.hoisted(() => ({
  verifierJetonAppareil: vi.fn(),
  synchroniserLotPositions: vi.fn(),
}));

vi.mock(
  '@/modules/tracking/service',
  () => trackingServiceMock as unknown as typeof import('@/modules/tracking/service'),
);

const BASE = 'http://localhost:3000/api/coureur/tracking/sync';

const APPAREIL_AUTH = {
  id: 'appareil-uuid-1',
  organisationId: 'org-1',
  accountId: 'account-1',
  appareilClient: 'app-client-1',
};

function positionValide(surcharge: Partial<PositionTerrain> = {}): PositionTerrain {
  return {
    version: POSITION_SCHEMA_VERSION,
    lat: 36.712345,
    lon: 3.187654,
    capteA: '2027-05-16T07:05:09.000Z',
    ...surcharge,
  };
}

function requete(corps: string, entetes: Record<string, string> = {}): NextRequest {
  // Content-length EXPLICITE : un Request de test ne la pose jamais seule
  // (en-tête interdit côté fetch) alors qu'un client HTTP réel l'envoie
  // toujours — la route l'EXIGE (garde 1 Mo sans échappatoire chunked).
  return new NextRequest(BASE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(corps).length),
      ...entetes,
    },
    body: corps,
  });
}

/** Requête en corps CHUNKED (stream) : fetch ne pose PAS de content-length. */
function requeteChunked(entetes: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(
          new TextEncoder().encode('{"appareilId":"app-client-1","positions":[]}'),
        );
        controleur.close();
      },
    }),
    duplex: 'half',
  });
}

beforeEach(() => {
  trackingServiceMock.verifierJetonAppareil.mockReset();
  trackingServiceMock.synchroniserLotPositions.mockReset();
  trackingServiceMock.verifierJetonAppareil.mockResolvedValue(APPAREIL_AUTH);
  trackingServiceMock.synchroniserLotPositions.mockResolvedValue({
    resultats: [],
    compteurs: { acceptes: 0, dejaConnus: 0, rejetes: 0 },
    recuA: '2027-05-16T07:06:00.000Z',
  });
});

describe('POST /api/coureur/tracking/sync — garde Bearer appareil SEUL (AD-5)', () => {
  it('sans Authorization : 401 tracking.jeton_invalide, service non appelé', async () => {
    const response = await syncRoute(requete(JSON.stringify({ appareilId: 'app-client-1', positions: [] })));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.jeton_invalide');
    expect(trackingServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
  });

  it('garde session ≠ sync : un cookie de session sans Bearer appareil ne passe pas', async () => {
    const response = await syncRoute(
      requete(JSON.stringify({ appareilId: 'app-client-1', positions: [] }), {
        cookie: 'azzel_session=jeton-session',
      }),
    );
    expect(response.status).toBe(401);
    expect(trackingServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });

  it('Bearer vide ou schéma étranger : 401 aussi', async () => {
    for (const entete of ['Bearer ', 'Basic xyz']) {
      const response = await syncRoute(
        requete(JSON.stringify({ appareilId: 'app-client-1', positions: [] }), {
          authorization: entete,
        }),
      );
      expect(response.status, entete).toBe(401);
    }
  });

  it('Bearer VÉRIFIÉ avant le corps : jeton inconnu + corps illisible → 401 (pas 400)', async () => {
    trackingServiceMock.verifierJetonAppareil.mockRejectedValue(new JetonAppareilInvalideError());
    const response = await syncRoute(
      requete('{pas-du-json', { authorization: 'Bearer jeton-inconnu' }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.jeton_invalide');
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });

  it('Bearer révoqué : 401 DÉDIÉ tracking.appareil_revoked AVANT le corps', async () => {
    trackingServiceMock.verifierJetonAppareil.mockRejectedValue(new AppareilRevokedError());
    const response = await syncRoute(
      requete('{pas-du-json', { authorization: 'Bearer jeton-revoque' }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('tracking.appareil_revoked');
    expect(body.error.action).toContain('Appelle');
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });
});

describe('POST /api/coureur/tracking/sync — garde taille du corps', () => {
  it(`Content-Length > ${MAX_CORPS_SYNC_OCTETS} : 413 AVANT request.json() (défense DoS)`, async () => {
    const response = await syncRoute(
      new NextRequest(BASE, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer jeton-valide',
          'content-length': String(MAX_CORPS_SYNC_OCTETS + 1),
        },
        body: '{ "appareilId": "app", "positions": [], "remplissage": "peu importe — jamais lu" }',
      }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.corps_trop_grand');
    expect(trackingServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });

  it('Content-Length ABSENTE (corps chunked) : 413 — la garde 1 Mo ne se contourne pas', async () => {
    const response = await syncRoute(requeteChunked({ authorization: 'Bearer jeton-valide' }));
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.corps_trop_grand');
    expect(trackingServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });
});

describe('POST /api/coureur/tracking/sync — corps du lot', () => {
  it('JSON illisible (Bearer valide) : 400 tracking.corps_invalide', async () => {
    const response = await syncRoute(
      requete('{pas-du-json', { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.corps_invalide');
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });

  it('corps sans appareilId : 400 tracking.corps_invalide', async () => {
    const response = await syncRoute(
      requete(JSON.stringify({ positions: [] }), { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.corps_invalide');
  });

  it('position hors contrat : PAS un 400 — rejetée PAR POSITION (la file ne se bloque jamais)', async () => {
    trackingServiceMock.synchroniserLotPositions.mockResolvedValue({
      resultats: [{ cle: '', statut: 'rejeté', motif: 'position invalide' }],
      compteurs: { acceptes: 0, dejaConnus: 0, rejetes: 1 },
      recuA: '2027-05-16T07:06:00.000Z',
    });
    const response = await syncRoute(
      requete(
        JSON.stringify({ appareilId: 'app-client-1', positions: [{ lat: 999 }] }),
        { authorization: 'Bearer jeton-valide' },
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      resultats: { cle: string; statut: string; motif?: string }[];
    };
    expect(body.resultats).toEqual([
      { cle: '', statut: 'rejeté', motif: 'position invalide' },
    ]);
  });

  it(`lot de ${SYNC_POSITION_MAX_LOT + 1} : 413 tracking.lot_trop_grand (Bearer déjà vérifié, sync non appelée)`, async () => {
    const positions = Array.from({ length: SYNC_POSITION_MAX_LOT + 1 }, (_, index) =>
      positionValide({ capteA: new Date(Date.UTC(2027, 4, 16, 7, 5, index)).toISOString() }),
    );
    const response = await syncRoute(
      requete(JSON.stringify({ appareilId: 'app-client-1', positions }), {
        authorization: 'Bearer jeton-valide',
      }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('tracking.lot_trop_grand');
    expect(trackingServiceMock.verifierJetonAppareil).toHaveBeenCalledWith('jeton-valide');
    expect(trackingServiceMock.synchroniserLotPositions).not.toHaveBeenCalled();
  });

  it(`lot de ${SYNC_POSITION_MAX_LOT} exactement : passe (la borne est INCLUSIVE)`, async () => {
    const positions = Array.from({ length: SYNC_POSITION_MAX_LOT }, (_, index) =>
      positionValide({ capteA: new Date(Date.UTC(2027, 4, 16, 7, 5, index)).toISOString() }),
    );
    const response = await syncRoute(
      requete(JSON.stringify({ appareilId: 'app-client-1', positions }), {
        authorization: 'Bearer jeton-valide',
      }),
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /api/coureur/tracking/sync — réponse nominale', () => {
  it('200 : { resultats, compteurs, recuA } no-store, appareil résolu par Bearer', async () => {
    trackingServiceMock.synchroniserLotPositions.mockResolvedValue({
      resultats: [
        { cle: 'position:v1:app-client-1:2027-05-16T07:05:09.000Z', statut: 'accepté' },
        { cle: 'position:v1:app-client-1:2027-05-16T07:12:09.000Z', statut: 'déjà-connu' },
      ],
      compteurs: { acceptes: 1, dejaConnus: 1, rejetes: 0 },
      recuA: '2027-05-16T07:13:00.000Z',
    });
    const positions = [
      positionValide({ capteA: '2027-05-16T07:05:09.000Z' }),
      positionValide({ capteA: '2027-05-16T07:12:09.000Z' }),
    ];
    const corps = { appareilId: 'app-client-1', positions };
    const response = await syncRoute(
      requete(JSON.stringify(corps), { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      resultats: unknown[];
      compteurs: Record<string, number>;
      recuA: string;
    };
    expect(body.resultats).toHaveLength(2);
    expect(body.compteurs).toEqual({ acceptes: 1, dejaConnus: 1, rejetes: 0 });
    expect(body.recuA).toBe('2027-05-16T07:13:00.000Z');
    expect(trackingServiceMock.verifierJetonAppareil).toHaveBeenCalledWith('jeton-valide');
    expect(trackingServiceMock.synchroniserLotPositions).toHaveBeenCalledWith(APPAREIL_AUTH, corps);
  });
});
