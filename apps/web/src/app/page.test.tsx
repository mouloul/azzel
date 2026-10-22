import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { BandeauEgide, EGIDE_TEXTE } from '@/components/bandeau-egide';

// L’accueil lit la section partenaires en base (dynamique, story 2.3) : le
// composant est asynchrone — rendu via renderToReadableStream (l’API statique
// synchro ne supporte pas les composants asynchrones). Cette lecture est
// isolée par mock ; chaque mode a sa suite dédiée dans
// section-partenaires.test.tsx.
const sponsorsServiceMock = vi.hoisted(() => ({
  getPartenairesSection: vi.fn(),
}));

vi.mock(
  '@/modules/sponsors/service',
  () =>
    sponsorsServiceMock as unknown as typeof import('@/modules/sponsors/service'),
);

import HomePage from './page';

let HTML_ACCUEIL = '';

beforeAll(async () => {
  sponsorsServiceMock.getPartenairesSection.mockResolvedValue(null);
  HTML_ACCUEIL = await renduAccueil();
});

async function renduAccueil(): Promise<string> {
  const flux = await renderToReadableStream(
    <>
      <BandeauEgide />
      <HomePage />
    </>,
  );
  return await new Response(flux).text();
}

describe('accueil vitrine — rendu statique', () => {
  it('affiche le bandeau égide (texte exact, capitales espacées)', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain(EGIDE_TEXTE);
    expect(EGIDE_TEXTE).toBe('Sous l’égide de la Fédération et du ministère des Sports');
    expect(html).toContain('class="egide"');
  });

  it('hero : eyebrow édition, titre, lieu, CTA S’inscrire vers /connexion', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('2ᵉ édition — 26 mars 2027');
    expect(html).toContain('Week-end Sportif');
    expect(html).toContain('Aït Aïssi');
    expect(html).toContain('stade Agni Lhoudh');
    expect(html).toContain('Yakouren');
    expect(html).toContain('href="/connexion"');
    expect(html).toContain('S’inscrire');
  });

  it('hero : photo eager + fetchpriority high (LCP), dimensions alignées sur la variante 640', () => {
    const html = HTML_ACCUEIL;
    const hero = html.match(/<img[^>]*data-hero-photo[^>]*>/)?.[0] ?? '';
    expect(hero).not.toBe('');
    expect(hero).toContain('loading="eager"');
    expect(hero).toMatch(/fetchpriority="high"/i);
    expect(hero).toContain('width="640"');
    expect(hero).toContain('height="360"');
    expect(hero).toContain(
      'src="/charte/photos-2026/aitaissi-2026-celebration-montagne-640.webp"',
    );
  });

  it('hero : art direction <picture> — 1280 réservé aux écrans ≥ 700 px, pas de srcset mobile', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('media="(min-width: 700px)"');
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-celebration-montagne-1280\.webp"/i,
    );
    expect(html).not.toContain('montagne-640.webp 640w');
    expect(html).not.toContain('montagne-1280.webp 1280w');
  });

  it('chiffres officiels 2026 exacts, jamais additionnés ni inventés', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('>279<');
    expect(html).toContain('>222<');
    expect(html).toContain('>214<');
    expect(html).toContain('>116<');
    expect(html).toContain('dont 36 femmes');
    expect(html).toContain('Chiffres officiels de l’édition 2026');
  });

  it('épreuves 2027 : trail long 35 km et trail moyen 12 km', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('Trail long — 35 km');
    expect(html).toContain('Trail moyen — 12 km');
    expect(html).toContain('Épreuve phare');
  });

  it('contact : bouton Appeler l’équipe (tel:) présent dans le hero et la section contact', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('Appeler l’équipe');
    expect(html.match(/Appeler l’équipe/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/href="tel:\+213/);
  });

  it('photos de section : lazy + fetchpriority low, alts descriptifs, 1280 via <picture>', () => {
    const html = HTML_ACCUEIL;
    const gallery = html.match(
      /<img[^>]*(ligne-depart|arrivee-groupe-medailles)[^>]*>/g,
    );
    expect(gallery?.length).toBe(2);
    for (const img of gallery ?? []) {
      expect(img).toContain('loading="lazy"');
      expect(img).toMatch(/fetchpriority="low"/i);
      expect(img).not.toMatch(/srcset/i);
    }
    expect(html).toMatch(/alt="[^"]*ligne de départ[^"]*2026"/i);
    expect(html).toMatch(/alt="[^"]*arrivée[^"]*2026"/i);
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-ligne-depart-1280\.webp"/i,
    );
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-arrivee-groupe-medailles-1280\.webp"/i,
    );
  });

  it('aucune mention interdite : « à confirmer », objectif 2027 chiffré', () => {
    const html = HTML_ACCUEIL.toLowerCase();
    expect(html).not.toContain('à confirmer');
    expect(html).not.toContain('objectif');
    expect(html).not.toContain('>600<');
  });
});

