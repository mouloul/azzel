import { describe, expect, it } from 'vitest';

import { colorTokens } from './tokens';

describe('parité clair/sombre des couleurs', () => {
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
