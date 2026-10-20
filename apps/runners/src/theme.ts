import { Platform, type TextStyle } from 'react-native';

import { tokens } from '@azzel/shared';

type ColorKey = keyof typeof tokens.colors;

const colorPairs: Record<string, readonly [ColorKey, ColorKey]> = {
  bg: ['bg', 'bg-sombre'],
  surface: ['surface', 'surface-sombre'],
  ink: ['texte', 'texte-sombre'],
  ink2: ['texte-2', 'texte-2-sombre'],
  action: ['action', 'action-sombre'],
  actionInk: ['action-texte', 'action-texte-sombre'],
  success: ['succes', 'succes-sombre'],
  successInk: ['succes-encre', 'succes-encre-sombre'],
  danger: ['danger', 'danger-sombre'],
  dangerInk: ['danger-encre', 'danger-encre-sombre'],
  warning: ['attention', 'attention-sombre'],
  warningInk: ['attention-encre', 'attention-encre-sombre'],
  syncPending: ['sync-attente', 'sync-attente-sombre'],
  syncPendingInk: ['sync-attente-encre', 'sync-attente-encre-sombre'],
  syncSent: ['sync-envoye', 'sync-envoye-sombre'],
  syncSentInk: ['sync-envoye-encre', 'sync-envoye-encre-sombre'],
};

export type ThemeColors = { [K in keyof typeof colorPairs]: string };

const monoFontFamily = Platform.select<string | undefined>({
  ios: 'Menlo',
  android: 'monospace',
  default: undefined,
});

function px(value: string): number {
  return Number.parseFloat(value);
}

export interface FontToken {
  fontFamily?: string;
  fontSize: number;
  fontWeight: TextStyle['fontWeight'];
  lineHeight?: number;
  letterSpacing?: number;
}

function font(name: keyof typeof tokens.typography, family?: string): FontToken {
  const token = tokens.typography[name];
  const fontSize = px(token.fontSize);
  const result: FontToken = {
    fontFamily: family,
    fontSize,
    fontWeight: token.fontWeight as TextStyle['fontWeight'],
  };
  if ('lineHeight' in token) {
    result.lineHeight = fontSize * px(token.lineHeight);
  }
  if ('letterSpacing' in token) {
    result.letterSpacing = fontSize * px(token.letterSpacing);
  }
  return result;
}

function colorsFor(mode: 'light' | 'dark'): ThemeColors {
  const out: Record<string, string> = {};
  for (const [name, [lightKey, darkKey]] of Object.entries(colorPairs)) {
    out[name] = tokens.colors[mode === 'dark' ? darkKey : lightKey];
  }
  return out as ThemeColors;
}

export interface AppTheme {
  colors: ThemeColors;
  fonts: {
    display: FontToken;
    displaySm: FontToken;
    surtitre: FontToken;
    bodyLg: FontToken;
    body: FontToken;
    meta: FontToken;
    metaLg: FontToken;
    dossard: FontToken;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
    DEFAULT: number;
  };
  spacing: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
    '6': number;
    '7': number;
    gutter: number;
    marginMobile: number;
  };
}

function buildTheme(mode: 'light' | 'dark'): AppTheme {
  const spacing: AppTheme['spacing'] = {
    '1': px(tokens.spacing['1']),
    '2': px(tokens.spacing['2']),
    '3': px(tokens.spacing['3']),
    '4': px(tokens.spacing['4']),
    '5': px(tokens.spacing['5']),
    '6': px(tokens.spacing['6']),
    '7': px(tokens.spacing['7']),
    gutter: px(tokens.spacing.gutter),
    marginMobile: px(tokens.spacing['margin-mobile']),
  };
  return {
    colors: colorsFor(mode),
    fonts: {
      display: font('display'),
      displaySm: font('display-sm'),
      surtitre: font('surtitre'),
      bodyLg: font('body-lg'),
      body: font('body'),
      meta: font('meta', monoFontFamily),
      metaLg: font('meta-lg', monoFontFamily),
      dossard: font('dossard'),
    },
    radius: {
      sm: px(tokens.rounded.sm),
      md: px(tokens.rounded.md),
      lg: px(tokens.rounded.lg),
      full: px(tokens.rounded.full),
      DEFAULT: px(tokens.rounded.DEFAULT),
    },
    spacing,
  };
}

export const lightTheme = buildTheme('light');

export const darkTheme = buildTheme('dark');

export function themeFor(colorScheme: 'light' | 'dark' | null | undefined): AppTheme {
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}
