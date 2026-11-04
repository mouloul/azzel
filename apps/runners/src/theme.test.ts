import { describe, expect, it, vi } from 'vitest';

import { tokens } from '@azzel/shared';

/* M10 (revue épopée 10) — la branche mono d'Android est verrouillée AUSSI :
 * le mock force la branche ios à l'import initial, mais chaque branche de
 * Platform.select est testée par réimport du module (vi.resetModules). */
const branche = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'android' }));

vi.mock('react-native', () => ({
  Platform: {
    select: (options: { ios?: unknown; android?: unknown; default?: unknown }) =>
      branche.os === 'ios' ? (options.ios ?? options.default) : (options.android ?? options.default),
  },
}));

import { colorPairs, darkTheme, lightTheme } from './theme';

describe('thème React Native dérivé des tokens', () => {
  it('chaque paire clair/sombre reflète les tokens correspondants', () => {
    for (const [name, [lightKey, darkKey]] of Object.entries(colorPairs)) {
      expect(lightTheme.colors[name as keyof typeof lightTheme.colors]).toBe(
        tokens.colors[lightKey],
      );
      expect(darkTheme.colors[name as keyof typeof darkTheme.colors]).toBe(
        tokens.colors[darkKey],
      );
    }
  });

  it('convertit la typographie en unités React Native', () => {
    const display = lightTheme.fonts.display;
    expect(display.fontSize).toBe(62);
    expect(display.lineHeight).toBeCloseTo(62 * 1.04, 5);

    const surtitre = lightTheme.fonts.surtitre;
    expect(surtitre.fontSize).toBe(13.5);
    expect(surtitre.letterSpacing).toBeCloseTo(13.5 * 0.14, 5);

    expect(lightTheme.fonts.meta.fontFamily).toBe('Menlo');
    expect(display.fontFamily).toBeUndefined();
  });

  it('convertit rayons et espacements en nombres', () => {
    expect(lightTheme.radius.full).toBe(9999);
    expect(lightTheme.radius.DEFAULT).toBe(16);
    expect(lightTheme.spacing.gutter).toBe(24);
    expect(lightTheme.spacing.marginMobile).toBe(20);
  });

  // Story 10.2 — planchers UX-DR-9/FR-7 : numéro de dossard à 74 px (token
  // dossard), badges « HORS-LIGNE PRÊT » et bandeau sync en monospace.
  it('dossard 74 px et méta monospace dans les deux modes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      expect(theme.fonts.dossard.fontSize).toBe(74);
      expect(theme.fonts.metaLg.fontFamily).toBe('Menlo');
      expect(theme.fonts.meta.fontFamily).toBe('Menlo');
    }
  });
});

// M10 (revue épopée 10) — la branche android ('monospace', theme.ts) est
// verrouillée comme la branche ios : chaque OS est testé par réimport du
// module après bascule du mock Platform.select.
describe.each([
  { os: 'ios', familleAttendue: 'Menlo' },
  { os: 'android', familleAttendue: 'monospace' },
] as const satisfies ReadonlyArray<{ os: 'ios' | 'android'; familleAttendue: string }>)(
  'mono natif par OS ($os)',
  ({ os, familleAttendue }: { os: 'ios' | 'android'; familleAttendue: string }) => {
    it(`meta/metaLg rendent en « ${familleAttendue} »`, async () => {
      branche.os = os;
      vi.resetModules();
      const { lightTheme: theme, darkTheme: themeSombre } = await import('./theme');
      expect(theme.fonts.meta.fontFamily).toBe(familleAttendue);
      expect(theme.fonts.metaLg.fontFamily).toBe(familleAttendue);
      expect(themeSombre.fonts.meta.fontFamily).toBe(familleAttendue);
      // Le reset n'attrape rien d'autre : le display reste SANS famille.
      expect(theme.fonts.display.fontFamily).toBeUndefined();
    });
  },
);
