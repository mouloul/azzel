// Story 4.1 — service worker de l'espace coureur. Même architecture que
// sw-volontaires.js (story 3.3), maison, minimal et explicite : AUCUNE autre
// route que /espace-coureur* n'est interceptée — la vitrine, l'admin et le
// portail volontaires ne passent jamais par ici (enregistrement avec scope
// '/espace-coureur', voir components/pwa-register-coureur.tsx).
//
// Stratégies :
//   - /espace-coureur/e-dossard (précaché à l'install, sous-resources /_next
//     & /charte extraites du HTML) : le e-dossard survit réseau absent — le
//     cache n'expire JAMAIS (NFR-6, « 30 jours plus tard ça marche encore »).
//   - navigations /espace-coureur* : réseau d'abord, la réponse fraîche
//     remplace le cache (clé = chemin + querystring), repli cache par clé,
//     repli shell e-dossard, repli page d'explication — jamais blanc.
//   - /_next/static/*, /charte/* (immuables ou quasi) : cache-first, 503
//     propre hors-ligne.
//
// Anti-empoisonnement, deux étages : une réponse n'entre en cache QUE si
// (1) elle est ok, NON redirigée (session expirée → /connexion) et son URL
// finale est le chemin demandé ; ET (2) son corps HTML porte le marker
// `data-edossard="pret"` — la page d'ATTENTE (dossier non validé) n'est
// JAMAIS cachée ni resservie hors-ligne au guichet. Chaque écriture cache
// est protégée (quota).
//
// L'épopée 4 (scan, retrait, passages) ne greffe RIEN ici : ce fichier reste
// volontairement plat et versionné par renommage de cache.

const VERSION = 'v1';
const CACHE_SHELL = `az-coureur-shell-${VERSION}`;
const CACHE_STATIQUES = `az-coureur-statiques-${VERSION}`;
const PREFIXES_CACHE = [CACHE_SHELL, CACHE_STATIQUES];

const URL_SHELL = '/espace-coureur/e-dossard';

// Marker rendu par la page (branche QR uniquement, voir page.tsx) : seule
// une page « e-dossard prêt » peut vivre dans la poche.
const MARQUEUR_PRET = 'data-edossard="pret"';

// Cache-first : assets de build hashés et charte immuable.
const PREFIXES_STATIQUES = ['/_next/static/', '/charte/'];

function estStatique(chemin) {
  return PREFIXES_STATIQUES.some((prefixe) => chemin.startsWith(prefixe));
}

function estNavigationCoureur(chemin) {
  return chemin === '/espace-coureur' || chemin.startsWith('/espace-coureur/');
}

