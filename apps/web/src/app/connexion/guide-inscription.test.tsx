import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Le formulaire est un composant client (useRouter) : seule la navigation est
// mockée, le rendu serveur suffit à juger ce qui est écrit à l'écran.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  redirect: () => undefined,
}));

import { GuideInscription } from './guide-inscription';
import ConnexionPage from './page';

async function rendreGuide(etape: 'email' | 'code'): Promise<string> {
  const flux = await renderToReadableStream(<GuideInscription etape={etape} />);
  return new Response(flux).text();
}

async function rendre(params?: Record<string, string>): Promise<string> {
  const page = await ConnexionPage(
    params ? { searchParams: Promise.resolve(params) } : undefined,
  );
  const flux = await renderToReadableStream(page);
  return new Response(flux).text();
}

describe('guide du parcours d’inscription (recette du 04/11/2026)', () => {
  it('explique les cinq étapes réelles, dans l’ordre du parcours', async () => {
    const html = await rendre({ parcours: 'inscription' });
    const positions = [
      'Votre adresse email',
      'Le code reçu par email',
      'Votre inscription',
      'Décharge et règlement',
      'Preuve de paiement',
    ].map((titre) => html.indexOf(titre));
    for (const position of positions) {
      expect(position).toBeGreaterThan(-1);
    }
    // Ordre strict : le guide décrit un parcours, pas une liste de sujets.
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('dit où aller chercher le code quand il n’arrive pas', async () => {
    const html = await rendre({ parcours: 'inscription' });
    expect(html).toContain('indésirables');
  });

  it('l’étape en cours est annoncée EN TEXTE, pas par la seule couleur', async () => {
    const html = await rendre({ parcours: 'inscription' });
    expect(html).toContain('étape 1 sur 5, en cours');
  });

  it('à l’étape du code, la première étape est marquée faite et la deuxième en cours', async () => {
    const html = await rendreGuide('code');
    expect(html).toContain('Votre adresse email<span class="guide-etape__etat"> — fait');
    expect(html).toContain('étape 2 sur 5, en cours');
  });

  it('absent du parcours « connexion » : on y revient, on connaît le chemin', async () => {
    const html = await rendre();
    expect(html).not.toContain('Comment ça se passe');
    expect(html).not.toContain('Preuve de paiement');
  });
});
