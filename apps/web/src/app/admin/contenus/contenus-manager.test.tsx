import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// M12 (revue épopée 10) — l'adoption socle-chip du manager contenus est
// épinglée par un rendu SSR (pattern volontaires-manager.test.tsx) : l'ancien
// CSS local a été supprimé, une régression markup rendrait la chip sans
// style sans faire échouer la suite.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
}));

import { ContenusManager } from './contenus-manager';
import type { ContenuBlocAdmin } from '@/modules/contenus/service';

const BLOCS: ContenuBlocAdmin[] = [
  {
    slug: 'region',
    titre: 'La région',
    corps: 'Presentation de la region.',
    updatedAt: '2027-01-02T08:00:00.000Z',
    aConfirmer: true,
    epreuve: null,
  },
  {
    slug: 'hebergement',
    titre: 'Hébergement',
    corps: 'Ou dormir.',
    updatedAt: '2027-01-03T08:00:00.000Z',
    aConfirmer: false,
    epreuve: null,
  },
];

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<ContenusManager blocs={BLOCS} />);
  return await new Response(flux).text();
}

describe('ContenusManager — chips du socle (story 10.3, épinglage M12)', () => {
  it('bloc à confirmer : chip socle-chip + libellé intégral, EXACTEMENT une', async () => {
    const html = await rendu();
    expect(html).toContain('socle-chip');
    expect(html).toContain('À confirmer par le comité');
    expect(html.match(/class="socle-chip"/g)).toHaveLength(1);
  });

  it('les libellés des blocs restent portés (jamais la chip seule)', async () => {
    const html = await rendu();
    expect(html).toContain('La région');
    expect(html).toContain('Hébergement');
  });
});
