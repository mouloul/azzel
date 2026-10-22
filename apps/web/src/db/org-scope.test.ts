import { beforeEach, describe, expect, it, vi } from 'vitest';

import type postgres from 'postgres';

import {
  ORGANISATION_GUC,
  findOrganisationIdBySlug,
  listOrganisationIds,
  resetOrganisationIdMemoForTests,
  withDefaultOrg,
  withOrg,
} from './org-scope';

interface RecordedQuery {
  fragments: readonly string[];
  params: readonly unknown[];
}

// Doubure factice d'un Sql/TransactionSql : capture chaque requête taguée
// (fragments + paramètres) pour assert le plumbing GUC sans base réelle.
function fakeConnection(results: unknown[] = []) {
  const queries: RecordedQuery[] = [];
  const tag = (fragments: TemplateStringsArray, ...params: unknown[]) => {
    queries.push({ fragments, params });
    return results.length > 0 ? results : [];
  };
  const tx = tag as unknown as postgres.TransactionSql;
  const sql = tag as unknown as postgres.Sql;
  const begin = vi.fn(async (fn: (tx: postgres.TransactionSql) => Promise<unknown>) =>
    fn(tx),
  );
  (sql as { begin?: unknown }).begin = begin;
  return { sql, tx, queries, begin };
}

function textOf(query: RecordedQuery): string {
  return query.fragments.join('?');
}

beforeEach(() => {
  resetOrganisationIdMemoForTests();
});

describe('withOrg — GUC transactionnel', () => {
  it('pose set_config(app.organisation_id, org, true) puis exécute fn dans sql.begin', async () => {
    const { sql, tx, queries, begin } = fakeConnection();
    const result = await withOrg(sql, '6f0d3a11-1111-4111-8111-111111111111', async (scope) => {
      expect(scope).toBe(tx);
      await scope`SELECT count(*) FROM coureur`;
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(begin).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(2);
    expect(textOf(queries[0] as RecordedQuery)).toContain('set_config');
    expect(textOf(queries[0] as RecordedQuery)).toContain('true)');
    expect((queries[0] as RecordedQuery).params).toEqual([ORGANISATION_GUC, '6f0d3a11-1111-4111-8111-111111111111']);
    expect(textOf(queries[1] as RecordedQuery)).toContain('coureur');
  });

  it('propage le résultat et l’erreur de fn tels quels', async () => {
    const { sql } = fakeConnection();
    await expect(
      withOrg(sql, '6f0d3a11-1111-4111-8111-111111111111', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('refuse un organisationId non UUID sans toucher la base', async () => {
    const { sql, begin } = fakeConnection();
    await expect(withOrg(sql, 'default', async () => 1)).rejects.toThrow(/UUID/);
    await expect(withOrg(sql, '', async () => 1)).rejects.toThrow(/UUID/);
    expect(begin).not.toHaveBeenCalled();
  });
});

describe('findOrganisationIdBySlug — lecture publique sans GUC', () => {
  it('retourne l’id de la ligne trouvée', async () => {
    const { sql, queries } = fakeConnection([{ id: '11111111-1111-4111-8111-111111111111' }]);
    await expect(findOrganisationIdBySlug(sql, 'ait-aissi')).resolves.toBe('11111111-1111-4111-8111-111111111111');
    expect(textOf(queries[0] as RecordedQuery)).toContain('FROM organisation');
    expect((queries[0] as RecordedQuery).params).toEqual(['ait-aissi']);
  });

  it('retourne null sans ligne', async () => {
    const { sql } = fakeConnection([]);
    await expect(findOrganisationIdBySlug(sql, 'inconnue')).resolves.toBeNull();
  });
});

describe('listOrganisationIds — énumération publique', () => {
  it('retourne les ids', async () => {
    const { sql } = fakeConnection([{ id: 'a' }, { id: 'b' }]);
    await expect(listOrganisationIds(sql)).resolves.toEqual(['a', 'b']);
  });
});

describe('withDefaultOrg — résolution du slug par défaut puis withOrg', () => {
  it('résout ait-aissi hors GUC puis pose son id en GUC', async () => {
    const { sql, queries } = fakeConnection([{ id: '6f0d3a11-2222-4222-8222-222222222222' }]);
    const result = await withDefaultOrg(sql, async () => 42);
    expect(result).toBe(42);
    expect(textOf(queries[0] as RecordedQuery)).toContain('FROM organisation');
    expect(textOf(queries[1] as RecordedQuery)).toContain('set_config');
    expect((queries[1] as RecordedQuery).params).toEqual([ORGANISATION_GUC, '6f0d3a11-2222-4222-8222-222222222222']);
  });

  it('erreur explicite si l’organisation par défaut est absente (base non migrée)', async () => {
    const { sql } = fakeConnection([]);
    await expect(withDefaultOrg(sql, async () => {})).rejects.toThrow(
      /pnpm -F @azzel\/web db:migrate/,
    );
  });
});
