import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 10.4 (Partie A) — garde du précache hors-ligne : aucun actif
 * CSS/JS d'un écran volontaires ne doit échapper au service worker.
 *
 * Mécanisme vérifié (inspection du build réel, story 10.4) : Next émet tout
 * CSS/JS sous /_next/static/, les polices sous /charte/ ; sw-volontaires.js
 * précache le shell /volontaires ET ses sous-resources /_next & /charte
 * (extraireSousResources), sert le reste /_next|/charte en cache-first, et
 * connaît en exact /volontaires/{manifest,icônes}. Le socle (socle.css,
 * importé par le layout RACINE) atterrit dans le chunk CSS global présent
 * dans le HTML de /volontaires comme de /volontaires/scan — donc précaché
 * à l'installation.
 *
 * Ce garde épingle les trois briques de l'invariant, au niveau source :
 * 1. le SW couvre bien /_next/static/, /charte/ et les 5 URLs exactes ;
 * 2. tout <link>/<script> MANUEL des écrans volontaires (+ layout racine)
 *    pointe exclusivement vers des URLs couvertes par le SW ;
 * 3. socle.css reste importé par le layout racine (chunk global) et les
 *    feuilles propres à la route restent importées par leurs pages.
 *
 * Une dérive (feuille CSS posée dans public/, asset externe, assetPrefix,
 * déplacement du socle hors du layout racine) fait échouer le garde AVANT
 * qu'un écran refondu n'apparaisse sans style hors-ligne. */

const CHEMIN_SW = fileURLToPath(new URL('../../../public/sw-volontaires.js', import.meta.url));
const RACINE_SRC = fileURLToPath(new URL('../../', import.meta.url));
const CHEMIN_LAYOUT_RACINE = fileURLToPath(new URL('../layout.tsx', import.meta.url));

const sw = readFileSync(CHEMIN_SW, 'utf8');

/** Liste littérale d'un tableau `const X = ['a', 'b', …]` du SW. */
function litterauxSw(nom: string): string[] {
  const bloc = sw.match(new RegExp(`${nom}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1] ?? '';
  return [...bloc.matchAll(/'([^']+)'/g)].flatMap((correspondance) =>
    correspondance[1] === undefined ? [] : [correspondance[1]],
  );
}

const prefixesStatiques = litterauxSw('PREFIXES_STATIQUES');
const statiquesExactes = litterauxSw('STATIQUES_EXACTES');

/** URL d'actif couverte par le SW (préfixe cache-first ou URL exacte). */
function estCouverte(url: string): boolean {
  return (
    prefixesStatiques.some((prefixe) => url.startsWith(prefixe)) ||
    statiquesExactes.includes(url)
  );
}

/** Tous les fichiers .tsx du sous-arbre volontaires. */
function fichiersTsx(racine: string): string[] {
  const fichiers: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      fichiers.push(...fichiersTsx(chemin));
    } else if (entree.endsWith('.tsx')) {
      fichiers.push(chemin);
    }
  }
  return fichiers;
}

/** href des <link …> et src des <script …> d'un source TSX (échappés inclus). */
function urlsDactifsManuels(source: string): { fichier: string; url: string }[] {
  const urls: { fichier: string; url: string }[] = [];
  for (const balise of source.match(/<link\b[^>]*>/g) ?? []) {
    const href = balise.match(/href="([^"]+)"/)?.[1];
    if (href !== undefined) {
      urls.push({ fichier: '', url: href.replace(/&amp;/g, '&') });
    }
  }
  for (const balise of source.match(/<script\b[^>]*>/g) ?? []) {
    const src = balise.match(/src="([^"]+)"/)?.[1];
    if (src !== undefined) {
      urls.push({ fichier: '', url: src.replace(/&amp;/g, '&') });
    }
  }
  return urls;
}

describe('sw-volontaires — périmètre de couverture épinglé', () => {
  it("cache-first sur /_next/static/ et /charte/ (tout CSS/JS de build s'y trouve)", () => {
    expect(prefixesStatiques).toContain('/_next/static/');
    expect(prefixesStatiques).toContain('/charte/');
  });

  it('URLs exactes connues : manifeste + les 4 icônes de public/volontaires', () => {
    expect(statiquesExactes).toEqual([
      '/volontaires/icon-192.png',
      '/volontaires/icon-512.png',
      '/volontaires/icon-maskable-512.png',
      '/volontaires/apple-touch-icon-180.png',
      '/volontaires/manifest.webmanifest',
    ]);
  });

  it("l'extraction du précachu n'accepte QUE /_next et /charte (rien d'autre n'entre au bootstrap)", () => {
    const extraction = sw.match(/valeur\.startsWith\('\/_next\/'\)[^;]+/)?.[0] ?? '';
    expect(extraction).toContain("startsWith('/_next/')");
    expect(extraction).toContain("startsWith('/charte/')");
  });
});

describe('écrans volontaires — aucun actif manuel hors périmètre du SW', () => {
  const sources = [
    ...fichiersTsx(join(RACINE_SRC, 'app/volontaires')).sort(),
    CHEMIN_LAYOUT_RACINE,
  ];

  it('chaque <link>/<script> manuel pointe vers une URL couverte par le SW', () => {
    expect(sources.length).toBeGreaterThan(5);
    const hors: string[] = [];
    for (const chemin of sources) {
      const relatif = relative(RACINE_SRC, chemin).split(sep).join('/');
      for (const { url } of urlsDactifsManuels(readFileSync(chemin, 'utf8'))) {
        if (!estCouverte(url)) {
          hors.push(`${relatif} → ${url}`);
        }
      }
    }
    expect(
      hors,
      'actifs manuels échappant au SW (interdits : le shell serait sans style hors-ligne) :\n' +
        hors.join('\n'),
    ).toEqual([]);
  });
});

describe('socle et feuilles de route — branchement épinglé', () => {
  it("le layout RACINE importe socle.css : le socle vit dans le chunk global précaché à l'install", () => {
    const layout = readFileSync(CHEMIN_LAYOUT_RACINE, 'utf8');
    expect(layout).toContain("import './socle.css'");
    expect(layout).toContain("import './globals.css'");
    expect(layout).toContain("import './tokens-synchronises.css'");
  });

  it('les feuilles propres aux écrans restent importées par leurs pages (émises sous /_next/static)', () => {
    const pageFiche = readFileSync(
      fileURLToPath(new URL('./page.tsx', import.meta.url)),
      'utf8',
    );
    const pageScan = readFileSync(
      fileURLToPath(new URL('./scan/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(pageFiche).toContain("import './volontaires.css'");
    expect(pageScan).toContain("import './scan.css'");
  });

  it('dossiers.css (10.3) : hors du chunk partagé, référencé par /admin/dossiers SEULEMENT', () => {
    // La feuille est propre à une route ADMIN — hors du scope du SW
    // (/volontaires) et hors du chunk global : aucune page volontaires ne
    // l'importe (sinon elle quitterait le budget premier chargement et
    // l'isolation du périmètre offline).
    const pageDossiers = readFileSync(
      fileURLToPath(new URL('../admin/dossiers/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(pageDossiers).toContain("import './dossiers.css'");
    for (const chemin of fichiersTsx(join(RACINE_SRC, 'app/volontaires'))) {
      const source = readFileSync(chemin, 'utf8');
      expect(source, `${chemin} ne doit pas importer dossiers.css`).not.toContain(
        'dossiers.css',
      );
    }
  });
});
