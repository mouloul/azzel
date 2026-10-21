export const fontStackRounded =
  'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export const fontStackMono = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const colorTokens = {
  bg: '#EDF2EB',
  surface: '#FAFCF8',
  texte: '#16281C',
  'texte-2': '#4A6252',
  action: '#345E4A',
  'action-texte': '#EFF8F2',
  succes: '#187A3C',
  'succes-encre': '#FFFFFF',
  danger: '#B3261E',
  'danger-encre': '#FFFFFF',
  attention: '#8A5A00',
  'attention-encre': '#FFFFFF',
  'sync-attente': '#6B5A33',
  'sync-attente-encre': '#FFFFFF',
  'sync-envoye': '#2E6570',
  'sync-envoye-encre': '#FFFFFF',
  'bg-sombre': '#101A14',
  'surface-sombre': '#1B281F',
  'texte-sombre': '#E8F0E9',
  'texte-2-sombre': '#A9C0AE',
  'action-sombre': '#8FD4A8',
  'action-texte-sombre': '#0C2415',
  'succes-sombre': '#62D288',
  'succes-encre-sombre': '#07290F',
  'danger-sombre': '#FF7268',
  'danger-encre-sombre': '#340905',
  'attention-sombre': '#F0B445',
  'attention-encre-sombre': '#302205',
  'sync-attente-sombre': '#C4A366',
  'sync-attente-encre-sombre': '#291D04',
  'sync-envoye-sombre': '#74C7D6',
  'sync-envoye-encre-sombre': '#06262C',
} as const;

export type ColorRole = keyof typeof colorTokens;

export const typographyTokens = {
  display: {
    fontFamily: fontStackRounded,
    fontSize: '62px',
    fontWeight: '800',
    lineHeight: '1.04',
  },
  'display-sm': {
    fontFamily: fontStackRounded,
    fontSize: '24px',
    fontWeight: '800',
  },
  surtitre: {
    fontFamily: fontStackRounded,
    fontSize: '13.5px',
    fontWeight: '700',
    letterSpacing: '0.14em',
  },
  'body-lg': {
    fontFamily: fontStackRounded,
    fontSize: '16.5px',
    fontWeight: '400',
    lineHeight: '1.75',
  },
  body: {
    fontFamily: fontStackRounded,
    fontSize: '15px',
    fontWeight: '400',
    lineHeight: '1.7',
  },
  meta: {
    fontFamily: fontStackMono,
    fontSize: '12px',
    fontWeight: '400',
  },
  'meta-lg': {
    fontFamily: fontStackMono,
    fontSize: '15px',
    fontWeight: '400',
  },
  dossard: {
    fontFamily: fontStackRounded,
    fontSize: '74px',
    fontWeight: '800',
    lineHeight: '1',
  },
} as const;

export type TypographyRole = keyof typeof typographyTokens;

export const roundedTokens = {
  sm: '8px',
  md: '16px',
  lg: '24px',
  full: '9999px',
  DEFAULT: '16px',
} as const;

export const spacingTokens = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '24px',
  '6': '32px',
  '7': '48px',
  gutter: '24px',
  'margin-mobile': '20px',
} as const;

export const operationsTokens = {
  colors: colorTokens,
  typography: typographyTokens,
  rounded: roundedTokens,
  spacing: spacingTokens,
} as const;

export type OperationsTokens = typeof operationsTokens;

export const tokens = operationsTokens;

export type Tokens = typeof tokens;

export const siteColorTokens = {
  forest: '#183A2B',
  'forest-600': '#24503C',
  'forest-400': '#2F6A4F',
  ochre: '#C8742B',
  'ochre-300': '#D98A45',
  sage: '#8FA58A',
  cream: '#F4F0E6',
  sand: '#E6E1D4',
  anthracite: '#2A2B2E',
} as const;

export const siteThemeLight = {
  surface: '#F4F0E6',
  'surface-raised': '#FFFFFF',
  'forest-surface': '#183A2B',
  ink: '#2A2B2E',
  'ink-muted': '#5D6058',
  heading: '#183A2B',
  'on-forest': '#F4F0E6',
  line: '#E6E1D4',
  accent: '#9E5418',
  highlight: '#C8742B',
  action: '#9E5418',
  'action-hover': '#86460F',
  'on-action': '#FFFFFF',
  focus: '#9E5418',
} as const;

export const siteThemeDark = {
  surface: '#0F241A',
  'surface-raised': '#183A2B',
  'forest-surface': '#24503C',
  ink: '#F4F0E6',
  'ink-muted': '#B9BDB0',
  heading: '#F4F0E6',
  'on-forest': '#F4F0E6',
  line: '#2F4A3C',
  accent: '#E39A5B',
  highlight: '#D98A45',
  action: '#D98A45',
  'action-hover': '#E39A5B',
  'on-action': '#0F241A',
  focus: '#E39A5B',
} as const;

export type SiteThemeRole = keyof typeof siteThemeLight;

export const siteTypographyTokens = {
  display: '"Barlow Condensed", "Barlow Condensed Fallback", "Arial Narrow", sans-serif',
  body: 'Inter, "Inter Fallback", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const siteTypographyStyles = {
  eyebrow: {
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '0.28em',
  },
  btn: {
    fontSize: '17px',
    fontWeight: '700',
    letterSpacing: '0.06em',
  },
} as const;

export const siteSpacingTokens = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '6': '24px',
  '8': '32px',
  '12': '48px',
  '16': '64px',
  '24': '96px',
} as const;

export const siteRadiusTokens = {
  sm: '4px',
  md: '6px',
  lg: '8px',
} as const;

export const siteShadowTokens = {
  card: '0 1px 2px rgba(15,36,26,0.08)',
} as const;

export const siteLayoutTokens = {
  'container-max': '1200px',
  'text-max': '68ch',
  'header-height': '72px',
  'bp-sm': '640px',
  'bp-md': '960px',
  'bp-lg': '1280px',
} as const;

export const siteTokens = {
  colors: siteColorTokens,
  themes: {
    light: siteThemeLight,
    dark: siteThemeDark,
  },
  typography: siteTypographyTokens,
  styles: siteTypographyStyles,
  spacing: siteSpacingTokens,
  radius: siteRadiusTokens,
  shadow: siteShadowTokens,
  layout: siteLayoutTokens,
} as const;

export type SiteTokens = typeof siteTokens;
