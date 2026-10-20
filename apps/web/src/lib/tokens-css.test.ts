import { describe, expect, it } from 'vitest';

import { tokens } from '@azzel/shared';

import { buildTokensCss } from './tokens-css';

describe('buildTokensCss', () => {
  const css = buildTokensCss();
  const [rootBlock, darkBlock] = css.split('[data-theme="dark"]');

  it('émet une couleur claire dans :root', () => {
    expect(rootBlock).toContain(':root');
    expect(rootBlock).toContain(`--az-bg: ${tokens.colors.bg};`);
  });

  it('ré-émet un rôle -sombre sans suffixe sous [data-theme="dark"]', () => {
    expect(darkBlock).toBeDefined();
    expect(darkBlock).toContain(`--az-bg: ${tokens.colors['bg-sombre']};`);
    expect(darkBlock).not.toContain('--az-bg-sombre:');
  });

  it('émet les variables typographie, rayon et espacement représentatives', () => {
    expect(rootBlock).toContain(`--az-font-display: ${tokens.typography.display.fontFamily};`);
    expect(rootBlock).toContain(`--az-font-size-display: ${tokens.typography.display.fontSize};`);
    expect(rootBlock).toContain(`--az-radius-full: ${tokens.rounded.full};`);
    expect(rootBlock).toContain(`--az-space-gutter: ${tokens.spacing.gutter};`);
  });
});
