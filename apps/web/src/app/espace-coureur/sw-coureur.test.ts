import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Story 4.1 — test comportemental du service worker coureur (pattern
// sw-volontaires.test.ts) : le source public/sw-coureur.js est chargé avec des
// globales maison (self/caches/fetch) et ses événements install/activate/fetch
// sont déclenchés pour vérifier les comportements critiques : anti-
// empoisonnement (jamais de réponse redirigée en cache), première visite
// complète (shell e-dossard + sous-ressources), replis hors-ligne (navigation
// → cache par chemin puis shell puis page d'explication), périmètre strict
// (vitrine, volontaires et origines étrangères jamais interceptés).

const ORIGINE = 'https://azzel.exemple.dz';
const SOURCE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/sw-coureur.js'),
  'utf8',
);

const VERSION = 'v1';
const CACHE_SHELL = `az-coureur-shell-${VERSION}`;
const CACHE_STATIQUES = `az-coureur-statiques-${VERSION}`;

const URL_SHELL = '/espace-coureur/e-dossard';

type Reponse = {
  status: number;
  ok: boolean;
  redirected: boolean;
  url: string;
  clone(): Reponse;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

function reponseFactice(
  corps: string,
  {
    status = 200,
    redirected = false,
    url = ORIGINE + URL_SHELL,
  }: { status?: number; redirected?: boolean; url?: string } = {},
): Reponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected,
    url,
    clone() {
      return reponseFactice(corps, { status, redirected, url });
    },
    text: async () => corps,
    json: async () => JSON.parse(corps) as unknown,
  };
}

interface Requete {
  method: string;
  url: string;
  mode?: string;
}

type FetchSw = (entree: string | Requete) => Promise<Reponse>;

class CacheFactice {
  stock = new Map<string, Reponse>();

  constructor(private readonly fetchSw: FetchSw) {}

  async put(cle: string | Requete, reponse: Reponse): Promise<void> {
    this.stock.set(typeof cle === 'string' ? cle : cle.url, reponse);
  }

  async match(cle: string | Requete): Promise<Reponse | undefined> {
    return this.stock.get(typeof cle === 'string' ? cle : cle.url);
  }

  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) {
      this.stock.set(url, await this.fetchSw(url));
    }
  }
}

interface ContexteSw {
  listeners: Map<string, (event: never) => void>;
  cachesParNom: Map<string, CacheFactice>;
}

function chargerServiceWorker(
  fetchSw: FetchSw,
  search = '',
): ContexteSw {
  const listeners = new Map<string, (event: never) => void>();
  const cachesParNom = new Map<string, CacheFactice>();

  const self = {
    addEventListener: (type: string, handler: (event: never) => void) => {
      listeners.set(type, handler);
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: ORIGINE, search },
  };

  const caches = {
    open: async (nom: string) => {
      let cache = cachesParNom.get(nom);
      if (!cache) {
        cache = new CacheFactice(fetchSw);
        cachesParNom.set(nom, cache);
      }
      return cache;
    },
    match: async (cle: string | Requete, opts?: { cacheName?: string }) => {
      const cache = opts?.cacheName !== undefined ? cachesParNom.get(opts.cacheName) : undefined;
      return cache?.match(cle);
    },
    keys: async () => [...cachesParNom.keys()],
    delete: async (nom: string) => cachesParNom.delete(nom),
  };

  const script = new Function('self', 'caches', 'fetch', 'Response', 'URL', SOURCE);
  script(self, caches, fetchSw, Response, URL);
  return { listeners, cachesParNom };
}

function requete(url: string, mode?: 'navigate'): Requete {
  return { method: 'GET', url, mode };
}

async function declencherInstall(ctx: ContexteSw): Promise<void> {
  const handler = ctx.listeners.get('install') as (event: {
    waitUntil: (promesse: Promise<void>) => void;
  }) => void;
  let attente: Promise<void> | undefined;
  handler({ waitUntil: (promesse) => (attente = promesse) });
  await attente;
}

async function declencherActivate(ctx: ContexteSw): Promise<void> {
  const handler = ctx.listeners.get('activate') as (event: {
    waitUntil: (promesse: Promise<void>) => void;
  }) => void;
  let attente: Promise<void> | undefined;
  handler({ waitUntil: (promesse) => (attente = promesse) });
  await attente;
}

async function declencherFetch(
  ctx: ContexteSw,
  request: Requete,
): Promise<{ intercepte: boolean; reponse?: Response }> {
  const handler = ctx.listeners.get('fetch') as (event: {
    request: Requete;
    respondWith: (promesse: Promise<Response>) => void;
  }) => void;
  let promesseReponse: Promise<Response> | undefined;
  handler({
    request,
    respondWith: (promesse) => (promesseReponse = promesse),
  });
  if (promesseReponse === undefined) {
    return { intercepte: false };
  }
  return { intercepte: true, reponse: await promesseReponse };
}

