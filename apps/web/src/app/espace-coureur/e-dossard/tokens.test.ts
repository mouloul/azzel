import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { operationsTokens } from '@azzel/shared';

// Le QR encode ses modules en encre operationsTokens.texte sur blanc, et les
// seuls littéraux hex restants du CSS sont les blancs du support QR
// (contrainte de lisibilité du scanner, pas une couleur de charte).

const cssBrut = readFileSync(
  fileURLToPath(new URL('./e-dossard.css', import.meta.url)),
  'utf8',
);
const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, '');
const pageSource = readFileSync(
  fileURLToPath(new URL('./page.tsx', import.meta.url)),
  'utf8',
);

describe('e-dossard — habillage aligné sur le parcours d’inscription', () => {
  it('plus de carte sombre : le CSS ne référence plus les variables *-sombre', () => {
    expect(css).not.toContain('-sombre)');
  });

  it('QR : modules encre = operationsTokens.texte, sur blanc', () => {
    expect(pageSource).toContain(`const QR_ENCRE = '${operationsTokens.colors.texte}';`);
    expect(pageSource).toContain("const QR_BLANC = '#FFFFFF';");
  });

  it('aucune couleur hors contrat dans le CSS (seuls les blancs QR restent, en nombre exact)', () => {
    // Les #FFFFFF du support QR sont la seule exception (lisible au scanner,
    // pas une couleur de charte) : leur nombre est ÉPINGLÉ — il ne peut que
    // décroître. Tout autre littéral échoue (voir aussi
    // app/css-sans-litteraux.test.ts, garde général).
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex).toEqual(['#FFFFFF', '#FFFFFF', '#FFFFFF']);
  });
});
