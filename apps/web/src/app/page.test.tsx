import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BandeauEgide, EGIDE_TEXTE } from '@/components/bandeau-egide';

import HomePage from './page';

function renduAccueil(): string {
  return renderToStaticMarkup(
    <>
      <BandeauEgide />
      <HomePage />
    </>,
  );
}

describe('accueil vitrine — rendu statique', () => {
  it('affiche le bandeau égide (texte exact, capitales espacées)', () => {
    const html = renduAccueil();
    expect(html).toContain(EGIDE_TEXTE);
    expect(EGIDE_TEXTE).toBe('Sous l’égide de la Fédération et du ministère des Sports');
    expect(html).toContain('class="egide"');
  });

  it('hero : eyebrow édition, titre, lieu, CTA S’inscrire vers /connexion', () => {
    const html = renduAccueil();
    expect(html).toContain('2ᵉ édition — 26 mars 2027');
    expect(html).toContain('Week-end Sportif');
    expect(html).toContain('Aït Aïssi');
    expect(html).toContain('stade Agni Lhoudh');
    expect(html).toContain('Yakouren');
    expect(html).toContain('href="/connexion"');
    expect(html).toContain('S’inscrire');
  });

  it('hero : photo eager + fetchpriority high (LCP), dimensions alignées sur la variante 640', () => {
    const html = renduAccueil();
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
    const html = renduAccueil();
    expect(html).toContain('media="(min-width: 700px)"');
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-celebration-montagne-1280\.webp"/i,
    );
    expect(html).not.toContain('montagne-640.webp 640w');
    expect(html).not.toContain('montagne-1280.webp 1280w');
  });

  it('chiffres officiels 2026 exacts, jamais additionnés ni inventés', () => {
    const html = renduAccueil();
    expect(html).toContain('>279<');
    expect(html).toContain('>222<');
    expect(html).toContain('>214<');
    expect(html).toContain('>116<');
    expect(html).toContain('dont 36 femmes');
    expect(html).toContain('Chiffres officiels de l’édition 2026');
  });

  it('épreuves 2027 : trail long 35 km et trail moyen 12 km', () => {
    const html = renduAccueil();
    expect(html).toContain('Trail long — 35 km');
    expect(html).toContain('Trail moyen — 12 km');
    expect(html).toContain('Épreuve phare');
  });

  it('contact : bouton Appeler l’équipe (tel:) présent dans le hero et la section contact', () => {
    const html = renduAccueil();
    expect(html).toContain('Appeler l’équipe');
    expect(html.match(/Appeler l’équipe/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/href="tel:\+213/);
  });

  it('photos de section : lazy + fetchpriority low, alts descriptifs, 1280 via <picture>', () => {
    const html = renduAccueil();
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
    const html = renduAccueil().toLowerCase();
    expect(html).not.toContain('à confirmer');
    expect(html).not.toContain('objectif');
    expect(html).not.toContain('>600<');
  });
});
