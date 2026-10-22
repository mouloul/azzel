import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { siteTokens } from '@azzel/shared';

import {
  GLYPHE_LECTURE,
  PASTILLE_LECTURE,
  POSTER_DEGRADE_COULEURS,
} from '@/modules/retour-images/domain';

const SEUIL_COURANT = 4.5;
const SEUIL_GRAND_TEXTE = 3;
const SEUIL_NON_TEXTUEL = 3;

/** Extrait le bloc de déclarations d'une règle CSS par son sélecteur (règle
 *  ancrée en début de ligne : les variantes :hover/`:focus-visible` d'une
 *  même page ne masquent pas la règle de base). */
function extraireRegle(css: string, selecteur: string): string {
  const modele = new RegExp(
    `^${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const bloc = css.match(modele)?.[1];
  if (bloc === undefined) {
    throw new Error(`règle ${selecteur} absente du CSS lu`);
  }
  return bloc;
}

/*
 * Exemption WCAG 1.4.11 (contraste des éléments non textuels) : la frise kabyle
 * et la crête ocre sont purement décoratives (`aria-hidden`, jamais superposées
 * à du texte, jamais interactives) — aucun seuil de contraste ne s'applique à elles.
 * Les outlines de focus, eux, sont fonctionnels : vérifiés ci-dessous (focus/*).
 */

function hexVersCanaux(hex: string): [number, number, number] {
  const valeur = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(valeur)) {
    throw new Error(`couleur hexadécimale invalide : ${hex}`);
  }
  return [
    parseInt(valeur.slice(0, 2), 16),
    parseInt(valeur.slice(2, 4), 16),
    parseInt(valeur.slice(4, 6), 16),
  ];
}

function canalLineaire(canal: number): number {
  const s = canal / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminanceRelative(hex: string): number {
  const [r, v, b] = hexVersCanaux(hex);
  return (
    0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(v) + 0.0722 * canalLineaire(b)
  );
}

function ratioContraste(texte: string, fond: string): number {
  const l1 = luminanceRelative(texte);
  const l2 = luminanceRelative(fond);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

type NomRole =
  | keyof (typeof siteTokens.themes)['light']
  | keyof (typeof siteTokens.colors);

function couleur(theme: 'light' | 'dark', role: NomRole): string {
  const rolesTheme = Object.keys(siteTokens.themes[theme]);
  if (rolesTheme.includes(role)) {
    return siteTokens.themes[theme][role as keyof (typeof siteTokens.themes)['light']];
  }
  const rolesPalette = Object.keys(siteTokens.colors);
  const roleDunTheme =
    role in siteTokens.themes.light || role in siteTokens.themes.dark;
  if (!roleDunTheme && rolesPalette.includes(role)) {
    return siteTokens.colors[role as keyof typeof siteTokens.colors];
  }
  throw new Error(
    `rôle absent du thème ${theme} et interdit de repli palette : ${String(role)}`,
  );
}

type Paire = {
  nom: string;
  texte: NomRole;
  fond: NomRole;
  seuil: number;
  usage: string;
};

const PAIRES: readonly Paire[] = [
  {
    nom: 'ink / surface',
    texte: 'ink',
    fond: 'surface',
    seuil: SEUIL_COURANT,
    usage: 'texte courant',
  },
  {
    nom: 'ink / surface-raised',
    texte: 'ink',
    fond: 'surface-raised',
    seuil: SEUIL_COURANT,
    usage: 'texte courant sur cartes',
  },
  {
    nom: 'ink-muted / surface',
    texte: 'ink-muted',
    fond: 'surface',
    seuil: SEUIL_COURANT,
    usage: 'texte secondaire',
  },
  {
    nom: 'ink-muted / surface-raised',
    texte: 'ink-muted',
    fond: 'surface-raised',
    seuil: SEUIL_COURANT,
    usage: 'texte secondaire sur cartes piliers (14 px)',
  },
  {
    nom: 'heading / surface',
    texte: 'heading',
    fond: 'surface',
    seuil: SEUIL_COURANT,
    usage: 'titres < 24 px',
  },
  {
    nom: 'heading / surface-raised',
    texte: 'heading',
    fond: 'surface-raised',
    seuil: SEUIL_COURANT,
    usage: 'titres de cartes piliers (22 px)',
  },
  {
    nom: 'on-forest / forest-surface',
    texte: 'on-forest',
    fond: 'forest-surface',
    seuil: SEUIL_COURANT,
    usage: 'bande contact + égide',
  },
  {
    nom: 'on-forest / forest',
    texte: 'on-forest',
    fond: 'forest',
    seuil: SEUIL_COURANT,
    usage: 'hero (proxy uni sous voile ≥ 60 %)',
  },
  {
    nom: 'ochre-300 / forest',
    texte: 'ochre-300',
    fond: 'forest',
    seuil: SEUIL_COURANT,
    usage: 'eyebrow + emphasis du hero, 14 px (proxy uni)',
  },
  {
    nom: 'on-action / action',
    texte: 'on-action',
    fond: 'action',
    seuil: SEUIL_COURANT,
    usage: 'libellés de boutons (17 px)',
  },
  {
    nom: 'accent / surface',
    texte: 'accent',
    fond: 'surface',
    seuil: SEUIL_COURANT,
    usage: 'eyebrows 14 px — la charte réserve l’ocre au ≥ 24 px, accent tient le courant',
  },
  {
    nom: 'accent / surface-raised',
    texte: 'accent',
    fond: 'surface-raised',
    seuil: SEUIL_COURANT,
    usage: 'chips et accents sur cartes',
  },
  {
    nom: 'on-action / action-hover',
    texte: 'on-action',
    fond: 'action-hover',
    seuil: SEUIL_COURANT,
    usage: 'libellés de boutons au survol (17 px)',
  },
  {
    nom: 'highlight / surface',
    texte: 'highlight',
    fond: 'surface',
    seuil: SEUIL_GRAND_TEXTE,
    usage: 'grands chiffres — documenté ≥ 24 px uniquement (96 px)',
  },
  {
    nom: 'ochre-300 / forest-surface',
    texte: 'ochre-300',
    fond: 'forest-surface',
    seuil: SEUIL_GRAND_TEXTE,
    usage: 'bande forêt : plus rendu < 24 px (eyebrow contact corrigé en on-forest, 3,35:1 en sombre) — réservé au grand texte',
  },
  {
    nom: 'focus / surface',
    texte: 'focus',
    fond: 'surface',
    seuil: SEUIL_NON_TEXTUEL,
    usage: 'outline de focus (non textuel)',
  },
  {
    nom: 'focus / surface-raised',
    texte: 'focus',
    fond: 'surface-raised',
    seuil: SEUIL_NON_TEXTUEL,
    usage: 'outline de focus sur cartes (non textuel)',
  },
  {
    nom: 'focus forêt (outline on-forest) / forest-surface',
    texte: 'on-forest',
    fond: 'forest-surface',
    seuil: SEUIL_NON_TEXTUEL,
    usage: 'outline de focus rendu sur bande forêt + hero (corrigé 1.4.11 : var(--focus) brut ≈ 2,2:1 en clair, interdit sur fond forêt)',
  },
];

describe('ratioContraste — fonction pure WCAG', () => {
  it('noir sur blanc : 21:1', () => {
    expect(ratioContraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('couleurs identiques : 1:1', () => {
    expect(ratioContraste('#F4F0E6', '#F4F0E6')).toBe(1);
  });

  it('limite AA connue : #767676 sur blanc ≈ 4,54:1', () => {
    expect(ratioContraste('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('le ratio est symétrique', () => {
    expect(ratioContraste('#2A2B2E', '#F4F0E6')).toBeCloseTo(
      ratioContraste('#F4F0E6', '#2A2B2E'),
      10,
    );
  });
});

for (const theme of ['light', 'dark'] as const) {
  describe(`contrastes WCAG — thème ${theme} (siteTokens)`, () => {
    for (const paire of PAIRES) {
      it(`${paire.nom} — ${paire.usage} — ≥ ${paire.seuil}:1`, () => {
        const ratio = ratioContraste(couleur(theme, paire.texte), couleur(theme, paire.fond));
        expect(ratio, `${paire.nom} (${paire.usage}) : ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(
          paire.seuil,
        );
      });
    }
  });
}

