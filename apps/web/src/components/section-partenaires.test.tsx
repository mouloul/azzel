import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SectionPartenaires } from '@/components/section-partenaires';
import type { PartenairesView, SponsorView } from '@/modules/sponsors/domain';

function sponsor(overrides: Partial<SponsorView> = {}): SponsorView {
  return { id: 's1', nom: 'Ifri', url: null, logoUrl: null, ...overrides };
}

describe('section partenaires — rendu statique par mode (story 2.3)', () => {
  it('aucun sponsor : rendu vide, aucune section, aucun titre', () => {
    expect(renderToStaticMarkup(<SectionPartenaires view={null} />)).toBe('');
    expect(renderToStaticMarkup(<SectionPartenaires view={{ mode: 'A', signature: null, sponsors: [] }} />)).toBe('');
    expect(renderToStaticMarkup(<SectionPartenaires view={{ mode: 'B', signature: null, sponsors: [] }} />)).toBe('');
  });

  it('option A : bande forêt, nom en capitales (display), mention « Partenaire signature »', () => {
    const view: PartenairesView = {
      mode: 'A',
      signature: sponsor(),
      sponsors: [sponsor()],
    };
    const html = renderToStaticMarkup(<SectionPartenaires view={view} />);
    expect(html).toContain('vitrine-bande--foret');
    expect(html).toContain('id="titre-partenaires"');
    expect(html).toContain('Ils soutiennent le week-end');
    expect(html).toContain('Partenaire signature');
    expect(html).toContain('aa-signature__nom');
    expect(html).toContain('Ifri');
    // Un seul emplacement en option A.
    expect(html).not.toContain('aa-partenaires');
  });

  it('option A + url : lien labellisé vers le site du sponsor', () => {
    const view: PartenairesView = {
      mode: 'A',
      signature: sponsor({ url: 'https://ifri.dz' }),
      sponsors: [sponsor({ url: 'https://ifri.dz' })],
    };
    const html = renderToStaticMarkup(<SectionPartenaires view={view} />);
    expect(html).toContain('href="https://ifri.dz"');
    expect(html).toContain('aria-label="Visiter le site de Ifri"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('option A + logo : <img> décorative (alt vide — nom rendu adjacemment), jamais critique', () => {
    const view: PartenairesView = {
      mode: 'A',
      signature: sponsor({ logoUrl: 'https://ifri.dz/logo.png' }),
      sponsors: [sponsor({ logoUrl: 'https://ifri.dz/logo.png' })],
    };
    const html = renderToStaticMarkup(<SectionPartenaires view={view} />);
    const img = html.match(/<img[^>]*aa-partenaire__logo[^>]*>/)?.[0] ?? '';
    expect(img).not.toBe('');
    expect(img).toContain('alt=""');
    expect(img).toContain('loading="lazy"');
    // Jamais déformé : object-fit contain via la classe.
    expect(img).toContain('width="160"');
    expect(img).toContain('height="64"');
    // Le nom reste annoncé à côté du logo décoratif.
    expect(html).toContain('Ifri');
  });

  it('option B : grille sobre d’emplacements équivalents, ordre de création', () => {
    const view: PartenairesView = {
      mode: 'B',
      signature: null,
      sponsors: [
        sponsor({ id: 's1', nom: 'Ifri' }),
        sponsor({ id: 's2', nom: 'Sonatrach' }),
        sponsor({ id: 's3', nom: 'CAA' }),
      ],
    };
    const html = renderToStaticMarkup(<SectionPartenaires view={view} />);
    expect(html).toContain('aa-partenaires');
    expect(html).not.toContain('vitrine-bande--foret');
    expect(html).not.toContain('Partenaire signature');
    const noms = html.match(/aa-partenaire__nom[^>]*>([^<]+)</g) ?? [];
    expect(noms.join('|')).toContain('Ifri');
    expect(noms.join('|')).toContain('Sonatrach');
    expect(noms.join('|')).toContain('CAA');
    expect((html.match(/<li class="aa-partenaire"/g) ?? []).length).toBe(3);
  });

  it('vouvoiement et jamais de section vide : titre exact, texte sobre', () => {
    const view: PartenairesView = { mode: 'B', signature: null, sponsors: [sponsor()] };
    const html = renderToStaticMarkup(<SectionPartenaires view={view} />);
    expect(html).toContain('>Ils soutiennent le week-end<');
    expect(html.toLowerCase()).not.toContain('soutiennent ton');
  });
});
