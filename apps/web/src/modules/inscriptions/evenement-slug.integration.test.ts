import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

const testUrls = resolveTestDatabaseUrls('slug événement multi-organisation');

describe.skipIf(testUrls === null)(
  'evenement.slug — unicité par organisation (migration 0012)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    // Connexion propriétaire : fixtures et assertions de schéma (bypass RLS).
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql } = connections);
    }, 60_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    async function creerOrganisation(): Promise<string> {
      const id = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${id}, ${`org-${id.slice(0, 8)}`}, 'Organisation de test')
      `;
      return id;
    }

    it('deux organisations peuvent créer un événement portant le même slug', async () => {
      const orgA = await creerOrganisation();
      const orgB = await creerOrganisation();
      const slugPartage = `trail-commun-${randomUUID().slice(0, 8)}`;

      await sql`
        INSERT INTO evenement (organisation_id, slug, name)
        VALUES (${orgA}, ${slugPartage}, 'Trail — organisation A')
      `;
      await sql`
        INSERT INTO evenement (organisation_id, slug, name)
        VALUES (${orgB}, ${slugPartage}, 'Trail — organisation B')
      `;

      const rows = await sql<{ organisation_id: string }[]>`
        SELECT organisation_id FROM evenement WHERE slug = ${slugPartage}
      `;
      expect(rows.map((row) => row.organisation_id).sort()).toEqual([orgA, orgB].sort());
    });

    it('la même organisation ne peut pas réutiliser le slug (unicité conservée, scopée)', async () => {
      const org = await creerOrganisation();
      const slug = `trail-unique-${randomUUID().slice(0, 8)}`;
      await sql`
        INSERT INTO evenement (organisation_id, slug, name)
        VALUES (${org}, ${slug}, 'Premier')
      `;

      await expect(
        sql`
          INSERT INTO evenement (organisation_id, slug, name)
          VALUES (${org}, ${slug}, 'Doublon')
        `,
      ).rejects.toThrow();
    });

    it('la contrainte globale sur slug a disparu au profit de (organisation_id, slug)', async () => {
      const contraintes = await sql<{ conname: string; colonnes: string[] }[]>`
        SELECT con.conname,
               array_agg(att.attname ORDER BY att.attname) AS colonnes
        FROM pg_constraint con
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.conrelid = 'evenement'::regclass AND con.contype = 'u'
        GROUP BY con.conname
      `;
      const jeux = contraintes.map((row) => row.colonnes.join(','));
      expect(jeux).toContain('organisation_id,slug');
      expect(jeux).not.toContain('slug');
    });
  },
);
