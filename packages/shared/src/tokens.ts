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

export const tokens = {
  colors: colorTokens,
  typography: typographyTokens,
  rounded: roundedTokens,
  spacing: spacingTokens,
} as const;

export type Tokens = typeof tokens;
