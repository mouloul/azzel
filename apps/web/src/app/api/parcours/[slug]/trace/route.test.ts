import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { getParcoursDoc } from '@/modules/contenus/parcours/lecture';

import { GET } from './route';

function appeler(slug: string, requete = '') {
  return GET(new NextRequest(`http://localhost:3000/api/parcours/${slug}/trace${requete}`), {
    params: Promise.resolve({ slug }),
  });
}

describe('GET /api/parcours/[slug]/trace — tracé servi à la carte, à la demande', () => {
  it('épreuve publiée : tracé, distances alignées et repères', async () => {
    const reponse = await appeler('longue');
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as {
      trace: { points: number[][]; distancesM: number[] };
      reperes: { id: string; nom: string; lon: number; lat: number; libelle: string }[];
    };
    expect(corps.trace.points.length).toBeGreaterThan(10);
    expect(corps.trace.distancesM).toHaveLength(corps.trace.points.length);
    expect(Array.isArray(corps.reperes)).toBe(true);
    // Chaque point : [lon, lat, altitude] — le contrat de la carte.
    expect(corps.trace.points[0]).toHaveLength(3);
  });

  it('version demandée = version publiée : cache immuable, le tracé est gelé par version', async () => {
    const version = String(getParcoursDoc()?.version);
    const reponse = await appeler('longue', `?v=${version}`);
    expect(reponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('sans version, ou avec une AUTRE version : cache court — une vieille URL ne fige pas le tracé', async () => {
    // Si une publication change le tracé, un navigateur qui a gardé l'ancienne
    // URL « immuable » afficherait l'ancien parcours pendant un an. Seule une
    // URL qui nomme la version COURANTE a droit à l'immuable.
    for (const requete of ['', '?v=0', '?v=999', '?v=abc']) {
      const reponse = await appeler('longue', requete);
      expect(reponse.status).toBe(200);
      expect(reponse.headers.get('cache-control'), requete).toMatch(/max-age=300$/);
      expect(reponse.headers.get('cache-control'), requete).not.toMatch(/immutable/);
    }
  });

  it('expose la version publiée, pour que la page la mette dans l’URL', async () => {
    const corps = (await (await appeler('longue')).json()) as { version: number };
    expect(corps.version).toBe(getParcoursDoc()?.version);
  });

  it('épreuve inconnue : 404 sans cache — une absence ne doit pas rester en mémoire', async () => {
    const reponse = await appeler('inexistante');
    expect(reponse.status).toBe(404);
    expect(reponse.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['constructor', '__proto__', '..%2Fsecret', 'a'.repeat(200)])(
    'slug hostile « %s » : 404, jamais une erreur serveur',
    async (slug) => {
      const reponse = await appeler(slug);
      expect(reponse.status).toBe(404);
    },
  );
});
