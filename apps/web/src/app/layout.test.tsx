import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EGIDE_TEXTE } from '@/components/bandeau-egide';

import RootLayout from './layout';

/** Navigation du pied de page seule (l'en-tête porte aussi une navigation ≥ 960 px). */
function navigationDuPied(html: string): string {
  const debut = html.indexOf('footer-nav');
  return html.slice(debut, html.indexOf('</nav>', debut));
}

describe('layout racine — rendu statique', () => {
  it('affiche le bandeau égide (présent sur toutes les pages)', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html).toContain(EGIDE_TEXTE);
    expect(html).toContain('class="egide"');
  });

  it('le bandeau égide précède l’en-tête du site', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html.indexOf('class="egide"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="egide"')).toBeLessThan(
      html.indexOf('class="site-header"'),
    );
  });

  it('aucune frise ni crête décorative au niveau du layout (réservées aux seuils de la vitrine)', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html).not.toContain('data-frise');
    expect(html).not.toContain('data-crete');
    expect(html).not.toContain('data-glyphe');
  });

  it('aucune mention « Tafsut » dans le layout', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html.toLowerCase()).not.toContain('tafsut');
  });

  it('pied de page : liens texte sobres vers /parcours et /region (story 2.4)', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html).toContain('href="/parcours"');
    expect(html).toContain('href="/region"');
    expect(html.indexOf('footer-nav')).toBeGreaterThan(-1);
  });

  it('pied de page : lien texte « Retour en images » vers /retour-en-images (story 2.5)', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html).toContain('href="/retour-en-images"');
    expect(html).toContain('Retour en images');
    // Même registre sobre que /parcours et /region : dans la même navigation.
    const nav = navigationDuPied(html);
    expect(nav).toContain('href="/parcours"');
    expect(nav).toContain('href="/retour-en-images"');
  });

  it('pied de page : lien texte « Résultats » vers /resultats (story 7.2)', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html).toContain('href="/resultats"');
    expect(html).toContain('>Résultats</a>');
    // Même navigation sobre que /parcours et /region.
    const nav = navigationDuPied(html);
    expect(nav).toContain('href="/resultats"');
  });

  it('en-tête : navigation vitrine (Parcours, La région, Retour en images, Résultats)', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    const debut = html.indexOf('class="header-nav"');
    expect(debut).toBeGreaterThan(html.indexOf('class="site-header"'));
    const nav = html.slice(debut, html.indexOf('</nav>', debut));
    expect(nav).toContain('aria-label="La course"');
    for (const href of ['/parcours', '/region', '/retour-en-images', '/resultats']) {
      expect(nav).toContain(`href="${href}"`);
    }
  });

  it('onglet « Mon trail » monté, encart fermé, aucune lecture de session au rendu', () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: <p>Contenu de page</p> }),
    );
    expect(html).toContain('class="mon-trail__onglet"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<section[^>]*id="mon-trail-encart"[^>]*hidden=""/);
  });
});
