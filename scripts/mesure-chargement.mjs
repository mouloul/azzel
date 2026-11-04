#!/usr/bin/env node
// Mesure du POIDS RÉEL d'un premier chargement : tout ce que le navigateur
// télécharge effectivement, et pas seulement ce que le HTML référence.
//
// Pourquoi : le décompte statique de check-budget.sh ne voit pas les polices
// tirées par @font-face depuis la feuille de style. Une police pouvait donc
// sortir du budget en supprimant son <link rel="preload"> — sans qu'un seul
// octet quitte la page. Ici c'est Chrome qui dit ce qu'il a téléchargé, via
// le Chrome DevTools Protocol (WebSocket natif de Node ≥ 22, aucune
// dépendance ajoutée : ni Playwright ni Puppeteer).
//
// Conditions de mesure, fidèles au périmètre de la story 2.1 :
//   - viewport mobile 390 × 844, DPR 2 (le <picture> bascule à 700 px : la
//     variante 640 de la photo hero est donc bien celle qui est mesurée) ;
//   - cache désactivé (premier chargement, visiteur neuf) ;
//   - attente de l'événement load PUIS d'un silence réseau, pour capter les
//     polices et chunks qui partent après le premier rendu ;
//   - les images loading="lazy" sous la ligne de flottaison ne sont pas
//     téléchargées par le navigateur : elles restent hors budget, comme prévu.
//
// Poids compté : encodedDataLength de Chrome, soit les octets réellement
// passés sur le fil (compression comprise, en-têtes compris).
//
// Usage :
//   node scripts/mesure-chargement.mjs <url> [--json]
// Sortie par défaut : une ligne « octets<TAB>type<TAB>url » par ressource,
// puis « TOTAL<TAB>octets ». Avec --json : un objet { total, ressources }.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SILENCE_RESEAU_MS = 2000;
const DELAI_TOTAL_MS = 45_000;
const DELAI_DEMARRAGE_MS = 20_000;

const CHEMINS_CHROME = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/google/chrome/chrome',
];

function trouverChrome() {
  for (const chemin of CHEMINS_CHROME) {
    if (chemin !== undefined && chemin !== '' && existsSync(chemin)) return chemin;
  }
  throw new Error(
    'Aucun binaire Chrome/Chromium trouvé. Installez Chrome ou renseignez CHROME_BIN.',
  );
}

