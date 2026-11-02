import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { operationsTokens, siteTokens } from '@azzel/shared';

/* Story 9.1 — le socle de classes sémantiques (socle.css) porte des contraintes
 * non négociables : aucune couleur littérale, cibles interactives ≥ 44 px,
 * focus 2 px + décalage (fond clair ET fond forêt), contrastes AA/3:1. Ce garde
 * lit le CSS réellement écrit — même principe que contrastes.test.ts. */

const css = readFileSync(
  fileURLToPath(new URL('./socle.css', import.meta.url)),
  'utf8',
);

/* Bloc @media brut (avant normalisation) pour l’assertion reduced-motion. */
const mediaBrut =
  css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

/* Sélecteurs composés écrits sur plusieurs lignes : normalise les blancs. */
const cssNormalise = css.replace(/\s+/g, ' ');

function regle(selecteur: string): string {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cssNormalise.match(new RegExp(`${echappe}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function canalLineaire(canal: number): number {
  const s = canal / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminanceRelative(hex: string): number {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(g) + 0.0722 * canalLineaire(b);
}

function ratioContraste(a: string, b: string): number {
  const l1 = luminanceRelative(a);
  const l2 = luminanceRelative(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe('socle.css — story 9.1 : aucune couleur littérale', () => {
  it('zéro hex, zéro rgb()/rgba()/hsl() numérique', () => {
    const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sansCommentaires.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(sansCommentaires.match(/rgba?\(\s*[\d.]/g) ?? []).toEqual([]);
    expect(sansCommentaires.match(/hsla?\(\s*[\d.]/g) ?? []).toEqual([]);
  });
});

describe('socle.css — cibles interactives ≥ 44 px, focus 2 px + décalage', () => {
  it('action pilule : min-height 44 px, rayon pilule', () => {
    const action = regle('.socle-action');
    expect(action).toContain('min-height: 44px');
    expect(action).toContain('border-radius: var(--az-radius-full)');
  });

  it('champ de saisie : min-height 48 px, bordure de contrôle line-strong', () => {
    const saisie = regle('.socle-champ :is(input, select, textarea)');
    expect(saisie).toContain('min-height: 48px');
    expect(saisie).toContain('border: 1.5px solid var(--az-filet-controle)');
  });

  it('focus par défaut : outline 2 px var(--az-focus) + décalage 2 px', () => {
    const focus = regle('.socle-action:focus-visible, .socle-champ :is(input, select, textarea):focus-visible');
    expect(focus).toContain('outline: 2px solid var(--az-focus)');
    expect(focus).toContain('outline-offset: 2px');
  });

  it('focus sur fond forêt : outline on-forest + halo forest-surface (var(--focus) ≈ 2,2:1, cf. globals.css)', () => {
    const focus = regle('.socle-sur-foret :is(a, button, input, select, textarea):focus-visible');
    expect(focus).toContain('outline: 2px solid var(--on-forest)');
    expect(focus).toContain('outline-offset: 2px');
    expect(focus).toContain('box-shadow: 0 0 0 4px var(--forest-surface)');
  });

  it('carte : rayon opérationnel 16 px (--az-rayon-md)', () => {
    expect(regle('.socle-carte')).toContain('border-radius: var(--az-rayon-md)');
  });

  it('chip : rayon pilule, libellé secondaire', () => {
    const chip = regle('.socle-chip');
    expect(chip).toContain('border-radius: var(--az-radius-full)');
    expect(chip).toContain('color: var(--az-texte-2)');
  });

  it('prefers-reduced-motion neutralise la transition introduite', () => {
    expect(mediaBrut).toContain('.socle-action');
    expect(mediaBrut).toContain('transition: none');
  });
});

describe('socle.css — contrastes calculés (WCAG)', () => {
  it('pastilles d’état : point ≥ 3:1 sur la surface des DEUX thèmes (1.4.11)', () => {
    const etats = [
      ['succes', 'succes-sombre'],
      ['danger', 'danger-sombre'],
      ['attention', 'attention-sombre'],
      ['sync-attente', 'sync-attente-sombre'],
      ['sync-envoye', 'sync-envoye-sombre'],
    ] as const;
    for (const [clair, sombre] of etats) {
      const ratioClair = ratioContraste(
        operationsTokens.colors[clair],
        siteTokens.themes.light.surface,
      );
      expect(
        ratioClair,
        `${clair} (#clair) sur surface claire : ${ratioClair.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(3);
      const ratioSombre = ratioContraste(
        operationsTokens.colors[sombre],
        siteTokens.themes.dark.surface,
      );
      expect(
        ratioSombre,
        `${sombre} sur surface sombre : ${ratioSombre.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('action contour : ence --az-action ≥ 4,5:1 sur cartes des deux thèmes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const ratio = ratioContraste(
        siteTokens.themes[theme].action,
        siteTokens.themes[theme]['surface-raised'],
      );
      expect(
        ratio,
        `action (${theme}) sur surface-raised (${theme}) : ${ratio.toFixed(3)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
