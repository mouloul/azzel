import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EGIDE_TEXTE } from '@/components/bandeau-egide';

import RootLayout from './layout';

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
    const nav = html.slice(html.indexOf('footer-nav'), html.indexOf('</nav>'));
    expect(nav).toContain('href="/parcours"');
    expect(nav).toContain('href="/retour-en-images"');
  });
});
