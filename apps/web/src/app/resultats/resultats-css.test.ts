import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 9.6 — garde du reflux de /resultats au zoom 200 % (viewport ~195 px).
 * Mesuré au harnais CDP avant ces règles : la recherche forçait 249 px de
 * défilement horizontal (deux pistes 1fr figées par la largeur intrinsèque
 * des contrôles natifs), le podium débordait pareil (temps mono insécutable).
 * Même principe que dossier-css.test.ts : le CSS réellement écrit porte les
 * contrats non négociables. Les couleurs restent interdites par
 * css-sans-litteraux.test.ts (ce fichier est scanné). */

const css = readFileSync(fileURLToPath(new URL('./resultats.css', import.meta.url)), 'utf8');

const cssNormalise = css.replace(/\s+/g, ' ');

function regle(selecteur: string): string {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cssNormalise.match(new RegExp(`${echappe}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

/** Bloc du media téléphone (max-width:640px), extrait du CSS brut puis normalisé. */
function blocMobile(): string {
  const brut = css.match(/@media \(max-width:640px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  return brut.replace(/\s+/g, ' ');
}

describe('resultats.css — reflux zoom 200 % (story 9.6)', () => {
  it('blocs réellement rétractables : min-width 0 sur les items des grilles de page', () => {
    expect(regle('.resultats-live > *, .resultats-epreuves > *')).toContain('min-width: 0');
  });

  it('recherche : pistes fluides — une colonne sous ~300 px, le duo au-delà', () => {
    expect(cssNormalise).toContain(
      'repeat(auto-fit,minmax(min(8rem,100%),1fr))',
    );
    // La règle fluide vit bien dans le media téléphone, pas seulement en desktop.
    expect(blocMobile()).toContain('min(8rem,100%)');
  });

  it('podium : la carte peut passer à la ligne au lieu de déborder (temps mono insécutable)', () => {
    expect(blocMobile()).toMatch(/\.resultats-podium-carte\{[^}]*flex-wrap:\s*wrap/);
  });

  it('derniers arrivés : la ligne peut passer le temps à la ligne (mono insécable)', () => {
    expect(blocMobile()).toMatch(/\.resultats-arrive\{[^}]*flex-wrap:\s*wrap/);
  });

  it('le tableau garde sa zone de défilement dédiée : jamais le page entière qui défile', () => {
    expect(regle('.resultats-defile')).toContain('overflow-x:auto');
  });
});
