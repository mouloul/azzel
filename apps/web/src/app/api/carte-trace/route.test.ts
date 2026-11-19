import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getCarteTraceRoute } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 7.3 — tests de GET /api/carte-trace : lecture PUBLIQUE des tracés
// DÉJÀ RÉDUITS côté serveur (le GPX brut ne traverse jamais), { ok, traces }
// no-store, échec GPX ISOLÉ par épreuve (trace absente, pas d'erreur), base
// KO → 503 enveloppe vitrine.carte.* douce.

const carteServiceMock = vi.hoisted(() => ({
  getTracesPubliques: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/carte',
  () => carteServiceMock as unknown as typeof import('@/modules/chrono/carte'),
);

const TRACES = {
  traces: [
    {
      epreuveSlug: 'longue',
      epreuveNom: 'La Grande Boucle — 35 km',
      points: [
        { lat: 36.5512, lon: 4.3601 },
        { lat: 36.5602, lon: 4.3711 },
      ],
    },
  ],
};

beforeEach(() => {
  carteServiceMock.getTracesPubliques.mockReset();
});

describe('GET /api/carte-trace — lecture publique (story 7.3)', () => {
  it('200 SANS session : { ok, traces } tel quel (points échantillonnés serveur), no-store', async () => {
    carteServiceMock.getTracesPubliques.mockResolvedValue(TRACES);
    const response = await getCarteTraceRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as typeof TRACES & { ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0]!.epreuveSlug).toBe('longue');
    expect(body.traces[0]!.points).toHaveLength(2);
  });

  it('GPX cassé côté épreuve : trace simplement ABSENTE (les autres servies, jamais d’erreur brute)', async () => {
    carteServiceMock.getTracesPubliques.mockResolvedValue({ traces: [] });
    const response = await getCarteTraceRoute();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; traces: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.traces).toEqual([]);
  });

  it('anonymat : la réponse ne porte QUE slug/nom/points d’épreuve', async () => {
    carteServiceMock.getTracesPubliques.mockResolvedValue(TRACES);
    const corps = JSON.stringify(await (await getCarteTraceRoute()).json());
    expect(corps).not.toMatch(/jeton|prenom|first_name|last_name|email|phone|photo|account/i);
  });

  it('base indisponible : 503 enveloppe vitrine.carte.db_unavailable douce, no-store', async () => {
    carteServiceMock.getTracesPubliques.mockRejectedValue(new DbUnavailableError());
    const response = await getCarteTraceRoute();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('vitrine.carte.db_unavailable');
  });

  it('erreur inconnue : 500 douce sans détail technique', async () => {
    carteServiceMock.getTracesPubliques.mockRejectedValue(new Error('détail interne'));
    const response = await getCarteTraceRoute();
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('vitrine.carte.erreur_inconnue');
  });
});
