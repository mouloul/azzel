// Story 11.1 — CLI du pipeline GPX → parcours.json (shim mince).
//
// Usage : pnpm -F @azzel/web parcours:build [--nouvelle-version]
// Build-time uniquement — jamais appelé au runtime ni par `pnpm build`.
// La logique (codes de sortie compris) vit dans src/modules/contenus/parcours/cli.ts.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executerCli } from '../src/modules/contenus/parcours/cli';
import type { FsPipeline } from '../src/modules/contenus/parcours/pipeline';

const racineWeb = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const racineRepo = path.dirname(path.dirname(racineWeb));

const fsReel: FsPipeline = {
  lireFichier: (chemin) => readFile(chemin, 'utf8'),
  fichierExiste: (chemin) => Promise.resolve(existsSync(chemin)),
  ecrireFichier: (chemin, contenu) => writeFile(chemin, contenu, 'utf8'),
};

async function main(): Promise<number> {
  const resultat = await executerCli({
    args: process.argv.slice(2),
    racineWeb,
    racineRepo,
    fs: fsReel,
  });
  for (const ligne of resultat.lignes) {
    if (resultat.code === 0) {
      console.info(ligne);
    } else {
      console.error(ligne);
    }
  }
  return resultat.code;
}

main().then((code) => {
  process.exitCode = code;
});
