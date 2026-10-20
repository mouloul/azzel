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
});
