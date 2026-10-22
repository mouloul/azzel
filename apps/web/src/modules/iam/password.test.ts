import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  estMotDePasseValide,
  hashPassword,
  verifyPassword,
} from './password';

describe('hashPassword / verifyPassword — scrypt (node:crypto, zéro dépendance)', () => {
  it('hache puis vérifie le même mot de passe', async () => {
    const hash = await hashPassword('motdepasse-2026');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword('motdepasse-2026', hash)).resolves.toBe(true);
  });

  it('refuse un mot de passe différent', async () => {
    const hash = await hashPassword('motdepasse-2026');
    await expect(verifyPassword('motdepasse-2027', hash)).resolves.toBe(false);
  });

  it('deux hash du même mot de passe diffèrent (sel aléatoire) et vérifient tous deux', async () => {
    const premier = await hashPassword('trail-azzel');
    const second = await hashPassword('trail-azzel');
    expect(premier).not.toBe(second);
    await expect(verifyPassword('trail-azzel', premier)).resolves.toBe(true);
    await expect(verifyPassword('trail-azzel', second)).resolves.toBe(true);
  });

  it('hash stocké illisible ou tronqué : false, jamais d’exception', async () => {
    for (const corrompu of ['', 'scrypt', 'plain$abc', 'scrypt$zz$zz', 'scrypt$00$00']) {
      await expect(verifyPassword('peu importe', corrompu)).resolves.toBe(false);
    }
  });
});

describe('estMotDePasseValide — bornes 8–128', () => {
  it('refuse trop court et trop long', () => {
    expect(estMotDePasseValide('ab3defg')).toBe(false);
    expect(estMotDePasseValide('x'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(estMotDePasseValide('x'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });

  it('accepte les bornes incluses', () => {
    expect(estMotDePasseValide('x'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(estMotDePasseValide('x'.repeat(PASSWORD_MAX_LENGTH))).toBe(true);
  });

  it('les bornes documentées sont 8 et 128', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });
});
