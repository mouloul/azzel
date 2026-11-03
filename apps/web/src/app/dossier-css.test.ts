import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 9.4 — garde du CSS du parcours de dossier (dossier.css), même
 * principe que socle.test.ts : le CSS réellement écrit porte les contrats
 * non négociables. Les couleurs littérales sont déjà interdites partout par
 * css-sans-litteraux.test.ts (ce fichier est scanné). */

const css = readFileSync(fileURLToPath(new URL('./dossier.css', import.meta.url)), 'utf8');

const cssNormalise = css.replace(/\s+/g, ' ');

function regle(selecteur: string): string {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cssNormalise.match(new RegExp(`${echappe}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('dossier.css — fil d’étapes : courante par la forme et le texte', () => {
  it('marqueur de l’étape courante : disque plein + double filet (forme distincte)', () => {
    const courante = regle('.fil-etape--courante .fil-etape-marqueur');
    expect(courante).toContain('background: var(--az-action)');
    expect(courante).toContain('box-shadow: 0 0 0 2px var(--az-surface), 0 0 0 4px var(--az-action)');
  });

  it('marqueur fait : disque plein vert portant le glyphe ✓ (jamais la couleur seule)', () => {
    const fait = regle('.fil-etape--fait .fil-etape-marqueur');
    expect(fait).toContain('background: var(--az-succes)');
    expect(fait).toContain('color: var(--az-succes-encre)');
  });

  it('étapes à faire et suite : disque creux (la forme diffère de la courante et de la faite)', () => {
    const marqueur = regle('.fil-etape-marqueur');
    expect(marqueur).toContain('border: 2px solid var(--az-filet-controle)');
    expect(marqueur).toContain('background: var(--az-surface)');
  });
});

describe('dossier.css — cibles interactives ≥ 44 px, écarts ≥ 8 px', () => {
  it('lien de retour du fil : min-height 44 px', () => {
    const lien = regle('.fil-etape-lien, .fil-etape-corps');
    expect(lien).toContain('min-height: 44px');
  });

  it('actions de la checklist : cibles pleines ≥ 44 px (actives comme neutralisées)', () => {
    expect(regle('.checklist-action')).toContain('min-height: 44px');
    expect(regle('.checklist-action-inactive')).toContain('min-height: 44px');
  });

  it('écart entre étapes du fil ≥ 8 px (--az-space-2)', () => {
    expect(regle('.fil-etapes')).toContain('gap: var(--az-space-2)');
  });

  it('mentions « (obligatoire) » : texte secondaire AA, jamais un astérisque coloré', () => {
    const mention = regle('.champ-obligatoire');
    expect(mention).toContain('color: var(--az-texte-2)');
  });
});

describe('dossier.css — téléphone : une colonne, récapitulatif sous le formulaire', () => {
  it('par défaut .dossier-edition est une grille SANS colonnes imposées (empilement)', () => {
    const edition = regle('.dossier-edition');
    expect(edition).toContain('display: grid');
    expect(edition).not.toContain('grid-template-columns');
  });

  it('largeur écran : deux colonnes posées uniquement au-delà de 960 px', () => {
    const blocLarge = cssNormalise.slice(cssNormalise.indexOf('@media (min-width: 960px)'));
    expect(blocLarge).toMatch(/\.dossier-edition\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 18rem/);
    // La règle de base reste hors media query : le téléphone n'hérite pas des colonnes.
    expect(cssNormalise.indexOf('.dossier-edition')).toBeLessThan(
      cssNormalise.indexOf('@media (min-width: 960px)'),
    );
  });
});

describe('dossier.css — checklist : la forme porte l’état, pas la couleur seule', () => {
  it('puce à faire : anneau creux ; puce faite : disque plein', () => {
    expect(regle('.checklist-puce')).toContain('background: transparent');
    expect(regle('.checklist-puce')).toContain('border: 2px solid var(--az-filet-controle)');
    expect(regle('.checklist-item--fait .checklist-puce')).toContain(
      'background: var(--az-succes)',
    );
  });
});
