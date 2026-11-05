import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// M12 (revue épopée 10) — l'adoption socle-chip du manager sponsors est
// épinglée par un rendu SSR (pattern volontaires-manager.test.tsx) :
// sponsors.css ne porte plus que la marge, une régression markup serait
// invisible sans ce garde.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
}));

import { SponsorsManager } from './sponsors-manager';
import type { SponsorSummary } from '@/modules/sponsors/service';

const SPONSORS: SponsorSummary[] = [
  {
    id: 'sponsor-1',
    nom: 'Algérie Télécom',
    url: 'https://exemple.dz',
    logoUrl: null,
    signature: true,
    createdAt: '2027-01-05T08:00:00.000Z',
  },
  {
    id: 'sponsor-2',
    nom: 'Trousse et Cie',
    url: null,
    logoUrl: null,
    signature: false,
    createdAt: '2027-01-06T08:00:00.000Z',
  },
];

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<SponsorsManager mode="A" sponsors={SPONSORS} />);
  return await new Response(flux).text();
}

describe('SponsorsManager — chips du socle (story 10.3, épinglage M12)', () => {
  it('sponsor signature en mode A : chip socle-chip + libellé, EXACTEMENT une', async () => {
    const html = await rendu();
    expect(html).toContain('socle-chip');
    expect(html).toContain('Signature');
    expect(html.match(/class="socle-chip"/g)).toHaveLength(1);
  });

  it('les deux sponsors restent listés par nom (la chip ne porte pas seule)', async () => {
    const html = await rendu();
    expect(html).toContain('Algérie Télécom');
    expect(html).toContain('Trousse et Cie');
  });
});