/**
 * Réponse cacheable : ok, NON redirigée (suivi de redirection = session
 * expirée vers la page de connexion, ou portail captif), et URL finale
 * conforme au chemin attendu. (Le marker HTML se vérifie à part : il faut
 * lire le corps.)
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

/**
 * URLs des <script src> / <link href> du shell à précacher (première visite
 * complète). Limites assumées : seuls src/href simples sous /_next ou /charte
 * sont extraits — les srcset/imagesrcset (attributs à virgules) et les assets
 * chargés par d'autres moyens (fetch runtime, polices tierces, images hors
 * préfixes) ne sont PAS précachés ; ils restent servis par le réseau tant
 * qu'il est là, et dégradés proprement hors-ligne.
 */
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
        // précacher — l'installation échoue et sera retentée en ligne.
        throw new Error('shell coureur non précacheable (redirection ou erreur)');
      }
      // Le corps est lu AVANT la mise en cache (un corps consommé ne se
      // clone plus) : une page d'attente (dossier non validé, sans marker)
      // fait échouer l'install proprement — elle sera retentée après
      // validation du dossier.
      const pourCache = reponse.clone();
      const html = await reponse.text();
      if (!html.includes(MARQUEUR_PRET)) {
        throw new Error('shell coureur sans e-dossard prêt (page d’attente)');
      }
      await mettreEnCache(CACHE_SHELL, URL_SHELL, pourCache);
      // La PREMIÈRE visite doit suffire hors-ligne : les assets du HTML
      // (JS chunk + CSS) sont précachés avec lui, ressource par ressource —
      // un échec isolé (quota, 404 d'un asset) n'annule pas l'install.
      for (const url of extraireSousResources(html)) {
        try {
          const reponseAsset = await fetch(url);
          if (estReponseSaine(reponseAsset)) {
            await mettreEnCache(CACHE_STATIQUES, url, reponseAsset);
          }
        } catch (erreur) {
          // sous-ressource injoignable : le shell reste précacheable
        }
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
          .filter((nom) => nom.startsWith('az-coureur-') && !PREFIXES_CACHE.includes(nom))
          .map((nom) => caches.delete(nom)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Navigation : réseau d'abord. En ligne, la réponse fraîche remplace le
 * cache sous SA clé (chemin + querystring — deux variantes querystring ne
 * partagent pas d'entrée), UNIQUEMENT si son HTML porte le marker e-dossard
 * prêt (la page d'attente n'est jamais cachée). Une 4xx est une réponse
 * honnête du serveur : rendue telle quelle (le repli cache est réservé aux
 * 5xx et aux erreurs réseau). Hors-ligne : cache par clé, puis shell
 * e-dossard, puis page d'explication. Ne rejette JAMAIS.
 */
async function navigationCoureur(request) {
  const url = new URL(request.url);
  const chemin = url.pathname;
  const cle = url.pathname + url.search;
  try {
    const reponse = await fetch(request);
    if (reponse && reponse.ok) {
      if (!reponse.redirected && new URL(reponse.url).pathname === chemin) {
        // Deux clones : l'un pour lire le marker, l'autre pour le cache —
        // la réponse rendue au navigateur reste intacte.
        const pourTexte = reponse.clone();
        const pourCache = reponse.clone();
        if ((await pourTexte.text()).includes(MARQUEUR_PRET)) {
          await mettreEnCache(CACHE_SHELL, cle, pourCache);
        }
      }
      // Redirection suivie (connexion) : rendue telle quelle, jamais cachée.
      return reponse;
    }
    if (reponse && reponse.status < 500) {
      return reponse;
    }
    throw new Error('réponse serveur dégradée');
  } catch (erreur) {
    const enCache = await caches.match(cle, { cacheName: CACHE_SHELL });
    if (enCache) {
      return enCache;
    }
    const shell = await caches.match(URL_SHELL, { cacheName: CACHE_SHELL });
    if (shell) {
      return shell;
    }
    return pageHorsLigne();
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
// vide) : une page d'explication au lieu de l'erreur du navigateur. Le numéro
// d'assistance est transmis par le composant d'enregistrement via l'URL du SW
// (?assistance=…), lue ici — le SW n'a pas accès à l'environnement serveur.
async function pageHorsLigne() {
  let assistance = null;
  try {
    const parametres = new URLSearchParams(self.location.search);
    const candidat = parametres.get('assistance');
    if (candidat !== null && candidat.trim().length > 0) {
      assistance = candidat.trim();
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
<title>Azzel — hors-ligne</title>
<style>body{font-family:system-ui,sans-serif;background:#101A14;color:#E8F0E9;
margin:0;display:grid;place-items:center;min-height:100vh;padding:24px}
main{max-width:34rem}h1{font-size:1.4rem}a{display:inline-block;margin-top:16px;
min-height:48px;padding:14px 20px;background:#8FD4A8;color:#0C2415;
border-radius:8px;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>Ton e-dossard n’est pas encore dans la poche</h1>
<p>Ouvre ta page e-dossard au moins une fois avec du réseau pour qu’elle
s’enregistre sur cet appareil.</p>${lien}</main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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

  // Navigations coureur : réseau d'abord, cache par clé, shell e-dossard,
  // page d'explication en dernier recours — jamais de promesse rejetée.
  if (request.mode === 'navigate' && estNavigationCoureur(chemin)) {
    event.respondWith(navigationCoureur(request));
    return;
  }

  // Immuables : cache-first.
  if (estStatique(chemin)) {
    event.respondWith(cacheFirst(request, CACHE_STATIQUES));
  }

  // Toute autre route : on n'intercepte RIEN (vitrine, admin, volontaires).
});
