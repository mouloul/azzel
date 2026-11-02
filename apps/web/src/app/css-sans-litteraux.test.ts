import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 9.1 — garde-fou anti-littéraux : aucune couleur hexadécimale ne doit
 * apparaître dans une feuille CSS écrite à la main. Le fichier généré
 * tokens-synchronises.css est exclu (régénéré par pnpm -F @azzel/web tokens:sync).
 *
 * Périmètre : littéraux HEX (#rgb, #rrggbb, #rrggbbaa…) hors commentaires —
 * la métrique de l'audit 9.1 (33 littéraux) compte les hex ; les rgb()/rgba()
 * à base tokenisée ont été converties en color-mix(var(…)) dans la même passe,
 * celles à base non tokenisée restent documentées dans leurs fichiers.
 *
 * Exceptions : liste explicite ci-dessous, avec raison et NOMBRE ÉPINGLÉ.
 * - un nouveau littéral quelque part → échec ;
 * - une occurrence en plus sur une exception → échec ;
 * - une occurrence en moins (littéral supprimé) → échec aussi : retire
 *   l'entrée périmée. Le total ne peut donc que décroître, jamais dériver. */

const RACINE_SRC = fileURLToPath(new URL('./..', import.meta.url));
const FICHIER_GENERE = 'app/tokens-synchronises.css';

type Exception = {
  fichier: string;
  litteral: string;
  nombre: number;
  raison: string;
};

const EXCEPTIONS: readonly Exception[] = [
  {
    fichier: 'app/volontaires/scan/scan.css',
    litteral: '#0C1610',
    nombre: 1,
    raison:
      'fond de l’écran caméra : valeur historique ≠ bg-sombre (#101A14) — la remplacer par le token changerait le rendu, interdit en 9.1. Arbitrage (token dédié ou alignement sur bg-sombre) à trancher avant réutilisation.',
  },
  {
    fichier: 'app/volontaires/scan/scan.css',
    litteral: '#FFD9D6',
    nombre: 1,
    raison:
      'encre du bouton d’appel du voyant inconnu : teinte claire du danger non tokenisée, aucune variable ne vaut cette couleur ; identité de rendu exigée. À tokeniser si elle ressert.',
  },
  {
    fichier: 'app/espace-coureur/e-dossard/e-dossard.css',
    litteral: '#FFFFFF',
    nombre: 3,
    raison:
      'blanc du support du QR (carte, zone QR, override sombre) : contrainte de lisibilité du scanner — modules clairs purs, pas une couleur de charte ; ne doit pas suivre le thème.',
  },
];

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

function littérauxParFichier(): Map<string, Map<string, number>> {
  const compte = new Map<string, Map<string, number>>();
  for (const chemin of feuillesCss(RACINE_SRC)) {
    const relatif = relative(RACINE_SRC, chemin).split(sep).join('/');
    if (relatif === FICHIER_GENERE) continue;
    const sansCommentaires = readFileSync(chemin, 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const trouves = sansCommentaires.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    if (trouves.length === 0) continue;
    const parLittéral = new Map<string, number>();
    for (const hex of trouves) {
      const clé = hex.toLowerCase();
      parLittéral.set(clé, (parLittéral.get(clé) ?? 0) + 1);
    }
    compte.set(relatif, parLittéral);
  }
  return compte;
}

describe('CSS écrit à la main — zéro couleur hexadécimale hors exceptions (story 9.1)', () => {
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
