import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Recette du 04/11/2026 — deux `var(--space-5)` / `var(--space-10)` écrits dans
 * globals.css ne correspondaient à AUCUN token (l'échelle va de 1,2,3,4,6,8 à
 * 12,16,24). CSS jette la déclaration entière sans un mot : la marge ne
 * s'appliquait pas, et rien ne le signalait — ni le build, ni les tests, ni
 * l'écran (l'espace existait par ailleurs). Ce test refuse toute variable
 * référencée mais jamais définie.
 */
const RACINE_SRC = fileURLToPath(new URL('./..', import.meta.url));

/** Variables posées par le navigateur ou par JS, jamais déclarées en CSS. */
const EXTERNES: readonly string[] = [];

function feuillesCss(racine: string): string[] {
  const fichiers: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      fichiers.push(...feuillesCss(chemin));
    } else if (entree.endsWith('.css')) {
      fichiers.push(chemin);
    }
  }
  return fichiers;
}

describe('CSS — toute variable utilisée est définie quelque part', () => {
  const feuilles = feuillesCss(RACINE_SRC);
  const definies = new Set<string>(EXTERNES);
  const references = new Map<string, string[]>();

  for (const chemin of feuilles) {
    const relatif = relative(RACINE_SRC, chemin).split(sep).join('/');
    const css = readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const correspondance of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
      const nom = correspondance[1];
      if (nom !== undefined) {
        definies.add(nom);
      }
    }
    for (const correspondance of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      const nom = correspondance[1];
      if (nom === undefined) {
        continue;
      }
      const vues = references.get(nom) ?? [];
      if (!vues.includes(relatif)) {
        vues.push(relatif);
      }
      references.set(nom, vues);
    }
  }

  it('au moins une feuille est analysée (le test ne passe pas à vide)', () => {
    expect(feuilles.length).toBeGreaterThan(0);
    expect(definies.size).toBeGreaterThan(20);
  });

  it('aucune var(--x) sans déclaration correspondante', () => {
    const orphelines = [...references.entries()]
      .filter(([nom]) => !definies.has(nom))
      .map(([nom, fichiers]) => `${nom} — utilisée dans ${fichiers.join(', ')}`);
    expect(
      orphelines,
      `variables jamais définies (la déclaration CSS entière est ignorée en silence) :\n${orphelines.join('\n')}`,
    ).toEqual([]);
  });
});
