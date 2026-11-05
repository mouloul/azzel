import { describe, expect, it, vi } from 'vitest';

import { TraceIndisponibleError, chargerTrace, urlTrace } from './trace-client';

const CORPS = {
  trace: {
    points: [
      [4.1, 36.7, 677],
      [4.2, 36.71, 700],
    ],
    distancesM: [0, 1500],
  },
  reperes: [{ id: 'depart', nom: 'Départ', lon: 4.1, lat: 36.7, libelle: 'Départ · km 0' }],
  version: 2,
};

function reponse(corps: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => corps,
  } as unknown as Response;
}

describe('urlTrace — la version est dans l’URL', () => {
  it('nomme le slug et la version, pour que l’URL change quand le tracé change', () => {
    expect(urlTrace('longue', 2)).toBe('/api/parcours/longue/trace?v=2');
  });

  it('encode le slug : il ne doit pas pouvoir sortir du chemin', () => {
    expect(urlTrace('a/../b', 2)).toBe('/api/parcours/a%2F..%2Fb/trace?v=2');
  });
});

describe('chargerTrace', () => {
  it('rend le tracé et les repères du serveur', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse(CORPS));
    const donnees = await chargerTrace('longue', 2, fetchSimule);
    expect(fetchSimule).toHaveBeenCalledWith('/api/parcours/longue/trace?v=2');
    expect(donnees.trace.points).toHaveLength(2);
    expect(donnees.trace.distancesM).toEqual([0, 1500]);
    expect(donnees.reperes[0]?.nom).toBe('Départ');
  });

  it('les distances curvilignes sont conservées : le curseur partagé en dépend', async () => {
    const donnees = await chargerTrace('longue', 2, vi.fn().mockResolvedValue(reponse(CORPS)));
    expect(donnees.trace.distancesM).toHaveLength(donnees.trace.points.length);
  });

  it('réponse non-OK : erreur nommée, pour afficher « carte indisponible »', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse({}, { ok: false, status: 404 }));
    await expect(chargerTrace('longue', 2, fetchSimule)).rejects.toBeInstanceOf(
      TraceIndisponibleError,
    );
  });

  it('réseau coupé : même erreur nommée', async () => {
    const fetchSimule = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(chargerTrace('longue', 2, fetchSimule)).rejects.toBeInstanceOf(
      TraceIndisponibleError,
    );
  });

  it.each([
    ['corps vide', {}],
    ['points absents', { trace: { distancesM: [] }, reperes: [] }],
    ['distances de longueur différente', { trace: { points: [[1, 2, 3]], distancesM: [] }, reperes: [] }],
    ['point incomplet', { trace: { points: [[1, 2]], distancesM: [0] }, reperes: [] }],
    ['tracé vide', { trace: { points: [], distancesM: [] }, reperes: [] }],
    ['valeur non numérique', { trace: { points: [[1, 'x', 3]], distancesM: [0] }, reperes: [] }],
  ])('JSON mal formé (%s) : refusé, jamais passé à la carte', async (_nom, corps) => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse(corps));
    await expect(chargerTrace('longue', 2, fetchSimule)).rejects.toBeInstanceOf(
      TraceIndisponibleError,
    );
  });

  it('repères absents ou invalides : la carte s’ouvre quand même, sans pastilles', async () => {
    const corps = { ...CORPS, reperes: 'pas un tableau' };
    const donnees = await chargerTrace('longue', 2, vi.fn().mockResolvedValue(reponse(corps)));
    expect(donnees.reperes).toEqual([]);
  });
});