// Le shell porte le marker rendu par la page (branche QR uniquement) — sans
// lui, le SW refuse de cacher (page d'attente jamais servie hors-ligne).
const SHELL_HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/styles.css">
<script src="/_next/static/chunks/app.js"></script>
</head><body data-edossard="pret">e-dossard</body></html>`;

const PAGE_ATTENTE_HTML = `<!doctype html><html><head></head><body>Ton e-dossard arrive</body></html>`;

const HORS_LIGNE: FetchSw = async () => {
  throw new TypeError('fetch failed');
};

describe('sw-coureur — install', () => {
  it('précache le shell e-dossard ET ses sous-resources /_next (première visite complète)', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(SHELL_HTML, {
        url: ORIGINE + (typeof entree === 'string' ? entree : new URL(entree.url).pathname),
      }),
    );
    await declencherInstall(ctx);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has(URL_SHELL)).toBe(true);
    const statiques = ctx.cachesParNom.get(CACHE_STATIQUES)?.stock ?? new Map();
    expect(statiques.has('/_next/static/chunks/styles.css')).toBe(true);
    expect(statiques.has('/_next/static/chunks/app.js')).toBe(true);
  });

  it('shell redirigé (session expirée / portail captif) : rien de mis en cache, install échoue', async () => {
    const ctx = chargerServiceWorker(async () =>
      reponseFactice('page de connexion', {
        redirected: true,
        url: ORIGINE + '/connexion',
      }),
    );
    await expect(declencherInstall(ctx)).rejects.toThrow(/précacheable/);
    expect(ctx.cachesParNom.size).toBe(0);
  });

  it('page d’attente (dossier non validé, sans marker) : jamais précachée, install échoue proprement', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(PAGE_ATTENTE_HTML, {
        url: ORIGINE + (typeof entree === 'string' ? entree : new URL(entree.url).pathname),
      }),
    );
    await expect(declencherInstall(ctx)).rejects.toThrow(/sans e-dossard prêt/);
    expect(ctx.cachesParNom.size).toBe(0);
  });

  it('sous-ressource en échec isolé : l’install survit, le shell reste précaché', async () => {
    const ctx = chargerServiceWorker(async (entree) => {
      const chemin =
        typeof entree === 'string' ? entree : new URL(entree.url).pathname;
      if (chemin === '/_next/static/chunks/styles.css') {
        throw new TypeError('asset injoignable');
      }
      return reponseFactice(SHELL_HTML, { url: ORIGINE + chemin });
    });
    await declencherInstall(ctx);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has(URL_SHELL)).toBe(true);
    const statiques = ctx.cachesParNom.get(CACHE_STATIQUES)?.stock ?? new Map();
    expect(statiques.has('/_next/static/chunks/app.js')).toBe(true);
    expect(statiques.has('/_next/static/chunks/styles.css')).toBe(false);
  });
});

describe('sw-coureur — activate', () => {
  it('nettoie uniquement les anciens caches az-coureur-*', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    ctx.cachesParNom.set('az-coureur-shell-v0', new CacheFactice(HORS_LIGNE));
    ctx.cachesParNom.set(CACHE_SHELL, new CacheFactice(HORS_LIGNE));
    ctx.cachesParNom.set('az-volontaires-shell-v1', new CacheFactice(HORS_LIGNE));
    await declencherActivate(ctx);
    expect(ctx.cachesParNom.has('az-coureur-shell-v0')).toBe(false);
    expect(ctx.cachesParNom.has(CACHE_SHELL)).toBe(true);
    expect(ctx.cachesParNom.has('az-volontaires-shell-v1')).toBe(true);
  });
});

describe('sw-coureur — fetch hors périmètre', () => {
  it('navigation vitrine /parcours et portail /volontaires : jamais respondWith', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    expect(
      (await declencherFetch(ctx, requete(ORIGINE + '/parcours', 'navigate'))).intercepte,
    ).toBe(false);
    expect(
      (await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'))).intercepte,
    ).toBe(false);
  });

  it('requête cross-origin : ignorée avant toute inspection de pathname', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const resultat = await declencherFetch(ctx, requete('https://pirate.exemple/espace-coureur'));
    expect(resultat.intercepte).toBe(false);
  });

  it('méthode non GET : jamais respondWith', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const resultat = await declencherFetch(ctx, {
      method: 'POST',
      url: ORIGINE + '/espace-coureur/e-dossard',
    });
    expect(resultat.intercepte).toBe(false);
  });
});

describe('sw-coureur — navigations /espace-coureur*', () => {
  it('page QR (avec marker) en ligne : servie ET cachée sous SON propre chemin', async () => {
    let appels = 0;
    const ctx = chargerServiceWorker(async (entree) => {
      appels += 1;
      const chemin =
        typeof entree === 'string' ? entree : new URL(entree.url).pathname;
      return reponseFactice(SHELL_HTML, { url: ORIGINE + chemin });
    });
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/espace-coureur/e-dossard', 'navigate'),
    );
    expect(await reponse?.text()).toBe(SHELL_HTML);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has(URL_SHELL)).toBe(true);
    expect(appels).toBe(1);
  });

  it('page d’attente (sans marker) en ligne : servie telle quelle, JAMAIS cachée', async () => {
    const ctx = chargerServiceWorker(async (entree) => {
      const chemin =
        typeof entree === 'string' ? entree : new URL(entree.url).pathname;
      return reponseFactice(PAGE_ATTENTE_HTML, { url: ORIGINE + chemin });
    });
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    expect(await reponse?.text()).toBe(PAGE_ATTENTE_HTML);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.size ?? 0).toBe(0);
  });

  it('variante querystring : clé propre (pathname + search), entrées distinctes', async () => {
    const ctx = chargerServiceWorker(async (entree) => {
      const url =
        typeof entree === 'string' ? new URL(entree, ORIGINE) : new URL(entree.url);
      return reponseFactice(SHELL_HTML, { url: ORIGINE + url.pathname });
    });
    await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL + '?utm=partage', 'navigate'),
    );
    await declencherFetch(ctx, requete(ORIGINE + URL_SHELL, 'navigate'));
    const stock = ctx.cachesParNom.get(CACHE_SHELL)?.stock ?? new Map();
    expect(stock.has(URL_SHELL + '?utm=partage')).toBe(true);
    expect(stock.has(URL_SHELL)).toBe(true);
  });

  it('404 en ligne : réponse rendue telle quelle, pas de repli cache (réservé 5xx/réseau)', async () => {
    const ctx = chargerServiceWorker(async () =>
      reponseFactice('pas trouvé', { status: 404, url: ORIGINE + URL_SHELL }),
    );
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set(URL_SHELL, reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    expect(reponse?.status).toBe(404);
    expect(await reponse?.text()).toBe('pas trouvé');
  });

  it('hors-ligne : page du chemin servie du cache (le QR et le numéro intacts)', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set(URL_SHELL, reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    expect(await reponse?.text()).toBe(SHELL_HTML);
  });

  it('hors-ligne sans entrée pour le chemin : repli sur le shell e-dossard', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set(URL_SHELL, reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/espace-coureur', 'navigate'),
    );
    expect(await reponse?.text()).toBe(SHELL_HTML);
  });

  it('hors-ligne sans rien : page d’explication, jamais d’écran blanc', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    expect(reponse?.status).toBe(200);
    expect(await reponse?.text()).toContain("Ton e-dossard n’est pas encore dans la poche");
  });

  it('page d’explication avec assistance : le tel: vient de l’URL d’enregistrement', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE, '?assistance=%2B213%20555%20010%20200');
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    const html = await reponse?.text();
    expect(html).toContain('Appeler l’équipe');
    expect(html).toContain('href="tel:+213555010200"');
  });

  it('5xx en ligne : le cache du chemin vaut mieux que l’erreur serveur', async () => {
    const ctx = chargerServiceWorker(async () => reponseFactice('boom', { status: 502 }));
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set(URL_SHELL, reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    expect(await reponse?.text()).toBe(SHELL_HTML);
  });

  it('réponse redirigée en ligne (session expirée) : rendue telle quelle, cache non empoisonné', async () => {
    const ctx = chargerServiceWorker(async () =>
      reponseFactice('page de connexion', {
        redirected: true,
        url: ORIGINE + '/connexion',
      }),
    );
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + URL_SHELL, 'navigate'),
    );
    expect(await reponse?.text()).toBe('page de connexion');
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.size ?? 0).toBe(0);
  });
});

describe('sw-coureur — statiques cache-first', () => {
  it('hors-ligne sans entrée : 503 propre, jamais de promesse rejetée', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/_next/static/chunks/app.js'));
    expect(reponse?.status).toBe(503);
  });

  it('en ligne : réponse saine mise en cache puis servie du cache', async () => {
    let appels = 0;
    const ctx = chargerServiceWorker(async () => {
      appels += 1;
      return reponseFactice('console.log(1)', {
        url: ORIGINE + '/_next/static/chunks/app.js',
      });
    });
    const premiere = await declencherFetch(ctx, requete(ORIGINE + '/_next/static/chunks/app.js'));
    expect(await premiere.reponse?.text()).toBe('console.log(1)');
    const seconde = await declencherFetch(ctx, requete(ORIGINE + '/_next/static/chunks/app.js'));
    expect(await seconde.reponse?.text()).toBe('console.log(1)');
    expect(appels).toBe(1);
  });
});
