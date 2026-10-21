import { operationsTokens, siteTokens } from '@azzel/shared';

const DARK_SUFFIX = '-sombre';

const SITE_FONT_BASE = '/charte/fonts/';

const SITE_FONT_FILES = [
  { family: 'Barlow Condensed', weight: '500', file: 'barlow-condensed-latin-500-normal.woff2' },
  { family: 'Barlow Condensed', weight: '600', file: 'barlow-condensed-latin-600-normal.woff2' },
  { family: 'Barlow Condensed', weight: '700', file: 'barlow-condensed-latin-700-normal.woff2' },
  { family: 'Barlow Condensed', weight: '800', file: 'barlow-condensed-latin-800-normal.woff2' },
  { family: 'Inter', weight: '400', file: 'inter-latin-400-normal.woff2' },
  { family: 'Inter', weight: '500', file: 'inter-latin-500-normal.woff2' },
  { family: 'Inter', weight: '600', file: 'inter-latin-600-normal.woff2' },
  { family: 'Inter', weight: '700', file: 'inter-latin-700-normal.woff2' },
] as const;

const SITE_FONT_FALLBACKS = [
  {
    family: 'Inter Fallback',
    src: "local('Arial')",
    ascentOverride: '96.88%',
    descentOverride: '24.12%',
    lineGapOverride: '0%',
    sizeAdjust: '105.27%',
  },
  {
    family: 'Barlow Condensed Fallback',
    src: "local('Arial Narrow')",
    ascentOverride: '100%',
    descentOverride: '20%',
    lineGapOverride: '0%',
    sizeAdjust: '97.72%',
  },
] as const;

const REMAPPED_OPERATIONS_ROLES = new Set([
  'bg',
  'surface',
  'texte',
  'texte-2',
  'action',
  'action-texte',
]);

const AZ_TYPOGRAPHY_ROLES = new Set([
  'display',
  'display-sm',
  'surtitre',
  'body-lg',
  'body',
  'meta',
  'meta-lg',
]);

const AZ_REMAP: Record<string, string> = {
  'az-bg': 'var(--surface)',
  'az-surface': 'var(--surface-raised)',
  'az-texte': 'var(--ink)',
  'az-texte-2': 'var(--ink-muted)',
  'az-action': 'var(--action)',
  'az-action-hover': 'var(--action-hover)',
  'az-action-texte': 'var(--on-action)',
  'az-filet': 'var(--line)',
  'az-focus': 'var(--focus)',
};

const SITE_LAYOUT_EMITTED = new Set(['container-max', 'text-max', 'header-height']);

function fontFaceDeclarations(): string {
  const faces = SITE_FONT_FILES.map(
    ({ family, weight, file }) =>
      `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url('${SITE_FONT_BASE}${file}') format('woff2')}`,
  );
  const fallbacks = SITE_FONT_FALLBACKS.map(
    ({ family, src, ascentOverride, descentOverride, lineGapOverride, sizeAdjust }) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:100 900;src:${src};ascent-override:${ascentOverride};descent-override:${descentOverride};line-gap-override:${lineGapOverride};size-adjust:${sizeAdjust}}`,
  );
  return [...faces, ...fallbacks].join('\n');
}

function sitePaletteDeclarations(): string {
  return Object.entries(siteTokens.colors)
    .map(([role, value]) => `  --${role}: ${value};`)
    .join('\n');
}

function siteThemeDeclarations(theme: 'light' | 'dark'): string {
  return Object.entries(siteTokens.themes[theme])
    .map(([role, value]) => `  --${role}: ${value};`)
    .join('\n');
}

function siteStaticDeclarations(): string {
  return [
    ...Object.entries(siteTokens.spacing).map(([name, value]) => `  --space-${name}: ${value};`),
    ...Object.entries(siteTokens.radius).map(([name, value]) => `  --radius-${name}: ${value};`),
    ...Object.entries(siteTokens.shadow).map(([name, value]) => `  --shadow-${name}: ${value};`),
    ...Object.entries(siteTokens.layout)
      .filter(([name]) => SITE_LAYOUT_EMITTED.has(name))
      .map(([name, value]) => `  --${name}: ${value};`),
    `  --font-display: ${siteTokens.typography.display};`,
    `  --font-body: ${siteTokens.typography.body};`,
  ].join('\n');
}

function siteStyleDeclarations(): string {
  return Object.entries(siteTokens.styles)
    .flatMap(([name, style]) => [
      `  --az-font-size-${name}: ${style.fontSize};`,
      `  --az-font-weight-${name}: ${style.fontWeight};`,
      `  --az-letter-spacing-${name}: ${style.letterSpacing};`,
    ])
    .join('\n');
}

function azRemapDeclarations(): string {
  return Object.entries(AZ_REMAP)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
}

function isOperationsRole(role: string): boolean {
  return !REMAPPED_OPERATIONS_ROLES.has(role);
}

function operationsLightDeclarations(): string {
  return Object.entries(operationsTokens.colors)
    .filter(([role]) => !role.endsWith(DARK_SUFFIX) && isOperationsRole(role))
    .map(([role, value]) => `  --az-${role}: ${value};`)
    .join('\n');
}

function operationsDarkDeclarations(): string {
  return Object.entries(operationsTokens.colors)
    .filter(([role]) => role.endsWith(DARK_SUFFIX) && isOperationsRole(role.slice(0, -DARK_SUFFIX.length)))
    .map(([role, value]) => `  --az-${role.slice(0, -DARK_SUFFIX.length)}: ${value};`)
    .join('\n');
}

function typographyDeclarations(): string {
  return Object.entries(operationsTokens.typography)
    .filter(([name]) => AZ_TYPOGRAPHY_ROLES.has(name))
    .map(([name, token]) => {
      const family = ['display', 'display-sm', 'surtitre', 'dossard'].includes(name)
        ? 'var(--font-display)'
        : 'var(--font-body)';
      const lines = [
        `  --az-font-${name}: ${family};`,
        `  --az-font-size-${name}: ${token.fontSize};`,
        `  --az-font-weight-${name}: ${token.fontWeight};`,
      ];
      if ('lineHeight' in token) {
        lines.push(`  --az-line-height-${name}: ${token.lineHeight};`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

function roundedDeclarations(): string {
  return [
    '  --az-radius: var(--radius-md);',
    '  --az-radius-sm: var(--radius-sm);',
    '  --az-radius-md: var(--radius-md);',
    '  --az-radius-lg: var(--radius-lg);',
    '  --az-radius-full: 9999px;',
  ].join('\n');
}

function spacingDeclarations(): string {
  return Object.entries(operationsTokens.spacing)
    .map(([name, value]) => `  --az-space-${name}: ${value};`)
    .join('\n');
}

export function buildTokensCss(): string {
  return `${fontFaceDeclarations()}

:root {
  color-scheme: light;
${sitePaletteDeclarations()}
${siteThemeDeclarations('light')}
${siteStaticDeclarations()}
${siteStyleDeclarations()}
${azRemapDeclarations()}
${operationsLightDeclarations()}
${typographyDeclarations()}
${roundedDeclarations()}
${spacingDeclarations()}
}

[data-theme="dark"] {
  color-scheme: dark;
${siteThemeDeclarations('dark')}
${operationsDarkDeclarations()}
}
`;
}