/* Paire NON rendue et non rendable : ink-muted sur bande forêt tombe à ≈1,95:1
 * en clair (4,79:1 en sombre — un thème seul ne suffirait jamais). L'encre
 * secondaire est donc interdite sur forest-surface : on-forest obligatoire.
 * Ce garde empêche tout ajout silencieux de la paire aux PAIRES ci-dessus. */
describe('contrastes WCAG — paire interdite (jamais rendue)', () => {
  it('ink-muted / forest-surface ne tient pas AA en clair — texte secondaire interdit sur bande forêt', () => {
    const ratio = ratioContraste(
      couleur('light', 'ink-muted'),
      couleur('light', 'forest-surface'),
    );
    expect(ratio).toBeLessThan(SEUIL_COURANT);
  });
});

/* Story 2.5 — poster du trailer : le dégradé forêt et la pastille de lecture
 * « vert altitude » sont des hex fixes (pas des rôles de thème) : le poster
 * remplace une image, identique dans les deux thèmes. Sources uniques des
 * couleurs : modules/retour-images/domain.ts — le garde ci-dessous lit le CSS
 * réellement servi et vérifie que chaque hex s'y trouve dans la règle
 * correspondante (précédent tokens-css.test : le CSS peut trahir les constantes). */
describe('contrastes WCAG — poster trailer (story 2.5)', () => {
  for (const stop of POSTER_DEGRADE_COULEURS) {
    it(`pastille lecture (vert altitude) / dégradé ${stop} — ≥ 3:1 (non textuel, 1.4.11)`, () => {
      const ratio = ratioContraste(PASTILLE_LECTURE, stop);
      expect(ratio, `pastille ${PASTILLE_LECTURE} sur ${stop} : ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(
        SEUIL_NON_TEXTUEL,
      );
    });

    it(`libellé on-forest / dégradé ${stop} — ≥ 4,5:1 (texte 15 px)`, () => {
      for (const theme of ['light', 'dark'] as const) {
        const ratio = ratioContraste(couleur(theme, 'on-forest'), stop);
        expect(
          ratio,
          `on-forest (${theme}) sur ${stop} : ${ratio.toFixed(3)}:1`,
        ).toBeGreaterThanOrEqual(SEUIL_COURANT);
      }
    });
  }

  it('glyphe triangle / pastille vert altitude — ≥ 3:1 (non textuel, invariant)', () => {
    const ratio = ratioContraste(GLYPHE_LECTURE, PASTILLE_LECTURE);
    expect(
      ratio,
      `glyphe ${GLYPHE_LECTURE} sur pastille ${PASTILLE_LECTURE} : ${ratio.toFixed(3)}:1`,
    ).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
  });

  it('vitrine-textes.css servit exactement les hex du domaine dans les règles du poster', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./vitrine-textes.css', import.meta.url)),
      'utf8',
    ).toLowerCase();
    const poster = extraireRegle(css, '.aa-trailer__poster');
    for (const stop of POSTER_DEGRADE_COULEURS) {
      expect(
        poster,
        `${stop} doit figurer dans le dégradé de .aa-trailer__poster`,
      ).toContain(stop.toLowerCase());
    }
    const play = extraireRegle(css, '.aa-trailer__play');
    expect(play, `${PASTILLE_LECTURE} est le fond de la pastille`).toContain(
      PASTILLE_LECTURE.toLowerCase(),
    );
    expect(play, `${GLYPHE_LECTURE} est la couleur du glyphe`).toContain(
      GLYPHE_LECTURE.toLowerCase(),
    );
  });
});
