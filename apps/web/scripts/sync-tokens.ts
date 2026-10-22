// Story 2.3 — synchronise les tokens de design (packages/shared → siteTokens)
// dans un fichier CSS statique. Historique : les tokens étaient injectés en
// <style> inline par le layout, ce qui les dupliquait dans CHAQUE page HTML et
// dans le payload RSC (~11 Ko décodés sur l’accueil). En fichier CSS, ils sont
// servis une fois, précompressés — nécessaire au budget < 300 Ko maintenant que
// l’accueil est rendu dynamiquement (section partenaires, FR-22).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTokensCss } from '../src/lib/tokens-css';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cible = path.join(webRoot, 'src', 'app', 'tokens-synchronises.css');

const enTete = `/* FICHIER GÉNÉRÉ — ne pas éditer à la main.
 * Source : packages/shared (siteTokens/operationsTokens) via src/lib/tokens-css.ts.
 * Régénérer : pnpm -F @azzel/web tokens:sync (aussi exécuté avant chaque build).
 */

`;

mkdirSync(path.dirname(cible), { recursive: true });
writeFileSync(cible, enTete + buildTokensCss() + '\n', 'utf8');
console.info(`Tokens synchronisés : ${path.relative(webRoot, cible)}`);
