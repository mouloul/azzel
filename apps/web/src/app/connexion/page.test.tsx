import { renderToReadableStream } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Story 3.1 (connexion code unifiée) — rendu serveur de /connexion, page
// UNIQUE tous rôles : la page serveur lit ASSISTANCE_PHONE (readAssistancePhone
// réel) et le transmet au formulaire client → bouton « Appeler l'équipe »
// (tel:). Aucun lien vers l'ancien flux volontaire (/connexion-volontaire,
// /invitation). Seule la navigation est mockée.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  redirect: () => undefined,
}));

import ConnexionPage from './page';

async function rendre(): Promise<string> {
  const flux = await renderToReadableStream(<ConnexionPage />);
  return new Response(flux).text();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/connexion — page de connexion unique (story 3.1)', () => {
  it('bouton d’assistance : lien tel: construit depuis ASSISTANCE_PHONE', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 299');
    const html = await rendre();
    expect(html).toContain('Appeler l’équipe');
    expect(html).toContain('href="tel:+213555010299"');
  });

  it('surtitre neutre « Connexion », aucun lien vers l’ancien flux volontaire', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 299');
    const html = await rendre();
    expect(html).toContain('Connexion');
    expect(html).not.toContain('Espace coureur');
    const hrefs = html.match(/href="[^"]*"/g) ?? [];
    expect(hrefs.filter((href) => href.startsWith('href="/connexion-'))).toEqual([]);
    expect(hrefs.filter((href) => href.startsWith('href="/invitation'))).toEqual([]);
  });
});
