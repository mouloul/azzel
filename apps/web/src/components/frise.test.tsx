import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Crete, Frise } from './frise';

function hauteurRendue(html: string): string {
  return html.match(/<svg[^>]*height="(\d+)"/)?.[1] ?? '';
}

describe('Frise — hauteur bornée 8–24 px (charte)', () => {
  it('défaut : 16 px', () => {
    expect(hauteurRendue(renderToStaticMarkup(<Frise />))).toBe('16');
  });

  it('999 → clampée à 24', () => {
    expect(hauteurRendue(renderToStaticMarkup(<Frise hauteur={999} />))).toBe('24');
  });

  it('0 → clampée à 8', () => {
    expect(hauteurRendue(renderToStaticMarkup(<Frise hauteur={0} />))).toBe('8');
  });

  it('hauteur non finie (NaN) → défaut 16', () => {
    expect(hauteurRendue(renderToStaticMarkup(<Frise hauteur={Number.NaN} />))).toBe(
      '16',
    );
  });

  it('décorative : aria-hidden, motif unique par instance, références résolues', () => {
    const html = renderToStaticMarkup(
      <>
        <Frise />
        <Frise />
      </>,
    );
    const balises = html.match(/<svg[^>]*data-frise[^>]*>/g) ?? [];
    expect(balises.length).toBe(2);
    for (const balise of balises) {
      expect(balise).toContain('aria-hidden="true"');
    }
    const ids = (html.match(/<pattern id="([^"]+)"/g) ?? []).sort();
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const reference of html.match(/url\(#([^)]+)\)/g) ?? []) {
      expect(html).toContain(`id="${reference.slice(5, -1)}"`);
    }
  });
});

describe('Crete — décorative', () => {
  it('aria-hidden, trait 1,5 px, aucun remplissage hors none', () => {
    const html = renderToStaticMarkup(<Crete />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).not.toMatch(/fill="(?!none)/);
  });
});