/** Lance Chrome sans interface et rend son point d’entrée DevTools. */
function lancerChrome(profil) {
  const binaire = trouverChrome();
  const chrome = spawn(
    binaire,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const endpoint = new Promise((resolve, reject) => {
    let tampon = '';
    const minuteur = setTimeout(() => {
      reject(new Error('Chrome n’a pas annoncé son point d’entrée DevTools à temps.'));
    }, DELAI_DEMARRAGE_MS);
    chrome.stderr.setEncoding('utf8');
    chrome.stderr.on('data', (morceau) => {
      tampon += morceau;
      const trouve = tampon.match(/ws:\/\/[^\s]+/);
      if (trouve !== null) {
        clearTimeout(minuteur);
        resolve(trouve[0]);
      }
    });
    chrome.on('exit', (code) => {
      clearTimeout(minuteur);
      reject(new Error(`Chrome s’est arrêté (code ${code}) avant d’être prêt.`));
    });
  });

  return { chrome, endpoint };
}

/** Client CDP minimal : commandes numérotées, sessions à plat. */
function clientCdp(socket) {
  let prochainId = 1;
  const attentes = new Map();
  const auditeurs = new Map();

  socket.addEventListener('message', (evenement) => {
    const message = JSON.parse(evenement.data);
    if (message.id !== undefined) {
      const attente = attentes.get(message.id);
      if (attente === undefined) return;
      attentes.delete(message.id);
      if (message.error !== undefined) attente.reject(new Error(message.error.message));
      else attente.resolve(message.result);
      return;
    }
    const liste = auditeurs.get(message.method);
    if (liste !== undefined) for (const auditeur of liste) auditeur(message.params);
  });

  return {
    envoyer(method, params = {}, sessionId = undefined) {
      const id = prochainId++;
      return new Promise((resolve, reject) => {
        attentes.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    sur(method, auditeur) {
      const liste = auditeurs.get(method) ?? [];
      liste.push(auditeur);
      auditeurs.set(method, liste);
    },
  };
}

async function mesurer(url) {
  const profil = mkdtempSync(join(tmpdir(), 'azzel-budget-'));
  const { chrome, endpoint } = lancerChrome(profil);
  const adresse = await endpoint;

  const socket = new WebSocket(adresse);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('WebSocket DevTools injoignable.')), {
      once: true,
    });
  });

  const cdp = clientCdp(socket);
  const { targetId } = await cdp.envoyer('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.envoyer('Target.attachToTarget', { targetId, flatten: true });

  const requetes = new Map(); // requestId -> { url, type }
  const ressources = [];
  let dernierEvenement = Date.now();

  cdp.sur('Network.requestWillBeSent', (p) => {
    dernierEvenement = Date.now();
    requetes.set(p.requestId, { url: p.request.url, type: p.type ?? 'Other' });
  });
  cdp.sur('Network.responseReceived', (p) => {
    dernierEvenement = Date.now();
    const requete = requetes.get(p.requestId);
    if (requete !== undefined) requete.type = p.type ?? requete.type;
  });
  cdp.sur('Network.loadingFinished', (p) => {
    dernierEvenement = Date.now();
    const requete = requetes.get(p.requestId);
    if (requete === undefined) return;
    // Les URL data: ne coûtent rien de plus que le document qui les porte.
    if (requete.url.startsWith('data:')) return;
    ressources.push({
      url: requete.url,
      type: requete.type,
      octets: p.encodedDataLength ?? 0,
    });
  });
  cdp.sur('Network.loadingFailed', () => {
    dernierEvenement = Date.now();
  });

  await cdp.envoyer('Network.enable', {}, sessionId);
  await cdp.envoyer('Page.enable', {}, sessionId);
  await cdp.envoyer('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await cdp.envoyer(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    sessionId,
  );

  let charge = false;
  cdp.sur('Page.loadEventFired', () => {
    charge = true;
    dernierEvenement = Date.now();
  });

  await cdp.envoyer('Page.navigate', { url }, sessionId);

  const debut = Date.now();
  while (Date.now() - debut < DELAI_TOTAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (charge && Date.now() - dernierEvenement > SILENCE_RESEAU_MS) break;
  }
  if (!charge) throw new Error(`La page ${url} n’a jamais déclenché son événement load.`);

  socket.close();
  const arret = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  await Promise.race([arret, new Promise((resolve) => setTimeout(resolve, 5000))]);
  // Nettoyage opportuniste : Chrome peut encore vider ses tampons dans le
  // profil jetable. Un reliquat dans /tmp ne doit pas faire échouer la mesure.
  try {
    rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* profil jetable laissé au système */
  }

  ressources.sort((a, b) => b.octets - a.octets);
  const total = ressources.reduce((somme, r) => somme + r.octets, 0);
  return { total, ressources };
}

const arguments_ = process.argv.slice(2);
const url = arguments_.find((a) => !a.startsWith('--'));
if (url === undefined) {
  console.error('Usage : node scripts/mesure-chargement.mjs <url> [--json]');
  process.exit(2);
}

try {
  const resultat = await mesurer(url);
  if (arguments_.includes('--json')) {
    console.log(JSON.stringify(resultat));
  } else {
    for (const ressource of resultat.ressources) {
      console.log(`${ressource.octets}\t${ressource.type}\t${ressource.url}`);
    }
    console.log(`TOTAL\t${resultat.total}`);
  }
} catch (erreur) {
  console.error(`Erreur de mesure : ${erreur.message}`);
  process.exit(1);
}
