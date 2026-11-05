import { beforeAll, describe, expect, it } from 'vitest';

const BASE_URL = `http://127.0.0.1:${process.env.BUDGET_PORT ?? '3123'}`;

describe('accueil vitrine — HTML servi (intégration opt-in)', () => {
  let html: string | null = null;

  beforeAll(async () => {
    let reponse: Response;
    try {
      reponse = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(1500) });
    } catch {
      // Serveur injoignable : test opt-in, on ignore.
      html = null;
      return;
    }
    if (!reponse.ok) {
      throw new Error(`accueil : réponse HTTP ${reponse.status} sur ${BASE_URL}/`);
    }
    html = await reponse.text();
  });

  it('ne contient plus le bandeau égide (retiré en recette le 04/11/2026)', (contexte) => {
    if (html === null) {
      contexte.skip();
    }
    expect(html).not.toContain('Sous l’égide de la Fédération et du ministère des Sports');
  });

  it('contient le CTA Participer vers /connexion?parcours=inscription', (contexte) => {
    if (html === null) {
      contexte.skip();
    }
    expect(html).toContain('href="/connexion?parcours=inscription"');
    expect(html).toContain('Participer');
  });

  it('contient les chiffres officiels 2026', (contexte) => {
    if (html === null) {
      contexte.skip();
    }
    expect(html).toContain('>279<');
    expect(html).toContain('>222<');
    expect(html).toContain('>214<');
    expect(html).toContain('>116<');
  });

  it('contient la photo hero eager avec alt descriptif', (contexte) => {
    if (html === null) {
      contexte.skip();
      return;
    }
    const hero = html.match(/<img[^>]*data-hero-photo[^>]*>/)?.[0] ?? '';
    expect(hero).not.toBe('');
    expect(hero).toContain('loading="eager"');
    expect(hero).toMatch(/alt="[^"]*2026[^"]*"/);
  });
});
