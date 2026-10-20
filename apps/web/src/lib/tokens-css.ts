import { tokens } from '@azzel/shared';

const DARK_SUFFIX = '-sombre';

function lightColorDeclarations(): string {
  return Object.entries(tokens.colors)
    .filter(([role]) => !role.endsWith(DARK_SUFFIX))
    .map(([role, value]) => `  --az-${role}: ${value};`)
    .join('\n');
}

function darkColorDeclarations(): string {
  return Object.entries(tokens.colors)
    .filter(([role]) => role.endsWith(DARK_SUFFIX))
    .map(([role, value]) => `  --az-${role.slice(0, -DARK_SUFFIX.length)}: ${value};`)
    .join('\n');
}

function typographyDeclarations(): string {
  return Object.entries(tokens.typography)
    .map(([name, token]) => {
      const lines = [
        `  --az-font-${name}: ${token.fontFamily};`,
        `  --az-font-size-${name}: ${token.fontSize};`,
        `  --az-font-weight-${name}: ${token.fontWeight};`,
      ];
      if ('lineHeight' in token) {
        lines.push(`  --az-line-height-${name}: ${token.lineHeight};`);
      }
      if ('letterSpacing' in token) {
        lines.push(`  --az-letter-spacing-${name}: ${token.letterSpacing};`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

function roundedDeclarations(): string {
  const { sm, md, lg, full } = tokens.rounded;
  return [
    `  --az-radius: ${tokens.rounded.DEFAULT};`,
    `  --az-radius-sm: ${sm};`,
    `  --az-radius-md: ${md};`,
    `  --az-radius-lg: ${lg};`,
    `  --az-radius-full: ${full};`,
  ].join('\n');
}

function spacingDeclarations(): string {
  return Object.entries(tokens.spacing)
    .map(([name, value]) => `  --az-space-${name}: ${value};`)
    .join('\n');
}

export function buildTokensCss(): string {
  return `:root {
  color-scheme: light;
${lightColorDeclarations()}
  --az-filet: color-mix(in srgb, var(--az-texte) 25%, transparent);
${typographyDeclarations()}
${roundedDeclarations()}
${spacingDeclarations()}
}

[data-theme="dark"] {
  color-scheme: dark;
${darkColorDeclarations()}
  --az-filet: color-mix(in srgb, var(--az-texte) 22%, transparent);
}
`;
}
