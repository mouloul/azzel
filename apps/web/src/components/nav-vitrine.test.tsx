import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigationMock = vi.hoisted(() => ({ pathname: '/' as string | null }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMock.pathname,
}));

import { NavVitrine, rubriqueCourante } from './nav-vitrine';

function rendre(): string {
  return renderToStaticMarkup(<NavVitrine className="header-nav" label="La course" />);
}

describe('rubriqueCourante', () => {
  it('vraie sur la page et ses sous-pages, fausse ailleurs', () => {
    expect(rubriqueCourante('/parcours', '/parcours')).toBe(true);
    expect(rubriqueCourante('/parcours/longue', '/parcours')).toBe(true);
    expect(rubriqueCourante('/parcoursx', '/parcours')).toBe(false);
    expect(rubriqueCourante('/', '/parcours')).toBe(false);
    expect(rubriqueCourante(null, '/parcours')).toBe(false);
  });
});

describe('NavVitrine — indicateur de rubrique courante (retour comité 2027)', () => {
  beforeEach(() => {
    navigationMock.pathname = '/';
  });

  it('accueil : aucun lien marqué courant', () => {
    expect(rendre()).not.toContain('aria-current');
  });

  it('/parcours : seul le lien Parcours porte aria-current="page"', () => {
    navigationMock.pathname = '/parcours';
    const html = rendre();
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-current="page" href="/parcours"');
  });

  it('/region : le lien La région est courant', () => {
    navigationMock.pathname = '/region';
    expect(rendre()).toContain('aria-current="page" href="/region"');
  });
});
