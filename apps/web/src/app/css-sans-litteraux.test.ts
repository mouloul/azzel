import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 9.1 — garde-fou anti-littéraux : aucune couleur hexadécimale ni
 * notation fonctionnelle littérale (rgb/rgba/hsl/hsla hors var(…)) ne doit
 * apparaître dans une feuille CSS écrite à la main. Le fichier généré
 * tokens-synchronises.css est exclu (régénéré par pnpm -F @azzel/web tokens:sync).
 *
 * Périmètre : littéraux HEX (#rgb, #rrggbb, #rrggbbaa…) hors commentaires —
 * la métrique de l'audit 9.1 (33 littéraux) compte les hex ; les rgb()/rgba()
 * à base tokenisée ont été converties en color-mix(var(…)) dans la même passe.
 * Revue épopée 9 (I2) : la détection couvre AUSSI les notations fonctionnelles
 * dont l'argument n'est pas un var(…) — la story 9.2 en avait introduit
 * (voiles du hero) invisibles au garde hex.
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
  {
    fichier: 'app/volontaires/scan/scan.css',
    litteral: 'rgba(12,22,16,0.96)',
    nombre: 1,
    raison:
      'voile de l’écran caméra : #0C1610 n’a aucun token exact (bg-sombre = #101A14) — épinglé SANS modification, scan.css est suivi par la session épopée 10 (hors périmètre revue 9).',
  },
  {
    fichier: 'app/volontaires/scan/scan.css',
    litteral: 'rgba(12,22,16,0.9)',
    nombre: 1,
    raison:
      'voile de la page d’attente scan : même vert #0C1610 sans token exact — épinglé SANS modification (hors périmètre revue 9).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(15,36,26,0.85)',
    nombre: 2,
    raison:
      'voile clair du hero (#0F241A : aucun token exact — forest #183A2B, forest-800 #122C20 ; --surface ne vaut #0F241A qu’en thème sombre). Opacités MESURÉES sur la photo (spec 9.2, contraste on-forest) : identité de rendu exigée.',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(15,36,26,0.7)',
    nombre: 2,
    raison: 'voile clair du hero, arrêt médian et 65 % — voir rgba(15,36,26,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(15,36,26,0.1)',
    nombre: 1,
    raison: 'voile clair du hero (variante courte, arrêt 75 %) — voir rgba(15,36,26,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(15,36,26,0.8)',
    nombre: 1,
    raison: 'voile plein écran du hero, arrêt haut — voir rgba(15,36,26,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(15,36,26,0.68)',
    nombre: 1,
    raison: 'voile plein écran du hero, arrêt 30 % — voir rgba(15,36,26,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(15,36,26,0.24)',
    nombre: 2,
    raison:
      'ombres de l’onglet et de l’encart « Mon trail » : même vert #0F241A sans token exact, posées à l’identique dans les deux thèmes — une var() thématique changerait le rendu.',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(8,18,13,0.85)',
    nombre: 2,
    raison:
      'voile sombre du hero (#08120D : aucun token — plus sombre que --surface sombre #0F241A). Arrêts MESURÉS (spec 9.2) : identité de rendu exigée.',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(8,18,13,0.78)',
    nombre: 1,
    raison: 'voile sombre du hero (variante courte, arrêt 40 %) — voir rgba(8,18,13,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(8,18,13,0.3)',
    nombre: 1,
    raison: 'voile sombre du hero (variante courte, arrêt 75 %) — voir rgba(8,18,13,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(8,18,13,0.82)',
    nombre: 1,
    raison: 'voile sombre plein écran, arrêt haut — voir rgba(8,18,13,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(8,18,13,0.7)',
    nombre: 1,
    raison: 'voile sombre plein écran, arrêt 30 % — voir rgba(8,18,13,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(8,18,13,0.72)',
    nombre: 1,
    raison: 'voile sombre plein écran, arrêt 65 % — voir rgba(8,18,13,0.85).',
  },
  {
    fichier: 'app/globals.css',
    litteral: 'rgba(42,43,46,0.1)',
    nombre: 1,
    raison:
      'doublure de repli de .aa-photo pour navigateurs sans color-mix() : la déclaration SUIVANTE porte déjà la version tokenisée (var(--ink) 10 %) ; convertir la doublure la rendrait inutile et la retirerait priverait les vieux navigateurs du fond du squelette.',
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

/** Notations fonctionnelles de couleur, un niveau de parenthèses imbriquées
 * (pour lire rgba(var(--x) / 0.5) en entier). Un argument qui contient var(…)
 * est tokenisé : pas un littéral. */
const NOTATION_FONCTIONNELLE = /\b(?:rgba?|hsla?)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

/** Clé normalisée d'une notation : minuscules, sans espaces, décimales
 * abrégées développées — rgba(15,36,26,.85) et rgba(15, 36, 26, 0.85)
 * comptent ensemble. */
function normaliserNotation(notation: string): string {
  return notation
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/([(,])\.(\d)/g, '$10.$2');
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
    const parLittéral = new Map<string, number>();
    const compter = (cle: string) => {
      parLittéral.set(cle, (parLittéral.get(cle) ?? 0) + 1);
    };
    for (const hex of sansCommentaires.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      compter(hex.toLowerCase());
    }
    for (const correspondance of sansCommentaires.matchAll(NOTATION_FONCTIONNELLE)) {
      if ((correspondance[1] ?? '').includes('var(')) continue;
      compter(normaliserNotation(correspondance[0]));
    }
    if (parLittéral.size === 0) continue;
    compte.set(relatif, parLittéral);
  }
  return compte;
}

describe('CSS écrit à la main — zéro couleur littérale (hex et notation fonctionnelle) hors exceptions (story 9.1, revue 9-I2)', () => {
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
