import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Story 3.3 — test comportemental du service worker volontaires : le source
// public/sw-volontaires.js est chargé avec des globales maison (self/caches/
// fetch, style du stub IndexedDB de idb-volontaires.test.ts) et ses
// événements install/activate/fetch sont déclenchés pour vérifier les
// comportements critiques : anti-empoisonnement (jamais de réponse redirigée
// en cache), première visite complète, replis hors-ligne (état → cache puis
// 503 ; navigation → shell puis page d'explication), périmètre strict
// (vitrine et origines étrangères jamais interceptées).

const ORIGINE = 'https://azzel.exemple.dz';
const SOURCE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/sw-volontaires.js'),
  'utf8',
);

const VERSION = 'v1';
const CACHE_SHELL = `az-volontaires-shell-${VERSION}`;
const CACHE_STATIQUES = `az-volontaires-statiques-${VERSION}`;
const CACHE_ETAT = `az-volontaires-etat-${VERSION}`;

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
    url = ORIGINE + '/volontaires',
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

function chargerServiceWorker(fetchSw: FetchSw): ContexteSw {
  const listeners = new Map<string, (event: never) => void>();
  const cachesParNom = new Map<string, CacheFactice>();

  const self = {
    addEventListener: (type: string, handler: (event: never) => void) => {
      listeners.set(type, handler);
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: ORIGINE },
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

async function declencherMessage(ctx: ContexteSw, data: unknown): Promise<void> {
  const handler = ctx.listeners.get('message') as (event: {
    data: unknown;
    waitUntil: (promesse: Promise<void>) => void;
  }) => void;
  let attente: Promise<void> | undefined;
  handler({ data, waitUntil: (promesse) => (attente = promesse) });
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

const SHELL_HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/styles.css">
<script src="/_next/static/chunks/app.js"></script>
</head><body><section data-az-shell="fiche">shell volontaires</section></body></html>`;

// Revue 3.3 — page d'erreur rendue en 200 (base indisponible) : jamais le shell.
const ERREUR_HTML = `<!doctype html><html><head>
<script src="/_next/static/chunks/app.js"></script>
</head><body><h1>Connexion indisponible</h1></body></html>`;

const ETAT_JSON = JSON.stringify({
  accountId: 'account-karim',
  editionNom: 'Édition 2027',
  assistancePhone: '+213 555 010 200',
  mesMissions: [],
  missions: [],
  generéA: '2026-10-22T08:00:00.000Z',
});

const HORS_LIGNE: FetchSw = async () => {
  throw new TypeError('fetch failed');
};

describe('sw-volontaires — install', () => {
  it('précache le shell ET ses sous-resources /_next (première visite complète)', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(SHELL_HTML, {
        url: ORIGINE + (typeof entree === 'string' ? entree : entree.url),
      }),
    );
    await declencherInstall(ctx);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has('/volontaires')).toBe(true);
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
});

describe('sw-volontaires — install tolérant et shell sain (revue 3.3)', () => {
  it('une sous-resource en 404 (déploiement en cours) n’empêche pas l’install : les autres sont cachées', async () => {
    const html = `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/styles.css?v=1&amp;h=2">
<script src="/_next/static/chunks/disparu.js"></script>
<script src="/_next/static/chunks/app.js"></script>
</head><body><section data-az-shell="fiche">fiche</section></body></html>`;
    const ctx = chargerServiceWorker(async (entree) => {
      const chemin = typeof entree === 'string' ? entree : entree.url;
      if (chemin.includes('disparu')) {
        return reponseFactice('introuvable', { status: 404, url: ORIGINE + chemin });
      }
      return reponseFactice(chemin === '/volontaires' ? html : 'asset', { url: ORIGINE + chemin });
    });
    await declencherInstall(ctx);
    const statiques = ctx.cachesParNom.get(CACHE_STATIQUES)?.stock ?? new Map();
    expect(statiques.has('/_next/static/chunks/app.js')).toBe(true);
    // &amp; décodé : l'URL cachée est celle que le navigateur demandera.
    expect(statiques.has('/_next/static/chunks/styles.css?v=1&h=2')).toBe(true);
    expect(statiques.has('/_next/static/chunks/disparu.js')).toBe(false);
  });

  it('install : page d’erreur en 200 (sans marqueur de fiche) jamais précachée comme shell', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(ERREUR_HTML, {
        url: ORIGINE + (typeof entree === 'string' ? entree : entree.url),
      }),
    );
    await expect(declencherInstall(ctx)).rejects.toThrow(/précacheable/);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.size ?? 0).toBe(0);
  });

  it('message de réchauffage (après purge de changement de compte) : le shell de la session est re-précaché', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(SHELL_HTML, {
        url: ORIGINE + (typeof entree === 'string' ? entree : entree.url),
      }),
    );
    await declencherMessage(ctx, { type: 'az-volontaires-rechauffer-shell' });
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has('/volontaires')).toBe(true);
    expect(ctx.cachesParNom.get(CACHE_STATIQUES)?.stock.has('/_next/static/chunks/app.js')).toBe(
      true,
    );
  });

  it('message de réchauffage hors-ligne : silencieux (jamais de promesse rejetée)', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    await expect(
      declencherMessage(ctx, { type: 'az-volontaires-rechauffer-shell' }),
    ).resolves.toBeUndefined();
  });
});

describe('sw-volontaires — activate', () => {
  it('nettoie uniquement les anciens caches az-volontaires-*', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    ctx.cachesParNom.set('az-volontaires-shell-v0', new CacheFactice(HORS_LIGNE));
    ctx.cachesParNom.set(CACHE_SHELL, new CacheFactice(HORS_LIGNE));
    ctx.cachesParNom.set('autre-cache', new CacheFactice(HORS_LIGNE));
    await declencherActivate(ctx);
    expect(ctx.cachesParNom.has('az-volontaires-shell-v0')).toBe(false);
    expect(ctx.cachesParNom.has(CACHE_SHELL)).toBe(true);
    expect(ctx.cachesParNom.has('autre-cache')).toBe(true);
  });
});

describe('sw-volontaires — fetch hors périmètre', () => {
  it('navigation vitrine /parcours : jamais respondWith', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const resultat = await declencherFetch(ctx, requete(ORIGINE + '/parcours', 'navigate'));
    expect(resultat.intercepte).toBe(false);
  });

  it('requête cross-origin : ignorée avant toute inspection de pathname', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const resultat = await declencherFetch(ctx, requete('https://pirate.exemple/volontaires'));
    expect(resultat.intercepte).toBe(false);
  });

  it('méthode non GET : jamais respondWith', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const resultat = await declencherFetch(ctx, { method: 'POST', url: ORIGINE + '/api/volontaires/etat' });
    expect(resultat.intercepte).toBe(false);
  });
});

describe('sw-volontaires — GET /api/volontaires/etat', () => {
  it('réponse redirigée (connexion) : rendue mais JAMAIS mise en cache', async () => {
    const ctx = chargerServiceWorker(async () =>
      reponseFactice('page de connexion', {
        redirected: true,
        url: ORIGINE + '/connexion',
      }),
    );
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/api/volontaires/etat'));
    expect(reponse?.status).toBe(200);
    expect(await reponse?.text()).toBe('page de connexion');
    expect(ctx.cachesParNom.get(CACHE_ETAT)?.stock.size ?? 0).toBe(0);
  });

  it('hors-ligne : repli sur l’état en cache, MARQUÉ X-Azzel-Source: cache (jamais pris pour un sync)', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/api/volontaires/etat', reponseFactice(ETAT_JSON));
    ctx.cachesParNom.set(CACHE_ETAT, cache);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/api/volontaires/etat'));
    expect(reponse?.status).toBe(200);
    expect(reponse?.headers.get('X-Azzel-Source')).toBe('cache');
    expect(await reponse?.text()).toBe(ETAT_JSON);
  });

  it('revue 3.3 — en ligne sain → mis en cache, puis hors-ligne → servi depuis CETTE entrée', async () => {
    let enLigne = true;
    const ctx = chargerServiceWorker(async (entree) => {
      if (!enLigne) {
        throw new TypeError('fetch failed');
      }
      return reponseFactice(ETAT_JSON, {
        url: typeof entree === 'string' ? ORIGINE + entree : entree.url,
      });
    });
    const enLigneReponse = await declencherFetch(ctx, requete(ORIGINE + '/api/volontaires/etat'));
    // Réponse réseau rendue telle quelle : aucun marquage X-Azzel-Source.
    expect(enLigneReponse.reponse?.headers).toBeUndefined();
    expect(ctx.cachesParNom.get(CACHE_ETAT)?.stock.has('/api/volontaires/etat')).toBe(true);

    enLigne = false;
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/api/volontaires/etat'));
    expect(reponse?.headers.get('X-Azzel-Source')).toBe('cache');
    expect(JSON.parse((await reponse?.text()) ?? '{}')).toMatchObject({
      accountId: 'account-karim',
      generéA: '2026-10-22T08:00:00.000Z',
    });
  });

  it('hors-ligne sans cache : enveloppe 503 propre (jamais de promesse rejetée)', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/api/volontaires/etat'));
    expect(reponse).toBeDefined();
    const corps = JSON.parse(await (reponse as Response).text()) as { error: { code: string } };
    expect(reponse?.status).toBe(503);
    expect(reponse?.headers.get('X-Azzel-Source')).toBe('hors-ligne');
    expect(corps.error.code).toBe('volontaires.hors_ligne');
  });
});

describe('sw-volontaires — navigations /volontaires', () => {
  it('hors-ligne : shell en cache servi', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires', reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(await reponse?.text()).toBe(SHELL_HTML);
  });

  it('hors-ligne sans shell : page d’explication, jamais d’écran blanc', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(reponse?.status).toBe(200);
    expect(await reponse?.text()).toContain('Ta fiche n’est pas encore dans la poche');
  });

  it('revue 3.3 — en ligne sain (fiche marquée) → caché sous /volontaires, puis hors-ligne → servi depuis CETTE entrée', async () => {
    let enLigne = true;
    const ctx = chargerServiceWorker(async (entree) => {
      if (!enLigne) {
        throw new TypeError('fetch failed');
      }
      return reponseFactice(SHELL_HTML, {
        url: typeof entree === 'string' ? ORIGINE + entree : entree.url,
      });
    });
    const premiere = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(await premiere.reponse?.text()).toBe(SHELL_HTML);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has('/volontaires')).toBe(true);

    enLigne = false;
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(await reponse?.text()).toBe(SHELL_HTML);
  });

  it('revue 3.3 — page d’erreur en 200 (sans marqueur) : rendue en ligne, JAMAIS cachée comme shell', async () => {
    const ctx = chargerServiceWorker(async () => reponseFactice(ERREUR_HTML));
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires', reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(await reponse?.text()).toBe(ERREUR_HTML);
    // La fiche saine précédente reste le shell hors-ligne.
    expect(await cache.stock.get('/volontaires')?.text()).toBe(SHELL_HTML);
  });

  it('revue 3.3 — numéro d’assistance en cache hors format : jamais inséré dans la page', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cacheEtat = new CacheFactice(HORS_LIGNE);
    cacheEtat.stock.set(
      '/api/volontaires/etat',
      reponseFactice(JSON.stringify({ assistancePhone: '"><script>alert(1)</script>' })),
    );
    ctx.cachesParNom.set(CACHE_ETAT, cacheEtat);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    const corps = (await reponse?.text()) ?? '';
    expect(corps).not.toContain('<script>');
    expect(corps).not.toContain('tel:');
    expect(corps).toContain('Réouvre l’application dès que le réseau revient.');
  });

  it('5xx en ligne : le shell en cache vaut mieux que l’erreur serveur', async () => {
    const ctx = chargerServiceWorker(async () => reponseFactice('boom', { status: 502 }));
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires', reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(await reponse?.text()).toBe(SHELL_HTML);
  });

  it('réponse redirigée en ligne : rendue telle quelle, shell non empoisonné', async () => {
    const ctx = chargerServiceWorker(async () =>
      reponseFactice('page de connexion', {
        redirected: true,
        url: ORIGINE + '/connexion',
      }),
    );
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/volontaires', 'navigate'));
    expect(await reponse?.text()).toBe('page de connexion');
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.size ?? 0).toBe(0);
  });
});

describe('sw-volontaires — navigation /volontaires/scan (story 4.2)', () => {
  const SCAN_HTML = '<!doctype html><html><body>scanner e-dossards</body></html>';

  it('en ligne : la page scan ok non redirigée est cachée SOUS SON PROPRE chemin', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(SCAN_HTML, {
        url: typeof entree === 'string' ? ORIGINE + entree : entree.url,
      }),
    );
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan', 'navigate'),
    );
    expect(await reponse?.text()).toBe(SCAN_HTML);
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.has('/volontaires/scan')).toBe(true);
  });

  it('hors-ligne : page scan en cache servie à sa place (pas le shell fiche)', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires/scan', reponseFactice(SCAN_HTML));
    cache.stock.set('/volontaires', reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan', 'navigate'),
    );
    expect(await reponse?.text()).toBe(SCAN_HTML);
  });

  it('hors-ligne, scan jamais visité : page dédiée « Scanner non enregistré », PAS le shell fiche', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires', reponseFactice(SHELL_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan', 'navigate'),
    );
    expect(reponse?.status).toBe(200);
    const corps = await reponse?.text();
    expect(corps).toContain('Scanner non enregistré sur cet appareil');
    expect(corps).toContain('Ouvre-le une fois en ligne');
    // Le shell fiche ne doit PAS être servi sous l’URL du scanner (boucle CTA).
    expect(corps).not.toContain('shell volontaires');
  });

  it('page dédiée scan : assistance relue dans l’état en cache quand elle existe', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cacheEtat = new CacheFactice(HORS_LIGNE);
    cacheEtat.stock.set('/api/volontaires/etat', reponseFactice(ETAT_JSON));
    ctx.cachesParNom.set(CACHE_ETAT, cacheEtat);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan', 'navigate'),
    );
    const corps = await reponse?.text();
    expect(corps).toContain('href="tel:+213555010200"');
  });

  it('page scan redirigée en ligne (session expirée) : rendue, JAMAIS cachée', async () => {
    const ctx = chargerServiceWorker(async () =>
      reponseFactice('page de connexion', {
        redirected: true,
        url: ORIGINE + '/connexion',
      }),
    );
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan', 'navigate'),
    );
    expect(await reponse?.text()).toBe('page de connexion');
    expect(ctx.cachesParNom.get(CACHE_SHELL)?.stock.size ?? 0).toBe(0);
  });
});

describe('sw-volontaires — statiques cache-first', () => {
  it('hors-ligne sans entrée : 503 propre, jamais de promesse rejetée', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const { reponse } = await declencherFetch(ctx, requete(ORIGINE + '/_next/static/chunks/app.js'));
    expect(reponse?.status).toBe(503);
  });

  it('en ligne : réponse saine mise en cache puis servie du cache', async () => {
    let appels = 0;
    const ctx = chargerServiceWorker(async () => {
      appels += 1;
      return reponseFactice('console.log(1)', { url: ORIGINE + '/_next/static/chunks/app.js' });
    });
    const premiere = await declencherFetch(ctx, requete(ORIGINE + '/_next/static/chunks/app.js'));
    expect(await premiere.reponse?.text()).toBe('console.log(1)');
    const seconde = await declencherFetch(ctx, requete(ORIGINE + '/_next/static/chunks/app.js'));
    expect(await seconde.reponse?.text()).toBe('console.log(1)');
    expect(appels).toBe(1);
  });
});

describe('sw-volontaires — variantes ?mode= du scanner (story 4.3)', () => {
  const SCAN_HTML = '<!doctype html><html><body>scanner checkpoints</body></html>';
  const RETRAIT_HTML = '<!doctype html><html><body>scanner retrait</body></html>';

  it('en ligne : la variante ?mode=retrait est cachée sous SA clé (chemin + querystring)', async () => {
    const ctx = chargerServiceWorker(async (entree) =>
      reponseFactice(RETRAIT_HTML, {
        url: typeof entree === 'string' ? ORIGINE + entree : entree.url,
      }),
    );
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan?mode=retrait', 'navigate'),
    );
    expect(await reponse?.text()).toBe(RETRAIT_HTML);
    const shell = ctx.cachesParNom.get(CACHE_SHELL)?.stock ?? new Map();
    expect(shell.has('/volontaires/scan?mode=retrait')).toBe(true);
    // La page NUE garde SA propre entrée : la variante visitée n'écrase rien.
    expect(shell.has('/volontaires/scan')).toBe(false);
  });

  it('hors-ligne : les deux variantes coexistent, chacune servie à l’identique', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires/scan', reponseFactice(SCAN_HTML));
    cache.stock.set('/volontaires/scan?mode=retrait', reponseFactice(RETRAIT_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);

    const checkpoints = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan', 'navigate'),
    );
    expect(await checkpoints.reponse?.text()).toBe(SCAN_HTML);

    const retrait = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan?mode=retrait', 'navigate'),
    );
    expect(await retrait.reponse?.text()).toBe(RETRAIT_HTML);
  });

  it('hors-ligne, variante jamais visitée : repli dédié, PAS l’autre mode sous fausse URL', async () => {
    const ctx = chargerServiceWorker(HORS_LIGNE);
    const cache = new CacheFactice(HORS_LIGNE);
    cache.stock.set('/volontaires/scan', reponseFactice(SCAN_HTML));
    ctx.cachesParNom.set(CACHE_SHELL, cache);
    const { reponse } = await declencherFetch(
      ctx,
      requete(ORIGINE + '/volontaires/scan?mode=retrait', 'navigate'),
    );
    const corps = await reponse?.text();
    // Jamais le scanner checkpoints servi pour le mode retrait (des passages
    // seraient appendés comme retraits) : page dédiée honnête.
    expect(corps).not.toBe(SCAN_HTML);
    expect(corps).toContain('Scanner non enregistré sur cet appareil');
  });
});
