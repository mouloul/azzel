import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import { CONTENU_SLUGS } from './domain';
import { ContenuConflitError, EpreuveAbsenteError } from './errors';
import { getContenusAdminState, getParcoursPage, getRegionPage, updateContenu } from './service';
import { createContenusStore, type ContenusStore } from './store';

// Story 2.4 — intégration contenus (base azzel_test, rôle azzel_app) :
// seeds présents, CRUD org-scopé (RLS), verrou optimiste, upsert, URL GPX par
// épreuve et lecture publique dynamique des pages /parcours et /region.

const testUrls = resolveTestDatabaseUrls('contenus');

function session(organisationId: string, email: string): SessionRecord {
  return {
    accountId: randomUUID(),
    organisationId,
    email,
    role: 'organisateur',
    createdAt: new Date(),
  };
}

describe.skipIf(testUrls === null)(
  'contenus — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let store: ContenusStore;
    let orgAId = '';
    let orgBId = '';
    let sessionA: SessionRecord;
    let sessionB: SessionRecord;

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      store = createContenusStore(app);

      const organisations =
        await sql<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgAId = organisations[0]?.id ?? '';
      if (!orgAId) {
        throw new Error('Seed « ait-aissi » absente : lance pnpm -F @azzel/web db:migrate');
      }
      orgBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`org-b-${orgBId.slice(0, 8)}`}, 'Autre Trail')
      `;
      sessionA = session(orgAId, 'organisateur-a@test.azzel');
      sessionB = session(orgBId, 'organisateur-b@test.azzel');
    }, 60_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    it('seeds : les 7 blocs balisés présents pour l’organisation par défaut, aucun pour B', async () => {
      const state = await getContenusAdminState(sessionA, { store });
      expect(state.blocs.map((bloc) => bloc.slug)).toEqual([...CONTENU_SLUGS]);
      expect(state.blocs.every((bloc) => bloc.titre.length > 0)).toBe(true);
      // Les seeds 2027 sont balisés « à confirmer » (region/consignes : faits stables).
      expect(state.blocs.find((bloc) => bloc.slug === 'parcours-longue')?.aConfirmer).toBe(true);

      const stateB = await getContenusAdminState(sessionB, { store });
      expect(stateB.blocs).toEqual([]);
    });

    it('mise à jour org-scopée : A modifie un bloc, la lecture publique reflète au rechargement', async () => {
      const avant = await store.findContenuBySlug(orgAId, 'region');
      expect(avant).not.toBeNull();
      const modifie = await updateContenu(
        sessionA,
        'region',
        {
          titre: 'Aït Aïssi, porte du Jurjura',
          corps: 'Le village vous accueille au pied du massif.\n\nVenez préparer votre week-end.',
          updatedAt: avant!.updatedAt.toISOString(),
        },
        { store },
      );
      expect(modifie.titre).toBe('Aït Aïssi, porte du Jurjura');
      expect(modifie.aConfirmer).toBe(false);

      const page = await getRegionPage({ store });
      const bloc = page.blocs.find((candidate) => candidate.slug === 'region');
      expect(bloc?.titre).toBe('Aït Aïssi, porte du Jurjura');
      expect(bloc?.corps).toContain('préparer votre week-end');
    });

    it('verrou optimiste : version obsolète ou absente → 409, rien d’écrasé', async () => {
      const avant = await store.findContenuBySlug(orgAId, 'region');
      expect(avant).not.toBeNull();
      const versionLue = avant!.updatedAt.toISOString();

      // Édition concurrente entre deux lectures : la seconde écrit d'abord.
      await updateContenu(
        sessionA,
        'region',
        { titre: 'Premier rédacteur', corps: avant!.corps, updatedAt: versionLue },
        { store },
      );

      // La version lue est désormais obsolète : refus, contenu intact.
      await expect(
        updateContenu(
          sessionA,
          'region',
          { titre: 'Second rédacteur', corps: 'Écrasé ?', updatedAt: versionLue },
          { store },
        ),
      ).rejects.toBeInstanceOf(ContenuConflitError);
      await expect(
        updateContenu(sessionA, 'region', { titre: 'Sans version', corps: 'X' }, { store }),
      ).rejects.toBeInstanceOf(ContenuConflitError);
      const intact = await store.findContenuBySlug(orgAId, 'region');
      expect(intact?.titre).toBe('Premier rédacteur');

      // La version fraîche passe.
      const fraiche = await updateContenu(
        sessionA,
        'region',
        { titre: 'Aït Aïssi, porte du Jurjura', corps: intact!.corps, updatedAt: intact!.updatedAt.toISOString() },
        { store },
      );
      expect(fraiche.titre).toBe('Aït Aïssi, porte du Jurjura');
    });

    it('upsert : un bloc absent (organisation non seedée) est créé par édition', async () => {
      await expect(store.findContenuBySlug(orgBId, 'hebergement')).resolves.toBeNull();
      const cree = await updateContenu(
        sessionB,
        'hebergement',
        { titre: 'Hébergement', corps: 'Gîtes à Yakouren : liste à venir.' },
        { store },
      );
      expect(cree.titre).toBe('Hébergement');
      const stateB = await getContenusAdminState(sessionB, { store });
      expect(stateB.blocs.map((bloc) => bloc.slug)).toEqual(['hebergement']);
    });

    it('cross-org invisible : l’édition de B crée le sien, le bloc de A reste intact (RLS)', async () => {
      const blocA = await store.findContenuBySlug(orgAId, 'region');
      expect(blocA).not.toBeNull();

      // B ne voit pas le bloc de A : son édition upsert un bloc scopé B.
      const creeB = await updateContenu(
        sessionB,
        'region',
        { titre: 'Région de B', corps: 'Autre organisation.' },
        { store },
      );
      expect(creeB.titre).toBe('Région de B');

      const intact = await store.findContenuBySlug(orgAId, 'region');
      expect(intact?.titre).not.toBe('Région de B');
      expect(intact?.id).toBe(blocA!.id);
      const stateB = await getContenusAdminState(sessionB, { store });
      expect(stateB.blocs.find((bloc) => bloc.slug === 'region')?.titre).toBe('Région de B');
    });

    it('gpx_url : écriture et effacement par bloc parcours, CHECK https + 2048 en défense', async () => {
      const avant = await store.findContenuBySlug(orgAId, 'parcours-longue');
      expect(avant).not.toBeNull();
      const version = avant!.updatedAt.toISOString();
      const avecGpx = await updateContenu(
        sessionA,
        'parcours-longue',
        { titre: 'Trail long — 35 km', corps: 'Corps longue.', gpxUrl: 'https://files.exemple.dz/longue.gpx', updatedAt: version },
        { store },
      );
      expect(avecGpx.epreuve).toMatchObject({
        slug: 'longue',
        gpxUrl: 'https://files.exemple.dz/longue.gpx',
      });

      // Reflété côté page publique.
      const page = await getParcoursPage({ store });
      const longue = page.blocs.find((bloc) => bloc.slug === 'parcours-longue');
      expect(longue?.epreuve?.gpxUrl).toBe('https://files.exemple.dz/longue.gpx');
      expect(longue?.epreuve?.distanceKm).toBe(35);

      // Effacement : chaîne vide → null (« Tracé à venir » côté vitrine).
      const apresGpx = await store.findContenuBySlug(orgAId, 'parcours-longue');
      const sansGpx = await updateContenu(
        sessionA,
        'parcours-longue',
        { titre: 'Trail long — 35 km', corps: 'Corps longue.', gpxUrl: '', updatedAt: apresGpx!.updatedAt.toISOString() },
        { store },
      );
      expect(sansGpx.epreuve?.gpxUrl).toBeNull();

      // Défense en profondeur : la contrainte SQL refuse le non-https ET le > 2048,
      // même en écriture directe (XSS stocké impossible côté base).
      await expect(sql`
        UPDATE epreuve SET gpx_url = ${'http://files.exemple.dz/longue.gpx'}
        WHERE organisation_id = ${orgAId} AND slug = 'longue'
      `).rejects.toThrow(/epreuve_gpx_url_valide/);
      await expect(sql`
        UPDATE epreuve SET gpx_url = ${'javascript:alert(document.domain)'}
        WHERE organisation_id = ${orgAId} AND slug = 'longue'
      `).rejects.toThrow(/epreuve_gpx_url_valide/);
      await expect(sql`
        UPDATE epreuve SET gpx_url = ${`https://x.dz/${'a'.repeat(2100)}`}
        WHERE organisation_id = ${orgAId} AND slug = 'longue'
      `).rejects.toThrow(/epreuve_gpx_url_valide/);
    });

    it('gpx sans épreuve (organisation sans épreuves) : 400 dédié, pas un 500', async () => {
      // B n'a aucune épreuve : le GPX de son bloc parcours n'a nulle part où vivre.
      await expect(
        updateContenu(
          sessionB,
          'parcours-moyenne',
          { titre: 'Trail moyen', corps: 'Corps.', gpxUrl: 'https://x.dz/m.gpx' },
          { store },
        ),
      ).rejects.toBeInstanceOf(EpreuveAbsenteError);
    });

    it('lecture publique : /parcours ordonne longue puis moyenne, /region ordonne les 5 blocs', async () => {
      const parcours = await getParcoursPage({ store });
      expect(parcours.blocs.map((bloc) => bloc.slug)).toEqual([
        'parcours-longue',
        'parcours-moyenne',
      ]);
      expect(parcours.blocs.every((bloc) => bloc.epreuve !== null)).toBe(true);

      const region = await getRegionPage({ store });
      expect(region.blocs.map((bloc) => bloc.slug)).toEqual([
        'region',
        'hebergement',
        'restauration',
        'annexes',
        'consignes-securite',
      ]);
    });

    it('validation en base : corps > 20 000 caractères refusé par le CHECK (défense en profondeur)', async () => {
      await expect(sql`
        INSERT INTO contenu_vitrine (organisation_id, slug, titre, corps)
        VALUES (${orgAId}, 'bloc-trop-long', 'Titre', ${'x'.repeat(20001)})
      `).rejects.toThrow(/contenu_vitrine_corps_check|check/);
    });
  },
);
