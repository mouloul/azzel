import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  SYNC_TERRAIN_MAX_LOT,
  cleIdempotenceEvenement,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import { POST as syncRoute, MAX_CORPS_SYNC_OCTETS } from './route';

import {
  AppareilRevokedError,
  JetonAppareilInvalideError,
} from '@/modules/chrono/errors';

// Story 4.5 — tests de POST /api/volontaires/sync : garde DÉDIÉE par Bearer
// appareil (un cookie de session ne vaut RIEN ici — garde session ≠ sync),
// lot ≤ 200 (413 au-delà), réponse par événement + compteurs, 401 révoqué
// DÉDIÉ, enveloppes terrain volontaires.*, no-store.

const chronoServiceMock = vi.hoisted(() => ({
  verifierJetonAppareil: vi.fn(),
  synchroniserLot: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const BASE = 'http://localhost:3000/api/volontaires/sync';

const APPAREIL_AUTH = {
  id: 'appareil-uuid-1',
  organisationId: 'org-1',
  appareilClient: 'app-client-1',
};

const JETON_COUREUR = 'AbCdEfGhIjKlMnOpQrStUv';

function retraitValide(surcharge: Partial<RetraitTerrain> = {}): RetraitTerrain {
  return {
    version: RETRAIT_SCHEMA_VERSION,
    type: 'retrait',
    editionId: 'edition-1',
    jeton: JETON_COUREUR,
    horodatage: '2027-05-16T06:12:30.000Z',
    appareilId: 'app-client-1',
    ...surcharge,
  };
}

function passageValide(surcharge: Partial<PassageTerrain> = {}): PassageTerrain {
  return {
    version: PASSAGE_SCHEMA_VERSION,
    type: 'passage',
    editionId: 'edition-1',
    jeton: JETON_COUREUR,
    checkpointId: 'mission-scan-km12',
    horodatage: '2027-05-16T07:05:09.000Z',
    appareilId: 'app-client-1',
    ...surcharge,
  };
}

function surFil(evenement: RetraitTerrain | PassageTerrain) {
  return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
}

function requete(corps: string, entetes: Record<string, string> = {}): NextRequest {
  return new NextRequest(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: corps,
  });
}

beforeEach(() => {
  chronoServiceMock.verifierJetonAppareil.mockReset();
  chronoServiceMock.synchroniserLot.mockReset();
  chronoServiceMock.verifierJetonAppareil.mockResolvedValue(APPAREIL_AUTH);
  chronoServiceMock.synchroniserLot.mockResolvedValue({
    resultats: [],
    compteurs: { acceptes: 0, dejaConnus: 0, rejetes: 0 },
    recuA: '2027-05-16T07:06:00.000Z',
  });
});

describe('POST /api/volontaires/sync — garde Bearer dédiée (AD-5)', () => {
  it('sans Authorization : 401 volontaires.sync.jeton_invalide, service non appelé', async () => {
    const response = await syncRoute(requete(JSON.stringify({ evenements: [] })));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.sync.jeton_invalide');
    expect(chronoServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
  });

  it('garde session ≠ sync : un cookie de session SANS Bearer ne passe pas', async () => {
    const response = await syncRoute(
      requete(JSON.stringify({ evenements: [] }), { cookie: 'azzel_session=jeton-session' }),
    );
    expect(response.status).toBe(401);
    expect(chronoServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
  });

  it('Bearer vide ou schéma étranger : 401 aussi', async () => {
    for (const entete of ['Bearer ', 'Basic xyz', 'Bearer\tavec-tab']) {
      const response = await syncRoute(
        requete(JSON.stringify({ evenements: [] }), { authorization: entete }),
      );
      expect(response.status, entete).toBe(401);
    }
  });

  it('Bearer révoqué : 401 DÉDIÉ volontaires.sync.appareil_revoked', async () => {
    chronoServiceMock.verifierJetonAppareil.mockRejectedValue(new AppareilRevokedError());
    const response = await syncRoute(
      requete(JSON.stringify({ evenements: [] }), { authorization: 'Bearer jeton-revoque' }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('volontaires.sync.appareil_revoked');
    expect(body.error.action).toContain('Appelle le PC');
    expect(chronoServiceMock.synchroniserLot).not.toHaveBeenCalled();
  });

  it('Bearer inconnu : 401 volontaires.sync.jeton_invalide', async () => {
    chronoServiceMock.verifierJetonAppareil.mockRejectedValue(new JetonAppareilInvalideError());
    const response = await syncRoute(
      requete(JSON.stringify({ evenements: [] }), { authorization: 'Bearer jeton-inconnu' }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.sync.jeton_invalide');
  });
});

describe('POST /api/volontaires/sync — corps du lot', () => {
  it('JSON illisible : 400 volontaires.sync.corps_invalide', async () => {
    const response = await syncRoute(
      requete('{pas-du-json', { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.sync.corps_invalide');
  });

  it('événement à clé forgée : PAS un 400 — rejeté « contrat invalide » PAR ÉVÉNEMENT (la file ne se bloque jamais)', async () => {
    chronoServiceMock.synchroniserLot.mockResolvedValue({
      resultats: [{ cle: 'forgée', statut: 'rejeté', motif: 'contrat invalide' }],
      compteurs: { acceptes: 0, dejaConnus: 0, rejetes: 1 },
      recuA: '2027-05-16T07:06:00.000Z',
    });
    const evenement = { ...retraitValide(), cle: 'forgée' };
    const response = await syncRoute(
      requete(JSON.stringify({ evenements: [evenement] }), { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      resultats: { cle: string; statut: string; motif?: string }[];
    };
    expect(body.resultats).toEqual([
      { cle: 'forgée', statut: 'rejeté', motif: 'contrat invalide' },
    ]);
  });

  it(`lot de ${SYNC_TERRAIN_MAX_LOT + 1} : 413 volontaires.sync.lot_trop_grand`, async () => {
    const evenements = Array.from({ length: SYNC_TERRAIN_MAX_LOT + 1 }, (_, index) =>
      surFil(passageValide({ checkpointId: `mission-scan-${index}` })),
    );
    const response = await syncRoute(
      requete(JSON.stringify({ evenements }), { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.sync.lot_trop_grand');
    expect(chronoServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
    expect(chronoServiceMock.synchroniserLot).not.toHaveBeenCalled();
  });

  it(`lot de ${SYNC_TERRAIN_MAX_LOT} exactement : passe (la borne est INCLUSIVE)`, async () => {
    const evenements = Array.from({ length: SYNC_TERRAIN_MAX_LOT }, (_, index) =>
      surFil(passageValide({ checkpointId: `mission-scan-${index}` })),
    );
    const response = await syncRoute(
      requete(JSON.stringify({ evenements }), { authorization: 'Bearer jeton-valide' }),
    );
    expect(response.status).toBe(200);
  });

  it(`Content-Length > ${MAX_CORPS_SYNC_OCTETS} : 413 AVANT request.json() (défense DoS)`, async () => {
    const response = await syncRoute(
      new NextRequest(BASE, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer jeton-valide',
          'content-length': String(MAX_CORPS_SYNC_OCTETS + 1),
        },
        body: '{ "evenements": [], "remplissage": "peu importe — jamais lu" }',
      }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('volontaires.sync.corps_trop_grand');
    // Le corps n'a jamais été parsé : le service n'a rien reçu.
    expect(chronoServiceMock.verifierJetonAppareil).not.toHaveBeenCalled();
    expect(chronoServiceMock.synchroniserLot).not.toHaveBeenCalled();
  });
});

describe('POST /api/volontaires/sync — réponse nominale', () => {
  it('200 : { resultats, compteurs, recuA } no-store, appareil résolu par Bearer', async () => {
    chronoServiceMock.synchroniserLot.mockResolvedValue({
      resultats: [
        { cle: 'retrait:v1:app:ed:j', statut: 'accepté' },
        { cle: 'passage:v1:app:ed:j:cp', statut: 'déjà-connu' },
      ],
      compteurs: { acceptes: 1, dejaConnus: 1, rejetes: 0 },
      recuA: '2027-05-16T07:06:00.000Z',
    });
    const evenements = [surFil(retraitValide()), surFil(passageValide())];
    const response = await syncRoute(
      requete(JSON.stringify({ evenements }), { authorization: 'Bearer jeton-valide' }),
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
    expect(body.recuA).toBe('2027-05-16T07:06:00.000Z');
    expect(chronoServiceMock.verifierJetonAppareil).toHaveBeenCalledWith('jeton-valide');
    expect(chronoServiceMock.synchroniserLot).toHaveBeenCalledWith(APPAREIL_AUTH, {
      evenements,
    });
  });
});
