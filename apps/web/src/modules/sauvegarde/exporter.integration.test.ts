import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalDiskProofStore } from '@/modules/inscriptions/proof-store';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import { PREUVES_SOUS_DOSSIER, exporterPreuves } from './exporter';

// Story 12.2 — export des preuves sur la base azzel_test : inventaire lu en
// propriétaire (comptages de toutes les tables de `public`, dernière
// migration, lignes `preuve`), refus sous le rôle applicatif (RLS).

const testUrls = resolveTestDatabaseUrls('sauvegarde');

describe.skipIf(testUrls === null)('sauvegarde — exporterPreuves (base azzel_test)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  let connections: AzzelTestConnections | undefined;
  let owner: postgres.Sql;
  let app: postgres.Sql;
  let racine: string;
  let store: LocalDiskProofStore;
  const cles: { active: string; remplacee: string } = { active: '', remplacee: '' };

  beforeAll(async () => {
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner, app } = connections);
    racine = await mkdtemp(path.join(tmpdir(), 'azzel-export-integ-'));
    store = new LocalDiskProofStore(path.join(racine, 'stockage'));

    const organisations = await owner<{ id: string }[]>`
      SELECT id FROM organisation WHERE slug = 'ait-aissi'
    `;
    const organisationId = organisations[0]!.id;
    const editions = await owner<{ id: string }[]>`
      SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${organisationId}
    `;
    const editionId = editions[0]!.id;
    const epreuves = await owner<{ id: string }[]>`
      SELECT id FROM epreuve WHERE edition_id = ${editionId} AND slug = 'longue'
    `;
    const accountId = randomUUID();
    const coureurId = randomUUID();
    await owner`
      INSERT INTO account (id, organisation_id, email, role)
      VALUES (${accountId}, ${organisationId}, ${`sauvegarde-${accountId}@test.azzel`}, 'coureur')
    `;
    await owner`
      INSERT INTO coureur (
        id, organisation_id, account_id, edition_id, epreuve_id,
        first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
        birth_date, tshirt_size, age, age_category, status
      )
      VALUES (
        ${coureurId}, ${organisationId}, ${accountId}, ${editionId}, ${epreuves[0]!.id},
        'Prenom', 'Nom', '+213555010996', 'Contact', '0555010995',
        DATE '1990-05-12', 'M', 36, 'Senior', 'en validation'
      )
    `;
    const encodeur = new TextEncoder();
    const remplacee = await store.put(encodeur.encode('%PDF-1.4\nremplacee\n%%EOF\n'), 'pdf');
    const active = await store.put(encodeur.encode('%PDF-1.4\nactive\n%%EOF\n'), 'pdf');
    cles.active = active.storageKey;
    cles.remplacee = remplacee.storageKey;
    for (const [fichier, statut] of [
      [remplacee, 'replaced'],
      [active, 'active'],
    ] as const) {
      await owner`
        INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
        VALUES (${organisationId}, ${coureurId}, ${fichier.storageKey}, ${fichier.mime},
                ${fichier.sizeBytes}, ${fichier.sha256}, ${statut})
      `;
    }
  });

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    if (racine) {
      await rm(racine, { recursive: true, force: true });
    }
  });

  it('en propriétaire : preuves écrites et manifeste fidèle à la base', async () => {
    const dossier = path.join(racine, 'export-owner');

    const manifeste = await exporterPreuves(owner, store, dossier);

    expect(manifeste.preuves.map((preuve) => [preuve.cle, preuve.statut])).toEqual([
      [cles.remplacee, 'replaced'],
      [cles.active, 'active'],
    ]);
    expect((await readdir(path.join(dossier, PREUVES_SOUS_DOSSIER))).sort()).toEqual(
      [cles.active, cles.remplacee].sort(),
    );
    const tables = await owner<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    expect(Object.keys(manifeste.comptages)).toEqual(tables.map((table) => table.tablename));
    expect(manifeste.comptages.preuve).toBe(2);
    expect(manifeste.comptages.coureur).toBe(1);
    const migrations = await owner<{ name: string }[]>`
      SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1
    `;
    expect(manifeste.derniereMigration).toBe(migrations[0]!.name);
    expect(manifeste.avertissements).toEqual([]);
  });

  it('sous le rôle applicatif : refus, le RLS filtrerait comptages et preuves', async () => {
    await expect(exporterPreuves(app, store, path.join(racine, 'export-app'))).rejects.toThrow(
      /ne contourne pas le RLS/,
    );
  });
});
