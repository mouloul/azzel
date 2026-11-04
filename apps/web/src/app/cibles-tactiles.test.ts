import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/* I6 (revue épopée 10) — UX-DR-23 : les trois cibles tactiles mesurées
 * sous 44 px en 10.1/10.4 (.course-ligne-annuler ≈ 21-23 px,
 * .btn-lien ≈ 41,5 px, .admin-nav__lien ≈ 43,2 px) sont corrigées. Ce
 * garde lit les feuilles réelles servies (pas des copies) — même mécanique
 * que le garde .aa-lien-texte de page.test.tsx (story 9.6). */

function regle(fichier: string, selecteur: string): string {
  const css = readFileSync(fileURLToPath(new URL(fichier, import.meta.url)), 'utf8').replace(
    /\s+/g,
    ' ',
  );
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${echappe}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

const MIN_44 = /min-height:\s*(4[4-9]|[5-9][0-9])px/;

describe('cibles tactiles ≥ 44 px (UX-DR-23, I6 revue épopée 10)', () => {
  it('.course-ligne-annuler (course.css) : ≥ 44 px de haut, libellé centré, jamais collé au bord', () => {
    const regleCss = regle('./admin/course/course.css', '.course-ligne-annuler');
    expect(regleCss, 'règle .course-ligne-annuler introuvable').not.toBe('');
    expect(regleCss).toMatch(MIN_44);
    expect(regleCss).toMatch(/display:\s*inline-flex/);
    expect(regleCss).toMatch(/align-items:\s*center/);
    expect(regleCss).toMatch(/padding:0 calc\(/);
  });

  it('.admin-nav__lien (admin.css) : ≥ 44 px (mesuré ≈ 43,2 px avant)', () => {
    const regleCss = regle('./admin/admin.css', '.admin-nav__lien');
    expect(regleCss, 'règle .admin-nav__lien introuvable').not.toBe('');
    expect(regleCss).toMatch(MIN_44);
    expect(regleCss).toMatch(/display:\s*inline-flex/);
    expect(regleCss).toMatch(/align-items:\s*center/);
  });

  it('.btn-lien (globals.css) : ≥ 44 px, même approche que .aa-lien-texte', () => {
    const regleCss = regle('./globals.css', '.btn-lien');
    expect(regleCss, 'règle .btn-lien introuvable').not.toBe('');
    expect(regleCss).toMatch(MIN_44);
    expect(regleCss).toMatch(/display:\s*inline-flex/);
    expect(regleCss).toMatch(/align-items:\s*center/);
  });
});
