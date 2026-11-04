import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// M12 (revue épopée 10) — l'adoption socle-chip du manager retour-images
// est épinglée par un rendu SSR (pattern volontaires-manager.test.tsx) :
// retour-images.css ne porte plus que la marge, une régression markup
// serait invisible sans ce garde.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
}));

import { RetourImagesManager } from './retour-images-manager';
import type { TemoignageSummary } from '@/modules/retour-images/service';

const TEMOIGNAGES: TemoignageSummary[] = [
  {
    id: 'temoignage-1',
    citation: 'Une journée inoubliable.',
    prenom: 'Amina',
    editionReference: 'Édition 2026',
    ordre: 2,
    createdAt: '2027-01-07T08:00:00.000Z',
  },
];

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(
    <RetourImagesManager trailerUrl={null} temoignages={TEMOIGNAGES} />,
  );
  return await new Response(flux).text();
}

describe('RetourImagesManager — chips du socle (story 10.3, épinglage M12)', () => {
  it('chaque témoignage porte sa chip d’ordre socle-chip + numéro', async () => {
    const html = await rendu();
    expect(html).toContain('socle-chip');
    expect(html).toMatch(/Ordre (<!-- -->)?2/);
    expect(html.match(/class="socle-chip"/g)).toHaveLength(TEMOIGNAGES.length);
  });

  it('prénom et citation restent portés (la chip ne porte pas seule)', async () => {
    const html = await rendu();
    expect(html).toContain('Amina');
    expect(html).toContain('Une journée inoubliable.');
  });
});
