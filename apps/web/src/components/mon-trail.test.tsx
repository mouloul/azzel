import type { ReactElement } from 'react';
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Rendu serveur pur (pas de DOM dans la suite) : l'état fermé est rendu ici ;
// ouverture, Échap, focus et clic extérieur passent par `activerEncart`, la
// même fonction que celle branchée par le composant, testée sur des doubles.
const navigationMock = vi.hoisted(() => ({ pathname: '/' as string | null }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
}));

import {
  activerEncart,
  ContenuEncart,
  etatDepuisSession,
  ID_ENCART_MON_TRAIL,
  lireEtatSession,
  MonTrail,
  ongletVisible,
  SESSION_ANONYME,
} from './mon-trail';

beforeEach(() => {
  navigationMock.pathname = '/';
});

describe('MonTrail — rendu initial (encart fermé)', () => {
  it('onglet bouton : aria-expanded=false, aria-controls vers l’encart masqué', () => {
    const html = renderToStaticMarkup(<MonTrail />);
    const onglet = html.match(/<button[^>]*class="mon-trail__onglet"[^>]*>/)?.[0] ?? '';
    expect(onglet).toContain('type="button"');
    expect(onglet).toContain('aria-expanded="false"');
    expect(onglet).toContain(`aria-controls="${ID_ENCART_MON_TRAIL}"`);
    expect(html).toContain('>Mon trail</span>');
    const encart = html.match(/<section[^>]*id="mon-trail-encart"[^>]*>/)?.[0] ?? '';
    expect(encart).toContain('hidden=""');
    expect(encart).toContain('tabindex="-1"');
    expect(encart).toContain('aria-labelledby="mon-trail-titre"');
  });

  it('visiteur : « Me connecter » vers /connexion, « M’inscrire » vers /connexion?parcours=inscription', () => {
    const html = renderToStaticMarkup(<MonTrail />);
    expect(html).toMatch(/<a[^>]*href="\/connexion"[^>]*>Me connecter<\/a>/);
    expect(html).toMatch(
      /<a[^>]*href="\/connexion\?parcours=inscription"[^>]*>M’inscrire<\/a>/,
    );
    expect(html).not.toContain('Me déconnecter');
  });

  it.each(['/admin', '/admin/dossiers', '/volontaires', '/volontaires/mission'])(
    'masqué sous %s',
    (chemin) => {
      navigationMock.pathname = chemin;
      expect(renderToStaticMarkup(<MonTrail />)).toBe('');
    },
  );

  it.each(['/', '/connexion', '/espace-coureur', '/parcours'])('présent sur %s', (chemin) => {
    navigationMock.pathname = chemin;
    expect(renderToStaticMarkup(<MonTrail />)).toContain('mon-trail__onglet');
  });
});

/** Rendu complet, composants différés (bouton de déconnexion) résolus. */
async function rendreComplet(element: ReactElement): Promise<string> {
  const flux = await renderToReadableStream(element);
  await flux.allReady;
  return new Response(flux).text();
}

