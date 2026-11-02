import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { operationsTokens } from '@azzel/shared';

// Story 4.1 (revue) puis 9.1 — la carte sombre et le QR utilisaient des
// littéraux hex épinglés aux valeurs d'operationsTokens. Depuis la story 9.1,
// la carte sombre lit les variables distinctes --az-*-sombre (invariantes de
// thème) : la dérive est impossible PAR CONSTRUCTION (la variable résout
// toujours vers le token). Ce garde vérifie donc que le CSS référence les
// BONNES variables — une inversion de rôle resterait attrapée — et que les
// seuls littéraux restants sont les blancs du support QR (contrainte de
// lisibilité du scanner, pas une couleur de charte).

const cssBrut = readFileSync(
  fileURLToPath(new URL('./e-dossard.css', import.meta.url)),
  'utf8',
);
const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, '');
const pageSource = readFileSync(
  fileURLToPath(new URL('./page.tsx', import.meta.url)),
  'utf8',
);

describe('e-dossard — carte sombre branchée sur les variables --az-*-sombre (story 9.1)', () => {
  it('les 4 rôles de la carte pointent les variables des tokens sombres', () => {
    const attendus: Record<string, string> = {
      '--edossard-fond': 'var(--az-bg-sombre)',
      '--edossard-encre': 'var(--az-texte-sombre)',
      '--edossard-encre-2': 'var(--az-texte-2-sombre)',
      '--edossard-accent': 'var(--az-action-sombre)',
    };
    for (const [variable, valeur] of Object.entries(attendus)) {
      expect(css).toContain(`${variable}: ${valeur};`);
    }
    // Encre du badge : action-texte-sombre, via sa variable.
    expect(css).toContain('color: var(--az-action-texte-sombre);');
  });

  it('les variables --az-*-sombre valent exactement les tokens sombres (épinglage amont)', () => {
    // Ceinture et bretelles : tokens-css.test.ts vérifie l’émission ; ici on
    // confirme que les variables référencées existent dans le fichier servi.
    const cssGenere = readFileSync(
      fileURLToPath(new URL('../../../app/tokens-synchronises.css', import.meta.url)),
      'utf8',
    );
    const roles: Array<[string, string]> = [
      ['bg-sombre', operationsTokens.colors['bg-sombre']],
      ['texte-sombre', operationsTokens.colors['texte-sombre']],
      ['texte-2-sombre', operationsTokens.colors['texte-2-sombre']],
      ['action-sombre', operationsTokens.colors['action-sombre']],
      ['action-texte-sombre', operationsTokens.colors['action-texte-sombre']],
    ];
    for (const [role, valeur] of roles) {
      expect(cssGenere).toContain(`--az-${role}: ${valeur};`);
    }
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
