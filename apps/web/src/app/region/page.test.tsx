import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const contenusServiceMock = vi.hoisted(() => ({
  getRegionPage: vi.fn(),
  REGION_PAGE_VIDE: { blocs: [] },
}));

vi.mock(
  '@/modules/contenus/service',
  () =>
    contenusServiceMock as unknown as typeof import('@/modules/contenus/service'),
);

import RegionPage, { dynamic as REGION_DYNAMIC } from './page';

const BLOCS = [
  {
    slug: 'region',
    titre: 'Aït Aïssi et la forêt de Yakouren',
    corps: 'Le village d’Aït Aïssi se situe dans la commune de Yakouren.',
  },
  {
    slug: 'hebergement',
    titre: 'Hébergement',
    corps: 'Liste à confirmer par le comité.',
  },
  {
    slug: 'restauration',
    titre: 'Restauration',
    corps: 'Restauration au village du stade.',
  },
  {
    slug: 'annexes',
    titre: 'Événements annexes',
    corps: 'Course Kids et animations au village.',
  },
  {
    slug: 'consignes-securite',
    titre: 'Consignes de sécurité',
    corps:
      'Ne défiez pas la montagne : préparez votre course.\n\nLes singes sacrés du Jurjura sont des animaux sauvages : ne les nourrissez pas.<img src=x onerror="alert(1)">',
  },
];

async function rendu(blocs = BLOCS): Promise<string> {
  contenusServiceMock.getRegionPage.mockResolvedValue({ blocs });
  const flux = await renderToReadableStream(<RegionPage />);
  return await new Response(flux).text();
}

describe('page /region — rendu public', () => {
  let html = '';

  beforeAll(async () => {
    html = await rendu();
  });

  it('dynamique : les contenus sont relus à chaque requête (force-dynamic épinglé)', () => {
    // Supprimer l'export `dynamic` (retour au statique) casserait le
    // « reflété au rechargement » : ce test devient rouge.
    expect(REGION_DYNAMIC).toBe('force-dynamic');
  });

  it('titre de page et sections dans l’ordre région → consignes', () => {
    expect(html).toContain('id="titre-region"');
    const titres = [
      'Aït Aïssi et la forêt de Yakouren',
      'Hébergement',
      'Restauration',
      'Événements annexes',
      'Consignes de sécurité',
    ];
    let precedent = html.indexOf('id="titre-region"');
    for (const titre of titres) {
      const position = html.indexOf(titre);
      expect(position).toBeGreaterThan(-1);
      expect(position).toBeGreaterThan(precedent);
      precedent = position;
    }
  });

  it('consignes : montagne et singes sacrés du Jurjura présents', () => {
    expect(html).toContain('Ne défiez pas la montagne');
    expect(html).toContain('singes sacrés du Jurjura');
  });

  it('corps échappé : aucune balise HTML du contenu n’est exécutée', () => {
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<img src=x');
  });

  it('liens croisés vers /parcours et l’accueil', () => {
    expect(html).toContain('href="/parcours"');
    expect(html).toContain('href="/"');
  });

  it('aucune citation kabyle sur la page région (réservée aux ravitaillements)', () => {
    expect(html).not.toContain('Aman d laman');
  });
});

describe('page /region — blocs manquants', () => {
  it('seuls les blocs présents sont rendus, aucune section vide', async () => {
    const partiel = await rendu([BLOCS[0]!, BLOCS[4]!]);
    expect(partiel).toContain('Aït Aïssi et la forêt de Yakouren');
    expect(partiel).toContain('Consignes de sécurité');
    expect(partiel).not.toContain('Hébergement');
  });

  it('sans aucun bloc : coquille statique rendue', async () => {
    const vide = await rendu([]);
    expect(vide).toContain('id="titre-region"');
    expect(vide).not.toContain('aa-region-section"');
  });
});
