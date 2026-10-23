import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getResultatsRoute } from './route';

import { DbUnavailableError } from '@/modules/iam/errors';

// Story 7.2 — tests de GET /api/resultats : lecture PUBLIQUE (aucune garde
// de session, organisation par défaut), contrat ResultatsPublic TEL QUEL,
// Cache-Control: no-store (chaque hit sert l'instant calculé), AUCUN
// comptage (seul le chargement de PAGE avec ?partage=1 compte — le polling
// ne compte JAMAIS), base KO → 503 enveloppe vitrine douce.

const chronoServiceMock = vi.hoisted(() => ({
  getResultatsPublic: vi.fn(),
  compterVisitePartage: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const RESULTATS = {
  classements: {
    genereA: '2027-03-26T10:00:05.000Z',
    fraicheur: '2027-03-26T10:00:02.000Z',
    libelle: 'Classement provisoire',
    epreuves: [
      {
        epreuveSlug: 'longue',
        epreuveNom: 'La Longue — 35 km',
        distanceKm: 35,
        heureDepart: '2027-03-26T07:00:00.000Z',
        configure: true,
        lignes: [
          { dossard: 201, rang: 1, tempsMs: 6_000_000, statut: 'arrivé', categorieAge: 'Senior' },
          { dossard: 204, rang: null, tempsMs: null, statut: 'en-course', categorieAge: 'V1' },
        ],
        abandons: [],
      },
    ],
  },
  derniersArrives: [
    { dossard: 201, epreuveSlug: 'longue', epreuveNom: 'La Longue — 35 km', tempsMs: 6_000_000 },
  ],
};

beforeEach(() => {
  chronoServiceMock.getResultatsPublic.mockReset();
  chronoServiceMock.compterVisitePartage.mockReset();
});

describe('GET /api/resultats — lecture publique (story 7.2)', () => {
  it('200 SANS session : { ok, resultats } tel quel, no-store, aucune donnée personnelle', async () => {
    chronoServiceMock.getResultatsPublic.mockResolvedValue(RESULTATS);
    const response = await getResultatsRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { ok: boolean; resultats: typeof RESULTATS };
    expect(body.ok).toBe(true);
    expect(body.resultats.classements.libelle).toBe('Classement provisoire');
    expect(body.resultats.derniersArrives).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/jeton|prenom|first_name|email/i);
  });

  it('AUCUN comptage : le polling ne compte JAMAIS (service de comptage non appelé)', async () => {
    chronoServiceMock.getResultatsPublic.mockResolvedValue(RESULTATS);
    await getResultatsRoute();
    expect(chronoServiceMock.compterVisitePartage).not.toHaveBeenCalled();
  });

  it('base indisponible : 503 enveloppe vitrine.resultats.db_unavailable douce, no-store', async () => {
    chronoServiceMock.getResultatsPublic.mockRejectedValue(new DbUnavailableError());
    const response = await getResultatsRoute();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { error: { code: string; action: string } };
    expect(body.error.code).toBe('vitrine.resultats.db_unavailable');
    expect(body.error.action).toMatch(/Réessayez/);
  });

  it('erreur inconnue : 500 douce sans détail technique', async () => {
    chronoServiceMock.getResultatsPublic.mockRejectedValue(new Error('stack interne'));
    const response = await getResultatsRoute();
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('vitrine.resultats.erreur_inconnue');
  });
});
