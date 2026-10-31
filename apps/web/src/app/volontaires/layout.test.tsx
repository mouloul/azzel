import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import VolontairesLayout, { viewport } from './layout';

// Revue 3.3 — layout PWA volontaires rendu (modèle app/layout.test.tsx) : les
// liens manifest et apple-touch-icon sont bien émis, et chaque href pointe
// vers un fichier réellement servi depuis public/ (iOS Safari, Android).

const DOSSIER_PUBLIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../public',
);

function hrefDe(html: string, rel: string): string | undefined {
  const balise = html.match(new RegExp(`<link[^>]*rel="${rel}"[^>]*>`))?.[0];
  return balise?.match(/href="([^"]+)"/)?.[1];
}

describe('layout /volontaires — liens PWA', () => {
  const html = renderToStaticMarkup(VolontairesLayout({ children: <p>Fiche</p> }));

  it('lien manifest rendu, vers le manifeste commité', () => {
    const href = hrefDe(html, 'manifest');
    expect(href).toBe('/volontaires/manifest.webmanifest');
    expect(existsSync(path.join(DOSSIER_PUBLIC, (href ?? '').slice(1)))).toBe(true);
  });

  it('lien apple-touch-icon 180×180 rendu, vers le PNG commité', () => {
    const href = hrefDe(html, 'apple-touch-icon');
    expect(href).toBe('/volontaires/apple-touch-icon-180.png');
    expect(html).toContain('sizes="180x180"');
    expect(existsSync(path.join(DOSSIER_PUBLIC, (href ?? '').slice(1)))).toBe(true);
  });

  it('le contenu de la page est rendu sous les liens', () => {
    expect(html).toContain('<p>Fiche</p>');
  });

  it('viewport-fit=cover : les safe-areas iOS sont renseignées (barre d’assistance)', () => {
    expect(viewport.viewportFit).toBe('cover');
  });
});
