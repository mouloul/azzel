import { describe, expect, it, vi } from 'vitest';

import { tokens } from '@azzel/shared';

vi.mock('react-native', () => ({
  Platform: {
    select: (options: { ios?: unknown; default?: unknown }) => options.ios ?? options.default,
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
