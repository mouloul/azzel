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
});
