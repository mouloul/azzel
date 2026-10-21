import { describe, expect, it } from 'vitest';

import {
  colorTokens,
  siteThemeDark,
  siteThemeLight,
  siteTokens,
} from './tokens';

describe('parité clair/sombre des couleurs opérationnelles', () => {
  const roles = Object.keys(colorTokens);

  it('chaque rôle non -sombre a son pendant -sombre', () => {
    const lightRoles = roles.filter((role) => !role.endsWith('-sombre'));
    expect(lightRoles.length).toBeGreaterThan(0);
    for (const role of lightRoles) {
      expect(roles).toContain(`${role}-sombre`);
    }
  });

  it('chaque rôle -sombre a son pendant non -sombre', () => {
    const darkRoles = roles.filter((role) => role.endsWith('-sombre'));
    expect(darkRoles.length).toBeGreaterThan(0);
    for (const role of darkRoles) {
      expect(roles).toContain(role.slice(0, -'-sombre'.length));
    }
  });
});

describe('parité clair/sombre des tokens site (charte Aït Aïssi)', () => {
  const lightRoles = Object.keys(siteThemeLight);
  const darkRoles = Object.keys(siteThemeDark);

  it('les deux thèmes exposent exactement les mêmes rôles', () => {
    expect(lightRoles.length).toBeGreaterThan(0);
    expect(new Set(lightRoles)).toEqual(new Set(darkRoles));
  });

  it('les valeurs light et dark sont celles de la charte', () => {
    expect(siteThemeLight.surface).toBe('#F4F0E6');
    expect(siteThemeDark.surface).toBe('#0F241A');
    expect(siteThemeLight.action).toBe('#9E5418');
    expect(siteThemeDark['on-action']).toBe('#0F241A');
  });

  it('les familles typographiques du site sont Barlow Condensed et Inter', () => {
    expect(siteTokens.typography.display).toContain('Barlow Condensed');
    expect(siteTokens.typography.body).toContain('Inter');
  });
});
