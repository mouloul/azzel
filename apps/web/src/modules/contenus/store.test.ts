import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type postgres from 'postgres';

import { DbUnavailableError } from '@/modules/iam/errors';

// Câblage de `getContenusStore()` : la fabrique de connexion (story 8.1) est
// doublée. Les suites d'intégration construisent leurs stores directement et
// n'exercent jamais ce point d'entrée — ni la garde de rôle qu'il pose.

const getDbClientMock = vi.hoisted(() => vi.fn<() => unknown>());
vi.mock('@/db/client', () => ({ getDbClient: getDbClientMock }));

import { getContenusStore } from './store';

const ORGANISATION_ID = '11111111-2222-3333-4444-555555555555';

/** Doublure de connexion : enregistre le texte de chaque requête taguée. */
function fakeSql() {
  const queries: string[] = [];
  const tag = (fragments: TemplateStringsArray, ..._params: unknown[]) => {
    queries.push(fragments.join('?'));
    return [{ current_user: 'azzel' }];
  };
  const mutable = tag as unknown as { begin?: unknown; unsafe?: unknown };
  mutable.begin = async (fn: (tx: postgres.TransactionSql) => Promise<unknown>) =>
    fn(tag as unknown as postgres.TransactionSql);
  mutable.unsafe = (texte: string) => texte;
  return { sql: tag as unknown as postgres.Sql, queries };
}

function oublierStoreMemoise(): void {
  delete (globalThis as typeof globalThis & { __azzelContenusStore?: unknown })
    .__azzelContenusStore;
}

beforeEach(() => {
  oublierStoreMemoise();
  getDbClientMock.mockReset();
});

afterEach(() => {
  oublierStoreMemoise();
  vi.restoreAllMocks();
});

describe('getContenusStore', () => {
  it('enveloppe le store par la garde de rôle applicatif', async () => {
    const { sql, queries } = fakeSql();
    getDbClientMock.mockReturnValue(sql);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await getContenusStore().listContenusBySlugs(ORGANISATION_ID, ['accueil']);

    // La garde interroge le rôle AVANT toute requête métier.
    expect(queries[0]).toContain('SELECT current_user');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sert le store indisponible quand la fabrique ne rend aucune connexion', () => {
    getDbClientMock.mockReturnValue(null);

    const store = getContenusStore();

    expect(() => store.listContenusBySlugs(ORGANISATION_ID, ['accueil'])).toThrow(
      DbUnavailableError,
    );
  });
});
