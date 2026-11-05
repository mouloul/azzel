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
const SOURCE_DOSSIER = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'dossier.tsx'),
  'utf8',
);
const SOURCE_UI = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ui.tsx'),
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

  // I8 (revue épopée 10) — le compte EXACT épingle la régression : un
  // rétrogradage du « Se déconnecter » en contour/contour-épais (ou un
  // second destructeur ajouté) fait échouer ce test. `toMatch` seul
  // passait avec N boutons destructeurs.
  it('déconnexion : EXACTEMENT une action destructive par écran (e-dossard ET dossier)', () => {
    expect(SOURCE.match(/variante="destructeur"/g)).toHaveLength(1);
    expect(SOURCE_DOSSIER.match(/variante="destructeur"/g)).toHaveLength(1);
    // Le destructeur est réservé à la déconnexion sur ces deux écrans.
    expect(SOURCE).toMatch(/label="Se déconnecter" variante="destructeur"/);
    expect(SOURCE_DOSSIER).toMatch(/label="Se déconnecter" variante="destructeur"/);
    // Les variantes non destructrices n'emportent jamais la marque.
    expect(SOURCE_DOSSIER.match(/variante="contour"/g)?.length ?? 0).toBeGreaterThan(0);
    for (const source of [SOURCE, SOURCE_DOSSIER, SOURCE_UI]) {
      expect(source).not.toMatch(/variante="contour"[^\n]*destructeur|destructeur[^\n]*variante="contour"/);
    }
  });

  it('déconnexion : destructeur distinct du principal PAR LA FORME (I2, revue épopée 10)', () => {
    // ui.tsx — destructeur : contour ÉPAIS 3 px danger sur fond TRANSPARENT +
    // pictogramme ⚠ marqué aria-hidden devant le libellé ; principal :
    // pastille PLEINE sans bordure. Plus deux pastilles pleines empilées.
    expect(SOURCE_UI).toMatch(/borderWidth: destructeur \? 3 : principal \? 0 : 2/);
    expect(SOURCE_UI).toMatch(/destructeur\s*\?\s*pressed\s*\?\s*theme\.colors\.danger\s*\n?\s*:\s*'transparent'/);
    expect(SOURCE_UI).toMatch(/<Text aria-hidden=\{true\}>\{'⚠ '\}<\/Text>/);
    // Le commentaire obsolète « pastille danger » a été retiré.
    expect(SOURCE_UI).not.toMatch(/destructeur[^*]*pleine pastille danger/s);
  });
});
