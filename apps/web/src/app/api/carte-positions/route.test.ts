import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getCartePositionsRoute } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 7.3 — tests de GET /api/carte-positions : lecture PUBLIQUE (aucune
// session, organisation par défaut), contrat { ok, positions, genereA } TEL
// QUEL, no-store, ANONYMAT strict (aucune donnée personnelle ne traverse —
// dossard + épreuve + position horodatée seulement), base KO → 503 enveloppe
// vitrine.carte.* douce.

const carteServiceMock = vi.hoisted(() => ({
  getPositionsPubliques: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/carte',
  () => carteServiceMock as unknown as typeof import('@/modules/chrono/carte'),
);

const POSITIONS = {
  positions: [
    {
      dossard: 201,
      epreuveSlug: 'longue',
      epreuveNom: 'La Grande Boucle — 35 km',
      lat: 36.5512,
      lon: 4.3601,
      capteA: '2027-03-26T09:41:00.000Z',
      estompée: false,
    },
    {
      dossard: 204,
      epreuveSlug: 'longue',
      epreuveNom: 'La Grande Boucle — 35 km',
      lat: 36.5602,
      lon: 4.3711,
      capteA: '2027-03-26T08:12:00.000Z',
      estompée: true,
    },
  ],
  genereA: '2027-03-26T10:00:05.000Z',
};

beforeEach(() => {
  carteServiceMock.getPositionsPubliques.mockReset();
});

describe('GET /api/carte-positions — lecture publique (story 7.3)', () => {
  it('200 SANS session : { ok, positions, genereA } tel quel, no-store', async () => {
    carteServiceMock.getPositionsPubliques.mockResolvedValue(POSITIONS);
    const response = await getCartePositionsRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as typeof POSITIONS & { ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.genereA).toBe('2027-03-26T10:00:05.000Z');
    expect(body.positions).toHaveLength(2);
    expect(body.positions[0]).toEqual({
      dossard: 201,
      epreuveSlug: 'longue',
      epreuveNom: 'La Grande Boucle — 35 km',
      lat: 36.5512,
      lon: 4.3601,
      capteA: '2027-03-26T09:41:00.000Z',
      estompée: false,
    });
  });

  it('ANONYMAT strict : dossard/épreuve/horodatage seulement — aucun nom, contact, photo ni jeton', async () => {
    carteServiceMock.getPositionsPubliques.mockResolvedValue(POSITIONS);
    const response = await getCartePositionsRoute();
    const corps = JSON.stringify(await response.json());
    expect(corps).not.toMatch(/jeton|prenom|first_name|last_name|email|phone|photo|account/i);
  });

  it('estompée servie TELLE QUELLE (calcul serveur, jamais recalculée côté route)', async () => {
    carteServiceMock.getPositionsPubliques.mockResolvedValue(POSITIONS);
    const body = (await (await getCartePositionsRoute()).json()) as typeof POSITIONS;
    expect(body.positions[1]!.estompée).toBe(true);
    expect(body.positions[0]!.estompée).toBe(false);
  });

  it('base indisponible : 503 enveloppe vitrine.carte.db_unavailable douce, no-store', async () => {
    carteServiceMock.getPositionsPubliques.mockRejectedValue(new DbUnavailableError());
    const response = await getCartePositionsRoute();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('vitrine.carte.db_unavailable');
    expect(body.error.action).toMatch(/Réessayez/);
  });

  it('erreur inconnue : 500 douce sans détail technique', async () => {
    carteServiceMock.getPositionsPubliques.mockRejectedValue(new Error('stack interne'));
    const response = await getCartePositionsRoute();
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('vitrine.carte.erreur_inconnue');
  });
});
