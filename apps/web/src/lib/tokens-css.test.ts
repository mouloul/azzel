import { describe, expect, it } from 'vitest';

import { siteTokens } from '@azzel/shared';

import { buildTokensCss } from './tokens-css';

describe('buildTokensCss', () => {
  const css = buildTokensCss();
  const [rootBlock, darkBlock] = css.split('[data-theme="dark"]');

  it('auto-héberge les polices charte sans CDN', () => {
    expect(css).toContain(
      "src:url('/charte/fonts/barlow-condensed-latin-700-normal.woff2') format('woff2')",
    );
    expect(css).toContain(
      "src:url('/charte/fonts/inter-latin-400-normal.woff2') format('woff2')",
    );
    expect(css.match(/@font-face/g)?.length).toBe(10);
    expect(css).not.toContain('fonts.googleapis');
    expect(css).toContain('font-display:swap');
  });

  it('déclare des fallbacks à métriques ajustées', () => {
    expect(css).toContain("font-family:'Inter Fallback';font-style:normal;font-weight:100 900;src:local('Arial')");
    expect(css).toContain('size-adjust:105.27%');
    expect(css).toContain("font-family:'Barlow Condensed Fallback'");
    expect(css).toContain('size-adjust:97.72%');
  });

  it('émet les variables natives de la charte verbatim dans :root', () => {
    expect(rootBlock).toContain(`--forest: ${siteTokens.colors.forest};`);
    expect(rootBlock).toContain(`--ochre: ${siteTokens.colors.ochre};`);
    expect(rootBlock).toContain(
      `--surface: ${siteTokens.themes.light.surface};`,
    );
    expect(rootBlock).toContain(
      `--surface-raised: ${siteTokens.themes.light['surface-raised']};`,
    );
    expect(rootBlock).toContain(`--space-24: ${siteTokens.spacing['24']};`);
    expect(rootBlock).toContain(`--radius-md: ${siteTokens.radius.md};`);
    expect(rootBlock).toContain(`--shadow-card: ${siteTokens.shadow.card};`);
    expect(rootBlock).toContain(
      `--container-max: ${siteTokens.layout['container-max']};`,
    );
    expect(rootBlock).toContain(
      `--font-display: ${siteTokens.typography.display};`,
    );
  });

  it('remappe les --az-* sur les valeurs charte', () => {
    expect(rootBlock).toContain('--az-bg: var(--surface);');
    expect(rootBlock).toContain('--az-surface: var(--surface-raised);');
    expect(rootBlock).toContain('--az-texte: var(--ink);');
    expect(rootBlock).toContain('--az-texte-2: var(--ink-muted);');
    expect(rootBlock).toContain('--az-action: var(--action);');
    expect(rootBlock).toContain('--az-action-hover: var(--action-hover);');
    expect(rootBlock).toContain('--az-action-texte: var(--on-action);');
    expect(rootBlock).toContain('--az-filet: var(--line);');
    expect(rootBlock).toContain('--az-focus: var(--focus);');
  });

  it('émet le bloc sombre charte verbatim', () => {
    expect(darkBlock).toContain('color-scheme: dark;');
    expect(darkBlock).toContain(
      `--surface: ${siteTokens.themes.dark.surface};`,
    );
    expect(darkBlock).toContain(`--action: ${siteTokens.themes.dark.action};`);
    expect(darkBlock).toContain(
      `--on-action: ${siteTokens.themes.dark['on-action']};`,
    );
  });

  it('conserve les couleurs opérationnelles (jour J) en clair et sombre', () => {
    expect(rootBlock).toContain('--az-danger:');
    expect(rootBlock).toContain('--az-succes:');
    expect(rootBlock).toContain('--az-sync-attente:');
    expect(darkBlock).toContain('--az-danger:');
    expect(darkBlock).toContain('--az-sync-envoye:');
  });

  it('émet les variables typographie, rayon et espacement représentatives', () => {
    expect(rootBlock).toContain('--az-font-display: var(--font-display);');
    expect(rootBlock).toContain('--az-font-body: var(--font-body);');
    expect(rootBlock).toContain('--az-font-meta: var(--font-body);');
    expect(rootBlock).toContain('--az-radius-sm: var(--radius-sm);');
    expect(rootBlock).toContain('--az-space-gutter:');
  });

  it('émet les styles eyebrow et bouton depuis siteTokens', () => {
    expect(rootBlock).toContain(
      `--az-font-size-eyebrow: ${siteTokens.styles.eyebrow.fontSize};`,
    );
    expect(rootBlock).toContain(
      `--az-letter-spacing-eyebrow: ${siteTokens.styles.eyebrow.letterSpacing};`,
    );
    expect(rootBlock).toContain(
      `--az-font-weight-btn: ${siteTokens.styles.btn.fontWeight};`,
    );
  });

  it('ne met pas les tailles/graisses de boutons et eyebrows en dur ailleurs', () => {
    expect(rootBlock).not.toContain('font-size: 14px;');
    expect(rootBlock).not.toContain('font-size: 17px;');
  });

  it('n’émet pas de variables mortes (--bp-*, typo dossard)', () => {
    expect(rootBlock).not.toContain('--bp-sm:');
    expect(rootBlock).not.toContain('--bp-md:');
    expect(rootBlock).not.toContain('--bp-lg:');
    expect(rootBlock).not.toContain('--az-font-dossard:');
    expect(rootBlock).not.toContain('--az-letter-spacing-surtitre:');
  });
});
