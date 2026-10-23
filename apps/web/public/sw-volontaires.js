// Story 3.3 — service worker de la PWA volontaires. Maison, minimal et
// explicite : AUCUNE autre route que /volontaires* et GET /api/volontaires/etat
// n'est interceptée — la vitrine, l'admin et l'espace coureur ne passent
// jamais par ici (enregistrement avec scope '/volontaires', voir
// components/pwa-register.tsx).
//
// Stratégies :
//   - /volontaires (précache à l'install, sous-resources /_next & /charte
//     extraites du HTML) + navigations /volontaires* : réseau d'abord, repli
//     cache, repli page d'explication — jamais blanc, jamais d'erreur 5xx
//     servie si le shell est en cache.
//   - GET /api/volontaires/etat : réseau d'abord, la réponse fraîche est
//     mise en cache, repli cache hors-ligne puis enveloppe 503.
//   - /_next/static/*, /charte/*, icônes et manifeste (immuables ou
//     quasi) : cache-first, 503 propre hors-ligne.
//
// Anti-empoisonnement : une réponse n'est mise en cache QUE si elle est ok,
// NON redirigée (session expirée → page de connexion) et que son URL finale
// est bien la route attendue (portail captif). Chaque écriture cache est
// protégée (quota) pour ne jamais jeter une réponse réseau valide.
//
// L'épopée 4 (caméra/scan/outbox) greffera ses stratégies ici : ce fichier
// reste volontairement plat et versionné par renommage de cache.

const VERSION = 'v1';
const CACHE_SHELL = `az-volontaires-shell-${VERSION}`;
const CACHE_STATIQUES = `az-volontaires-statiques-${VERSION}`;
const CACHE_ETAT = `az-volontaires-etat-${VERSION}`;
const PREFIXES_CACHE = [CACHE_SHELL, CACHE_STATIQUES, CACHE_ETAT];

const URL_SHELL = '/volontaires';
const URL_ETAT = '/api/volontaires/etat';

// Cache-first : assets de build hashés et charte immuable.
const PREFIXES_STATIQUES = ['/_next/static/', '/charte/'];
const STATIQUES_EXACTES = [
  '/volontaires/icon-192.png',
  '/volontaires/icon-512.png',
  '/volontaires/icon-maskable-512.png',
  '/volontaires/apple-touch-icon-180.png',
  '/volontaires/manifest.webmanifest',
];

function estStatique(chemin) {
  return (
    PREFIXES_STATIQUES.some((prefixe) => chemin.startsWith(prefixe)) ||
    STATIQUES_EXACTES.includes(chemin)
  );
}

function estNavigationVolontaires(chemin) {
  return chemin === URL_SHELL || chemin.startsWith('/volontaires/');
}

/**
 * Réponse cacheable : ok, NON redirigée (suivi de redirection = session
 * expirée vers la page de connexion, ou portail captif), et URL finale
 * conforme à la route attendue. Rien d'autre n'entre en cache.
 */
function estReponseSaine(reponse, cheminAttendu) {
  if (!reponse || !reponse.ok || reponse.redirected) {
    return false;
  }
  if (cheminAttendu !== undefined && new URL(reponse.url).pathname !== cheminAttendu) {
    return false;
  }
  return true;
}

/** Écriture cache protégée : un échec de quota n'invalide jamais la réponse. */
async function mettreEnCache(cacheName, cle, reponse) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(cle, reponse.clone());
  } catch (erreur) {
    // quota dépassé / stockage indisponible : on rend la réponse réseau.
  }
}

