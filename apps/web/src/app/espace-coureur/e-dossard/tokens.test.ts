import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { operationsTokens } from '@azzel/shared';

// Story 4.1 (revue) — la carte sombre et le QR utilisent des littéraux hex
// (couleurs fixes, indépendantes du mode clair/sombre) : ce test les ÉPINGLE
// aux valeurs d'operationsTokens (*-sombre pour la carte, texte pour les
// modules du QR). Si un token change dans shared, ce fichier échoue jusqu'à
// ce que le CSS/la page soient alignés — plus de dérive silencieuse.

const css = readFileSync(
  fileURLToPath(new URL('./e-dossard.css', import.meta.url)),
  'utf8',
);
const pageSource = readFileSync(
  fileURLToPath(new URL('./page.tsx', import.meta.url)),
  'utf8',
);

describe('e-dossard — couleurs épinglées aux tokens operationsTokens', () => {
  it('carte sombre : les 5 rôles *-sombre du CSS valent exactement les tokens', () => {
    const attendus: Record<string, string> = {
      '--edossard-fond': operationsTokens.colors['bg-sombre'],
      '--edossard-encre': operationsTokens.colors['texte-sombre'],
      '--edossard-encre-2': operationsTokens.colors['texte-2-sombre'],
      '--edossard-accent': operationsTokens.colors['action-sombre'],
    };
    for (const [variable, valeur] of Object.entries(attendus)) {
      expect(css).toContain(`${variable}: ${valeur};`);
    }
    // Encre du badge : action-texte-sombre, en littéral dans la règle.
    expect(css).toContain(`color: ${operationsTokens.colors['action-texte-sombre']};`);
  });

  it('QR : modules encre = operationsTokens.texte, sur blanc', () => {
    expect(pageSource).toContain(`const QR_ENCRE = '${operationsTokens.colors.texte}';`);
    expect(pageSource).toContain("const QR_BLANC = '#FFFFFF';");
  });

  it('aucune couleur hors contrat dans la carte sombre (les littéraux restent les seuls)', () => {
    // Le CSS ne doit contenir AUCUN autre hex que les couleurs épinglées
    // (blanc du QR inclus) — un nouveau littéral doit passer par un token.
    const autorises = new Set([
      operationsTokens.colors['bg-sombre'].toLowerCase(),
      operationsTokens.colors['texte-sombre'].toLowerCase(),
      operationsTokens.colors['texte-2-sombre'].toLowerCase(),
      operationsTokens.colors['action-sombre'].toLowerCase(),
      operationsTokens.colors['action-texte-sombre'].toLowerCase(),
      operationsTokens.colors.texte.toLowerCase(),
      '#ffffff',
    ]);
    const hex = css.match(/#[0-9a-f]{6}\b/gi) ?? [];
    for (const valeur of hex) {
      expect(autorises.has(valeur.toLowerCase())).toBe(true);
    }
  });
});
