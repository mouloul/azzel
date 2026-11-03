import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 10.2 — garde-fou anti-littéraux de l'app coureurs, modèle du
 * css-sans-litteraux.test.ts du web : aucune couleur hexadécimale dans les
 * sources .ts/.tsx hors tests — tout passe par les tokens de @azzel/shared
 * (theme.ts, ou référence directe tokens.colors pour les couleurs FIXES de
 * la carte e-dossard, indépendantes du mode clair/sombre).
 *
 * Les couleurs apparaissent en littéraux de chaîne ('#FFFFFF') : la recherche
 * cible les hex ENTRE GUILLEMETS, ce qui ignore commentaires et URL sans
 * parsing de source.
 *
 * Exceptions : liste explicite ci-dessous, avec raison et NOMBRE ÉPINGLÉ.
 * - un nouveau littéral quelque part → échec ;
 * - une occurrence en plus sur une exception → échec ;
 * - une occurrence en moins (littéral supprimé) → échec aussi : retire
 *   l'entrée périmée. Le total ne peut donc que décroître, jamais dériver. */

const RACINE_SRC = dirname(fileURLToPath(import.meta.url));

type Exception = {
  fichier: string;
  litteral: string;
  nombre: number;
  raison: string;
};

const EXCEPTIONS: readonly Exception[] = [
  {
    fichier: 'ecrans/edossard.tsx',
    litteral: '#ffffff',
    nombre: 1,
    raison:
      'blanc PUR du support du QR (const QR_BLANC) : contrainte de lisibilité du scanner, pas une couleur de charte — ne doit suivre ni le thème ni les tokens (même exception que le web : e-dossard.css #FFFFFF ×3).',
  },
];

function fichiersSources(racine: string): string[] {
  const fichiers: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      fichiers.push(...fichiersSources(chemin));
    } else if (
      (entree.endsWith('.ts') || entree.endsWith('.tsx')) &&
      !entree.endsWith('.test.ts') &&
      !entree.endsWith('.test.tsx')
    ) {
      fichiers.push(chemin);
    }
  }
  return fichiers;
}

function littérauxParFichier(): Map<string, Map<string, number>> {
  const compte = new Map<string, Map<string, number>>();
  for (const chemin of fichiersSources(RACINE_SRC)) {
    const relatif = relative(RACINE_SRC, chemin).split(sep).join('/');
    const contenu = readFileSync(chemin, 'utf8');
    const trouves = contenu.match(/['"`](#[0-9a-fA-F]{3,8})['"`]/g) ?? [];
    if (trouves.length === 0) continue;
    const parLittéral = new Map<string, number>();
    for (const citation of trouves) {
      const hex = citation.slice(1, -1).toLowerCase();
      parLittéral.set(hex, (parLittéral.get(hex) ?? 0) + 1);
    }
    compte.set(relatif, parLittéral);
  }
  return compte;
}

describe('sources app coureurs — zéro couleur hexadécimale hors exceptions (story 10.2)', () => {
  const reels = littérauxParFichier();

  it('chaque exception correspond exactement à la réalité (nombre épinglé)', () => {
    for (const { fichier, litteral, nombre, raison } of EXCEPTIONS) {
      const actuel = reels.get(fichier)?.get(litteral.toLowerCase()) ?? 0;
      expect(
        actuel,
        `${fichier} : ${litteral} — ${raison}\n` +
          'actuel < attendu : littéral supprimé, retire l’exception périmée ; actuel > attendu : nouvelles occurrences interdites',
      ).toBe(nombre);
    }
  });

  it('aucun littéral en dehors des exceptions', () => {
    const autorisés = new Set(
      EXCEPTIONS.map(({ fichier, litteral }) => `${fichier}:${litteral.toLowerCase()}`),
    );
    const imprévus: string[] = [];
    for (const [fichier, parLittéral] of reels) {
      for (const [hex] of parLittéral) {
        if (!autorisés.has(`${fichier}:${hex}`)) {
          imprévus.push(`${fichier} : ${hex}`);
        }
      }
    }
    expect(imprévus, `nouveaux littéraux interdits (passe par un token) :\n${imprévus.join('\n')}`).toEqual([]);
  });
});