describe('accueil vitrine — section partenaires rendue (story 2.3)', () => {
  it('mode B : titre de section et nom du sponsor présents dans le HTML de l’accueil', async () => {
    sponsorsServiceMock.getPartenairesSection.mockResolvedValueOnce({
      mode: 'B',
      signature: null,
      sponsors: [{ id: 's1', nom: 'Ifri', url: null, logoUrl: null }],
    });
    const html = await renduAccueil();
    expect(html).toContain('id="titre-partenaires"');
    expect(html).toContain('Ils soutiennent le week-end');
    expect(html).toContain('Ifri');
    expect(html).toContain('aa-partenaire');
  });
});

describe('accueil vitrine — identité village (story 2.2)', () => {
  it('piliers : quatre glyphes SVG inline et libellés exacts', () => {
    const html = HTML_ACCUEIL;
    const glyphes = html.match(/<svg[^>]*data-glyphe="([^"]+)"[^>]*>/g) ?? [];
    expect(glyphes.length).toBe(4);
    // Correspondance piliers ↔ glyphes (noms kabyles sources) :
    // Sport → yaz ⵣ, Santé → tala (la fontaine), Citoyenneté → tabzimt (la fibule), Écologie → ingel (le cèdre).
    const noms = glyphes
      .map((g) => g.match(/data-glyphe="([^"]+)"/)?.[1] ?? '')
      .sort();
    expect(noms).toEqual(['ingel', 'tabzimt', 'tala', 'yaz']);
    const titres = (html.match(/class="aa-pilier__titre">([^<]+)</g) ?? []).map((t) =>
      t.replace(/^.*?>/, '').replace(/<$/, ''),
    );
    expect(new Set(titres)).toEqual(new Set(['Sport', 'Santé', 'Citoyenneté', 'Écologie']));
  });

  it('piliers : cartes sobres avec glyphe + titre + ligne concrète, jamais de glyphe seul', () => {
    const html = HTML_ACCUEIL;
    expect((html.match(/<article class="aa-card aa-pilier"/g) ?? []).length).toBe(4);
    expect(html).toContain('stade Agni Lhoudh');
    expect(html).toContain('116 enfants');
    expect(html).toContain('village d’Aït Aïssi');
    expect(html).toContain('forêt de Yakouren');
  });

  it('glyphes : monochromes currentColor, trait sans remplissage, 20–24 px', () => {
    const html = HTML_ACCUEIL;
    const blocs = html.match(/<svg[^>]*data-glyphe[^>]*>.*?<\/svg>/g) ?? [];
    expect(blocs.length).toBe(4);
    for (const bloc of blocs) {
      expect(bloc).toContain('stroke="currentColor"');
      expect(bloc).toContain('fill="none"');
      expect(bloc).not.toMatch(/fill="(?!none)/);
      expect(bloc).toMatch(/width="2[0-4]"/);
      expect(bloc).toMatch(/height="2[0-4]"/);
    }
  });

  it('frise : présente en tête et pied de la vitrine, aria-hidden, jamais dans le contenu', () => {
    const html = HTML_ACCUEIL;
    const frises = html.match(/<svg[^>]*data-frise[^>]*>/g) ?? [];
    expect(frises.length).toBe(2);
    for (const frise of frises) {
      expect(frise).toContain('aria-hidden="true"');
    }
    const premiere = html.indexOf('data-frise');
    const derniere = html.lastIndexOf('data-frise');
    expect(premiere).toBeGreaterThan(-1);
    expect(premiere).toBeLessThan(html.indexOf('aa-hero'));
    expect(derniere).toBeGreaterThan(html.indexOf('id="titre-contact"'));
  });

  it('crête : ligne ocre 1,5 px sous le titre du hero, aria-hidden', () => {
    const html = HTML_ACCUEIL;
    const crete = html.match(/<svg[^>]*data-crete[^>]*>/)?.[0] ?? '';
    expect(crete).not.toBe('');
    expect(crete).toContain('aria-hidden="true"');
    expect(crete).toContain('stroke-width="1.5"');
    expect((html.match(/data-crete/g) ?? []).length).toBe(1);
    expect(html.indexOf('data-crete')).toBeGreaterThan(html.indexOf('aa-hero__title'));
    expect(html.indexOf('data-crete')).toBeLessThan(html.indexOf('aa-hero__meta'));
  });

  it('interdits : aucun « Tafsut », médaillon, mascotte ni drapeau', () => {
    const html = HTML_ACCUEIL.toLowerCase();
    expect(html).not.toContain('tafsut');
    expect(html).not.toContain('médaillon');
    expect(html).not.toContain('medaillon');
    expect(html).not.toContain('mascotte');
    expect(html).not.toContain('drapeau');
  });
});