/** URLs des <script src> / <link href> du shell à précacher (première visite complète). */
function extraireSousResources(html) {
  const urls = new Set();
  const motifs = [/<script[^>]+src="([^"]+)"/g, /<link[^>]+href="([^"]+)"/g];
  for (const motif of motifs) {
    let correspondance;
    while ((correspondance = motif.exec(html)) !== null) {
      const valeur = correspondance[1];
      if (valeur.startsWith('/_next/') || valeur.startsWith('/charte/')) {
        urls.add(valeur);
      }
    }
  }
  return [...urls];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const reponse = await fetch(URL_SHELL);
      if (!estReponseSaine(reponse, URL_SHELL)) {
        // Redirection (connexion) ou portail captif : rien de poisonnable à
        // precacher — l'installation échoue et sera retentée en ligne.
        throw new Error('shell volontaires non précacheable (redirection ou erreur)');
      }
      await mettreEnCache(CACHE_SHELL, URL_SHELL, reponse);
      // La PREMIÈRE visite doit suffire à être stylée hors-ligne : les
      // assets du HTML shell (JS chunk + CSS) sont précachés avec lui.
      const sousResources = extraireSousResources(await reponse.text());
      if (sousResources.length > 0) {
        const cache = await caches.open(CACHE_STATIQUES);
        await cache.addAll(sousResources);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter((nom) => nom.startsWith('az-volontaires-') && !PREFIXES_CACHE.includes(nom))
          .map((nom) => caches.delete(nom)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Navigation : réseau d'abord. Story 4.2 — chaque page volontaires (fiche,
 * scanner /volontaires/scan) est cachée sous SON PROPRE chemin ; le repli
 * hors-ligne sert la page demandée en cache, puis :
 *   - /volontaires → page d'explication fiche (jamais le scanner sous une
 *     fausse URL) ;
 *   - toute autre page (le scanner) JAMAIS visitée en ligne → page dédiée
 *     « Scanner non enregistré sur cet appareil » — pas le shell fiche, qui
 *     mènerait à une boucle (CTA scan → même shell).
 * Ne rejette JAMAIS.
 */
async function navigationVolontaires(request) {
  const chemin = new URL(request.url).pathname;
  try {
    const reponse = await fetch(request);
    if (reponse && reponse.ok) {
      if (!reponse.redirected && new URL(reponse.url).pathname === chemin) {
        await mettreEnCache(CACHE_SHELL, chemin, reponse);
      }
      // Redirection suivie (connexion) : rendue telle quelle, jamais cachée.
      return reponse;
    }
    throw new Error('réponse serveur dégradée');
  } catch (erreur) {
    const enCache = await caches.match(chemin, { cacheName: CACHE_SHELL });
    if (enCache) {
      return enCache;
    }
    if (chemin === URL_SHELL) {
      return pageHorsLigne();
    }
    return pageScannerNonEnregistre();
  }
}

/** Réseau d'abord avec repli cache — ne met en cache que le certain. */
async function reseauDabord(request, cacheName, cleDeRepli) {
  const cle = cleDeRepli ?? request;
  const cheminAttendu = typeof cle === 'string' ? cle : new URL(request.url).pathname;
  try {
    const reponse = await fetch(request);
    if (estReponseSaine(reponse, cheminAttendu)) {
      await mettreEnCache(cacheName, cle, reponse);
    }
    return reponse;
  } catch (erreur) {
    const enCache = await caches.match(cle, { cacheName });
    if (enCache) {
      return enCache;
    }
    throw erreur;
  }
}

/** Cache-first : hors-ligne sans entrée, on répond un 503 propre (jamais de rejet). */
async function cacheFirst(request, cacheName) {
  const enCache = await caches.match(request, { cacheName });
  if (enCache) {
    return enCache;
  }
  try {
    const reponse = await fetch(request);
    if (estReponseSaine(reponse)) {
      await mettreEnCache(cacheName, request, reponse);
    }
    return reponse;
  } catch (erreur) {
    return new Response('', { status: 503, statusText: 'Hors-ligne' });
  }
}

// Repli final hors-ligne (premier lancement directement sans réseau, cache
// vide) : une page d'explication au lieu de l'erreur du navigateur. Le
// numéro d'assistance est relu dans l'état mis en cache, s'il existe.
async function pageHorsLigne() {
  let assistance = null;
  try {
    const etat = await caches.match(URL_ETAT, { cacheName: CACHE_ETAT });
    if (etat) {
      const payload = await etat.json();
      if (typeof payload.assistancePhone === 'string') {
        assistance = payload.assistancePhone;
      }
    }
  } catch (erreur) {
    assistance = null;
  }
  const lien =
    assistance !== null
      ? `<a href="tel:${assistance.replace(/[\s().-]/g, '')}">Appeler l’équipe</a>`
      : '<p>Réouvre l’application dès que le réseau revient.</p>';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Azzel Volontaires — hors-ligne</title>
<style>body{font-family:system-ui,sans-serif;background:#FAFCF8;color:#16281C;
margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}
main{max-width:34rem}h1{font-size:1.4rem}a{display:inline-block;margin-top:16px;
min-height:48px;padding:14px 20px;background:#345E4A;color:#EFF8F2;
border-radius:8px;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>Ta fiche n’est pas encore dans la poche</h1>
<p>Cette application doit être ouverte au moins une fois avec du réseau pour que
ta fiche mission soit enregistrée sur cet appareil.</p>${lien}</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Story 4.2 — repli dédié : le scanner ouvert hors-ligne SANS avoir été
// visité en ligne au préalable (aucune entrée de cache, annuaire forcément
// absent). Une explication honnête plutôt que le shell fiche sous une fausse
// URL (boucle CTA). Numéro d'assistance relu dans l'état en cache, s'il existe.
async function pageScannerNonEnregistre() {
  let assistance = null;
  try {
    const etat = await caches.match(URL_ETAT, { cacheName: CACHE_ETAT });
    if (etat) {
      const payload = await etat.json();
      if (typeof payload.assistancePhone === 'string') {
        assistance = payload.assistancePhone;
      }
    }
  } catch (erreur) {
    assistance = null;
  }
  const lien =
    assistance !== null
      ? `<a href="tel:${assistance.replace(/[\s().-]/g, '')}">Appeler l’équipe</a>`
      : '<p>Réouvre le scanner dès que le réseau revient.</p>';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Azzel Volontaires — scanner non enregistré</title>
<style>body{font-family:system-ui,sans-serif;background:#FAFCF8;color:#16281C;
margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}
main{max-width:34rem}h1{font-size:1.4rem}a{display:inline-block;margin-top:16px;
min-height:48px;padding:14px 20px;background:#345E4A;color:#EFF8F2;
border-radius:8px;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>Scanner non enregistré sur cet appareil</h1>
<p>Ouvre-le une fois en ligne : il restera ensuite dans la poche, même sans
réseau, avec l’annuaire des coureurs.</p>${lien}</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function reponseEtatHorsLigne() {
  return new Response(
    JSON.stringify({
      error: {
        code: 'volontaires.hors_ligne',
        message: 'Hors-ligne.',
        action: 'Ta fiche reste disponible depuis le dernier enregistrement.',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  // Garde d'origine : le SW ne regarde même pas ce qui vient d'ailleurs.
  if (url.origin !== self.location.origin) {
    return;
  }
  const chemin = url.pathname;

  // Navigations volontaires : réseau d'abord, shell en repli, page
  // d'explication en dernier recours — jamais de promesse rejetée.
  if (request.mode === 'navigate' && estNavigationVolontaires(chemin)) {
    event.respondWith(navigationVolontaires(request));
    return;
  }

  // État volontaire : la réponse fraîche alimente le cache de repli (clé
  // chemin déterministe, comme la lecture de pageHorsLigne).
  if (chemin === URL_ETAT) {
    event.respondWith(
      reseauDabord(request, CACHE_ETAT, URL_ETAT).catch(() => reponseEtatHorsLigne()),
    );
    return;
  }

  // Immuables : cache-first.
  if (estStatique(chemin)) {
    event.respondWith(cacheFirst(request, CACHE_STATIQUES));
  }

  // Toute autre route : on n'intercepte RIEN (vitrine, admin, coureur).
});
