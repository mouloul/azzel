import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* Story 10.2 — verrous de l'e-dossard par lecture de source : Vitest n'a
 * ni DOM ni react-native (aucun rendu natif testable ici), on verrouille
 * donc les INTENTIONS de forme — token dossard, badge monospace, QR sur
 * carte blanche à coins arrondis, carte sombre issue des tokens — telles
 * que le composant les exprime. */

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'edossard.tsx'),
  'utf8',
);

describe('e-dossard — garanties de forme (UX-DR-9, FR-7, story 10.2)', () => {
  it('numéro rendu avec le token dossard (74 px) en chiffres tabulaires', () => {
    expect(SOURCE).toContain('theme.fonts.dossard');
    expect(SOURCE).toContain("fontVariant: ['tabular-nums']");
  });

  it('« HORS-LIGNE PRÊT » rendu en monospace (metaLg)', () => {
    expect(SOURCE).toMatch(/theme\.fonts\.metaLg[\s\S]{0,400}HORS-LIGNE PRÊT/);
  });

  it('QR sur carte blanche à coins arrondis — blanc littéral documenté, jamais thémé', () => {
    expect(SOURCE).toMatch(/backgroundColor: QR_BLANC,\s*borderRadius: theme\.radius\.md/);
    expect(SOURCE).toMatch(/<QRCode[^>]*backgroundColor=\{QR_BLANC\}/);
    expect(SOURCE).toContain("const QR_BLANC = '#FFFFFF'");
  });

  it('carte sombre fixe lue dans les tokens shared — zéro littéral de charte', () => {
    expect(SOURCE).toContain("fond: tokens.colors['bg-sombre']");
    expect(SOURCE).toContain("encre: tokens.colors['texte-sombre']");
    expect(SOURCE).toContain("encre2: tokens.colors['texte-2-sombre']");
    expect(SOURCE).toContain("accent: tokens.colors['action-sombre']");
    expect(SOURCE).toContain("encreAccent: tokens.colors['action-texte-sombre']");
    expect(SOURCE).toContain("const QR_ENCRE = tokens.colors['texte']");
  });

  it('déconnexion : seule action destructive de l’écran, distincte par la forme', () => {
    expect(SOURCE).toMatch(/label="Se déconnecter" variante="destructeur"/);
  });
});