describe('ContenuEncart — corps de l’encart selon la session', () => {
  it('connecté (organisateur) : « Mon espace » vers /admin/dossiers + « Me déconnecter »', async () => {
    const html = await rendreComplet(
      <ContenuEncart session={{ connecte: true, espace: '/admin/dossiers' }} chargement={false} />,
    );
    expect(html).toMatch(/<a[^>]*href="\/admin\/dossiers"[^>]*>Mon espace<\/a>/);
    expect(html).toMatch(/<button[^>]*>Me déconnecter<\/button>/);
    expect(html).not.toContain('Me connecter');
    expect(html).not.toContain('M’inscrire');
  });

  it('chargement : aucun lien ni bouton d’action, texte neutre', async () => {
    for (const session of [SESSION_ANONYME, { connecte: true, espace: '/espace-coureur' }] as const) {
      const html = await rendreComplet(<ContenuEncart session={session} chargement />);
      expect(html).toContain('Chargement…');
      expect(html).not.toContain('<a');
      expect(html).not.toContain('<button');
    }
  });

  it('anonyme : « Me connecter » et « M’inscrire »', async () => {
    const html = await rendreComplet(
      <ContenuEncart session={SESSION_ANONYME} chargement={false} />,
    );
    expect(html).toMatch(/<a[^>]*href="\/connexion"[^>]*>Me connecter<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/connexion\?parcours=inscription"[^>]*>M’inscrire<\/a>/);
    expect(html).not.toContain('Me déconnecter');
  });
});

describe('ongletVisible', () => {
  it('préfixes /admin et /volontaires seulement (frontière de segment)', () => {
    expect(ongletVisible('/administration')).toBe(true);
    expect(ongletVisible('/volontaires-info')).toBe(true);
    expect(ongletVisible('/admin')).toBe(false);
    expect(ongletVisible('/volontaires/')).toBe(false);
    expect(ongletVisible(null)).toBe(true);
  });
});

describe('état connecté — session lue à l’ouverture', () => {
  it.each([
    ['coureur', '/espace-coureur'],
    ['organisateur', '/admin/dossiers'],
    ['volontaire', '/volontaires'],
  ])('%s : « Mon espace » mène à %s', (role, espace) => {
    expect(etatDepuisSession(true, { role, email: 'x@exemple.dz' })).toEqual({
      connecte: true,
      espace,
    });
  });

  it('session illisible ou absente → encart anonyme', () => {
    expect(etatDepuisSession(false, { role: 'coureur' })).toEqual(SESSION_ANONYME);
    expect(etatDepuisSession(true, null)).toEqual(SESSION_ANONYME);
    expect(etatDepuisSession(true, { role: 'pirate' })).toEqual(SESSION_ANONYME);
    expect(etatDepuisSession(true, 'texte')).toEqual(SESSION_ANONYME);
  });

  it('lireEtatSession : GET /api/auth/session, 401 / panne / JSON invalide → anonyme', async () => {
    const ok = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role: 'organisateur' }), { status: 200 }),
    );
    await expect(lireEtatSession(ok)).resolves.toEqual({
      connecte: true,
      espace: '/admin/dossiers',
    });
    expect(ok).toHaveBeenCalledWith('/api/auth/session', { method: 'GET' }, 10_000);

    const refus = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(lireEtatSession(refus)).resolves.toEqual(SESSION_ANONYME);

    const panne = vi.fn().mockRejectedValue(new TypeError('réseau'));
    await expect(lireEtatSession(panne)).resolves.toEqual(SESSION_ANONYME);

    const illisible = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(lireEtatSession(illisible)).resolves.toEqual(SESSION_ANONYME);
  });
});

describe('activerEncart — focus, Échap, clic extérieur', () => {
  function element(nom: string) {
    return {
      nom,
      focus: vi.fn(),
      contains: (node: Node | null) => (node as unknown as { dans?: string } | null)?.dans === nom,
    };
  }

  function evenement(type: string, init: Record<string, unknown>): Event {
    return Object.assign(new Event(type, { cancelable: true }), init);
  }

  function pointeurSur(cible: unknown): Event {
    const event = new Event('pointerdown');
    Object.defineProperty(event, 'target', { value: cible });
    return event;
  }

  it('à l’ouverture : le focus entre dans l’encart', () => {
    const panneau = element('panneau');
    const onglet = element('onglet');
    activerEncart({ doc: new EventTarget(), panneau, onglet, fermer: vi.fn() });
    expect(panneau.focus).toHaveBeenCalledTimes(1);
    expect(onglet.focus).not.toHaveBeenCalled();
  });

  it('Échap : ferme et rend le focus à l’onglet', () => {
    const doc = new EventTarget();
    const panneau = element('panneau');
    const onglet = element('onglet');
    const fermer = vi.fn();
    activerEncart({ doc, panneau, onglet, fermer });

    doc.dispatchEvent(evenement('keydown', { key: 'Enter' }));
    expect(fermer).not.toHaveBeenCalled();

    const echap = evenement('keydown', { key: 'Escape' });
    doc.dispatchEvent(echap);
    expect(fermer).toHaveBeenCalledTimes(1);
    expect(onglet.focus).toHaveBeenCalledTimes(1);
    expect(echap.defaultPrevented).toBe(true);
  });

  it('clic extérieur : ferme ; clic dans l’encart ou sur l’onglet : reste ouvert', () => {
    const doc = new EventTarget();
    const fermer = vi.fn();
    activerEncart({ doc, panneau: element('panneau'), onglet: element('onglet'), fermer });

    doc.dispatchEvent(pointeurSur({ dans: 'panneau' }));
    doc.dispatchEvent(pointeurSur({ dans: 'onglet' }));
    expect(fermer).not.toHaveBeenCalled();

    doc.dispatchEvent(pointeurSur({ dans: 'page' }));
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('débranchement : plus aucune fermeture après la fermeture de l’encart', () => {
    const doc = new EventTarget();
    const fermer = vi.fn();
    const debrancher = activerEncart({
      doc,
      panneau: element('panneau'),
      onglet: element('onglet'),
      fermer,
    });
    debrancher();
    doc.dispatchEvent(evenement('keydown', { key: 'Escape' }));
    doc.dispatchEvent(pointeurSur({ dans: 'page' }));
    expect(fermer).not.toHaveBeenCalled();
  });
});
