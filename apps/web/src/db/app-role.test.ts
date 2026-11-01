import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Sql } from 'postgres';

import { AppRoleMisconfiguredError } from '@/modules/iam/errors';

import { protegerStore } from './app-role';

// `protegerStore` est la seule chose qui empêche une DATABASE_URL pointant sur
// le propriétaire (BYPASSRLS) de servir en silence : son retrait d'un site
// d'appel doit casser un test, pas passer inaperçu.

/** Doublure de connexion : répond au `SELECT current_user` de la garde. */
function fakeSql(currentUser: string) {
  const sql = (() => [{ current_user: currentUser }]) as unknown as Sql;
  return sql;
}

function fakeStore() {
  return { lire: vi.fn(async () => 'données'), constante: 42 };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('protegerStore', () => {
  it('laisse passer l’appel quand la connexion est le rôle applicatif', async () => {
    const store = fakeStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const protege = protegerStore(fakeSql('azzel_app'), store, false);

    await expect(protege.lire()).resolves.toBe('données');
    expect(store.lire).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('avertit hors production mais sert quand même', async () => {
    const store = fakeStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const protege = protegerStore(fakeSql('azzel'), store, false);

    await expect(protege.lire()).resolves.toBe('données');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('azzel_app');
  });

  it('refuse de servir en production', async () => {
    const store = fakeStore();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const protege = protegerStore(fakeSql('azzel'), store, true);

    await expect(protege.lire()).rejects.toBeInstanceOf(AppRoleMisconfiguredError);
    expect(store.lire).not.toHaveBeenCalled();
  });

  it('ne vérifie qu’une fois par connexion et laisse passer les non-fonctions', async () => {
    const store = fakeStore();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sql = vi.fn(() => [{ current_user: 'azzel_app' }]) as unknown as Sql;

    const protege = protegerStore(sql, store, false);
    expect(protege.constante).toBe(42);
    await protege.lire();
    await protege.lire();

    expect(sql).toHaveBeenCalledTimes(1);
  });
});
