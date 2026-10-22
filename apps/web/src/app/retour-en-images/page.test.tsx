import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({
  getRetourImagesPage: vi.fn(),
}));

vi.mock(
  '@/modules/retour-images/service',
  () => serviceMock as unknown as typeof import('@/modules/retour-images/service'),
);

import type { TrailerPlayer, TemoignageView } from '@/modules/retour-images/domain';

import RetourEnImagesPage, { dynamic as RETOUR_DYNAMIC } from './page';

interface PageView {
  trailer: TrailerPlayer | null;
  temoignages: TemoignageView[];
}

const TRAILER_YOUTUBE: PageView = {
  trailer: { kind: 'iframe', url: 'https://www.youtube.com/embed/AbCdEf12345' },
  temoignages: [
    {
      id: 't1',
      citation: 'Des sentiers magnifiques, une organisation impeccable.',
      prenom: 'Yacine',
      editionReference: 'Trail 2026',
      initiales: 'Y',
    },
    {
      id: 't2',
      citation: 'Vivement 2027.<img src=x onerror="alert(1)">',
      prenom: 'Nadia L.',
      editionReference: 'Course Kids 2026',
      initiales: 'NL',
    },
  ],
};

async function rendu(view: PageView): Promise<string> {
  serviceMock.getRetourImagesPage.mockResolvedValue(view);
  const flux = await renderToReadableStream(<RetourEnImagesPage />);
  return await new Response(flux).text();
}

describe('page /retour-en-images — rendu public', () => {
  let html = '';

  beforeAll(async () => {
    html = await rendu(TRAILER_YOUTUBE);
  });

  it('dynamique : la matière est relue à chaque requête (force-dynamic épinglé)', () => {
    expect(RETOUR_DYNAMIC).toBe('force-dynamic');
  });

  it('poster cliquable SANS lecteur dans le rendu initial : la vidéo ne se charge qu’au clic', () => {
    expect(html).toContain('aa-trailer__poster');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('youtube.com/embed/AbCdEf12345');
  });

  it('jamais d’autoplay, jamais de son au chargement', () => {
    expect(html).not.toMatch(/autoplay/i);
    expect(html).not.toContain('muted');
  });

  it('témoignages rendus en cartes sobres avec initiales et édition de référence', () => {
    expect(html).toContain('Ils ont couru en 2026');
    expect(html).toContain('Des sentiers magnifiques, une organisation impeccable.');
    expect(html).toContain('>Y<');
    expect(html).toContain('>NL<');
    expect(html).toContain('Trail 2026');
    expect(html).toContain('Course Kids 2026');
  });

  it('citation échappée : aucune balise HTML du contenu n’est exécutée', () => {
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<img src=x');
  });

  it('pas de carrousel : cartes statiques dans le flux', () => {
    expect(html).not.toMatch(/carousel|slick|swiper|marquee/i);
  });

  it('galerie 2026 : trois photos lazy avec alt descriptifs', () => {
    const images = html.match(/<img[^>]*>/g) ?? [];
    const galerie = images.filter((image) => image.includes('photos-2026'));
    expect(galerie.length).toBe(3);
    for (const image of galerie) {
      expect(image).toContain('loading="lazy"');
      expect(image).toMatch(/alt="[^"]*2026[^"]*"/);
    }
  });

  it('vouvoiement public, lien retour accueil', () => {
    expect(html).toContain('vous');
    expect(html).not.toMatch(/\b[Tt]u\b|\b[Tt]oi\b/);
    expect(html).toContain('href="/"');
  });
});

describe('page /retour-en-images — dégradations propres', () => {
  it('sans aucune matière : intro + galerie restent, aucun bloc vide ni « bientôt »', async () => {
    const vide = await rendu({ trailer: null, temoignages: [] });
    expect(vide).toContain('id="titre-retour-images"');
    expect(vide).toContain('id="titre-galerie"');
    expect(vide).not.toContain('aa-trailer__poster');
    expect(vide).not.toContain('id="titre-trailer"');
    expect(vide).not.toContain('id="titre-temoignages"');
    expect(vide).not.toMatch(/[Bb]ientôt/);
  });

  it('trailer direct (mp4) : poster sans lecteur, résolution native côté service', async () => {
    const direct = await rendu({
      trailer: { kind: 'video', url: 'https://media.dz/trailer.mp4' },
      temoignages: [],
    });
    expect(direct).toContain('aa-trailer__poster');
    expect(direct).not.toContain('<video');
  });
});

describe('page /retour-en-images — la lecture ne casse jamais la page', () => {
  it('service en erreur (organisation absente, bug de code) : page rendue sans matière', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      serviceMock.getRetourImagesPage.mockRejectedValue(
        new Error('Organisation « ait-aissi » absente'),
      );
      const flux = await renderToReadableStream(<RetourEnImagesPage />);
      const html = await new Response(flux).text();
      expect(html).toContain('id="titre-retour-images"');
      expect(html).toContain('id="titre-galerie"');
      expect(html).not.toContain('aa-trailer__poster');
      expect(html).not.toContain('id="titre-temoignages"');
      expect(erreur).toHaveBeenCalled();
    } finally {
      erreur.mockRestore();
    }
  });

  it('base indisponible : le service dégrade déjà en vue vide, la page rend pareil', async () => {
    serviceMock.getRetourImagesPage.mockResolvedValue({
      trailer: null,
      temoignages: [],
    });
    const flux = await renderToReadableStream(<RetourEnImagesPage />);
    const html = await new Response(flux).text();
    expect(html).toContain('id="titre-galerie"');
    expect(html).not.toContain('aa-trailer__poster');
  });
});
