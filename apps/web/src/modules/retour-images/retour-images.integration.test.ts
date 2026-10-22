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

import { MAX_TEMOIGNAGES_PAR_ORG } from './domain';
import { TemoignageNotFoundError, TemoignagesLimitError } from './errors';
import {
  createRetourImagesStore,
  type RetourImagesStore,
} from './store';
import {
  createTemoignage,
  deleteTemoignage,
  getRetourImagesPage,
  setTrailerUrl,
  updateTemoignage,
} from './service';

// Story 2.5 — intégration retour en images (base azzel_test, rôle azzel_app) :
// CRUD témoignages org-scopé (max 6), trailer CHECK https, invisibilité croisée
// inter-organisations (RLS), lecture publique pré-session.

const testUrls = resolveTestDatabaseUrls('retour-images');

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
  'retour-images — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let owner: postgres.Sql;
    let app: postgres.Sql;
    let store: RetourImagesStore;
    let orgAId = '';
    let orgBId = '';
    let sessionA: SessionRecord;
    let sessionB: SessionRecord;

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner, app } = connections);
      store = createRetourImagesStore(app);

      const organisations =
        await owner<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgAId = organisations[0]?.id ?? '';
      if (!orgAId) {
        throw new Error('Seed « ait-aissi » absente : lance pnpm -F @azzel/web db:migrate');
      }
      orgBId = randomUUID();
      await owner`
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

    it('CRUD témoignages org-scopé : création (ordre auto en fin), mise à jour, suppression', async () => {
      const premier = await createTemoignage(
        sessionA,
        { citation: 'Des sentiers magnifiques.', prenom: 'Yacine', editionReference: 'Trail 2026' },
        { store },
      );
      expect(premier).toMatchObject({ prenom: 'Yacine', ordre: 1 });

      const deuxieme = await createTemoignage(
        sessionA,
        {
          citation: 'Une organisation impeccable.',
          prenom: 'Nadia',
          editionReference: 'Trail 2026',
        },
        { store },
      );
      expect(deuxieme.ordre).toBe(2);

      const modifie = await updateTemoignage(
        sessionA,
        premier.id,
        { citation: 'Des sentiers sublimes.', ordre: 5 },
        { store },
      );
      expect(modifie).toMatchObject({ citation: 'Des sentiers sublimes.', ordre: 5 });

      // Ordre d'affichage : 2 avant 5, l'ordre défini par l'admin prime.
      const liste = await store.listTemoignages(orgAId);
      expect(liste.map((temoignage) => temoignage.id)).toEqual([deuxieme.id, premier.id]);

      await expect(deleteTemoignage(sessionA, deuxieme.id, { store })).resolves.toEqual({
        ok: true,
      });
      await expect(deleteTemoignage(sessionA, premier.id, { store })).resolves.toEqual({
        ok: true,
      });
      await expect(store.listTemoignages(orgAId)).resolves.toEqual([]);
    });

    it('max 6 témoignages par organisation : création refusée au 7ᵉ', async () => {
      for (let index = 0; index < MAX_TEMOIGNAGES_PAR_ORG; index += 1) {
        await createTemoignage(
          sessionB,
          {
            citation: `Témoignage numéro ${index + 1}.`,
            prenom: `Coureur${index + 1}`,
            editionReference: 'Trail 2026',
          },
          { store },
        );
      }
      await expect(
        createTemoignage(
          sessionB,
          { citation: 'Un de trop.', prenom: 'Septieme', editionReference: 'Trail 2026' },
          { store },
        ),
      ).rejects.toBeInstanceOf(TemoignagesLimitError);
      expect((await store.listTemoignages(orgBId)).length).toBe(MAX_TEMOIGNAGES_PAR_ORG);
      // La suppression libère une place.
      const liste = await store.listTemoignages(orgBId);
      await deleteTemoignage(sessionB, liste[0]!.id, { store });
      await expect(
        createTemoignage(
          sessionB,
          { citation: 'La place est libérée.', prenom: 'Retour', editionReference: 'Trail 2026' },
          { store },
        ),
      ).resolves.toMatchObject({ prenom: 'Retour' });
    });

    it('concurrence sur la limite : verrou consultatif — deux créations parallèles à 5, une seule passe', async () => {
      // Départ propre : 5 témoignages, la limite est 6.
      for (const temoignage of await store.listTemoignages(orgBId)) {
        await deleteTemoignage(sessionB, temoignage.id, { store });
      }
      for (let index = 0; index < MAX_TEMOIGNAGES_PAR_ORG - 1; index += 1) {
        await createTemoignage(
          sessionB,
          {
            citation: `Course parallèle ${index + 1}.`,
            prenom: `Coureur${index + 1}`,
            editionReference: 'Trail 2026',
          },
          { store },
        );
      }
      // Deux créations concurrentes (connexions séparées du pool) : sans
      // pg_advisory_xact_lock, les deux count voient 5 et insèrent (7 lignes).
      const resultats = await Promise.allSettled([
        createTemoignage(
          sessionB,
          { citation: 'Concurrent A.', prenom: 'ConcurrentA', editionReference: 'Trail 2026' },
          { store },
        ),
        createTemoignage(
          sessionB,
          { citation: 'Concurrent B.', prenom: 'ConcurrentB', editionReference: 'Trail 2026' },
          { store },
        ),
      ]);
      const reussies = resultats.filter((resultat) => resultat.status === 'fulfilled');
      const refusees = resultats.filter((resultat) => resultat.status === 'rejected');
      expect(reussies).toHaveLength(1);
      expect(refusees).toHaveLength(1);
      expect((refusees[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        TemoignagesLimitError,
      );
      expect(await store.listTemoignages(orgBId)).toHaveLength(MAX_TEMOIGNAGES_PAR_ORG);
    });

    it('CHECK ordre : 1–9999 refusés hors bornes en base (défense en profondeur)', async () => {
      for (const ordreInvalide of [0, 10000]) {
        await expect(
          store.createTemoignage({
            organisationId: orgAId,
            citation: 'Ordre hors bornes.',
            prenom: 'Tricheur',
            editionReference: 'Trail 2026',
            ordre: ordreInvalide,
          }),
        ).rejects.toThrowError(/ordre|check/i);
      }
    });

    it('CHECK contraintes : citation ≤ 280 refusée en base (défense en profondeur)', async () => {
      await expect(
        store.createTemoignage({
          organisationId: orgAId,
          citation: 'x'.repeat(281),
          prenom: 'Tricheur',
          editionReference: 'Trail 2026',
          ordre: null,
        }),
      ).rejects.toThrowError(/temoignage_citation|check/i);
    });

    it('trailer : set https, relecture, retrait (null) — CHECK https en base', async () => {
      await setTrailerUrl(sessionA, { trailerUrl: 'https://youtu.be/AbCdEf12345' }, { store });
      const config = await store.findMediaConfig(orgAId);
      expect(config?.trailerUrl).toBe('https://youtu.be/AbCdEf12345');

      // CHECK trailer_url ~ '^https://' : une écriture SQL directe en http est
      // refusée par la base, même si l'application était contournée (l'UPDATE
      // passe en propriétaire — le rôle applicatif sans GUC ne voit aucune
      // ligne, c'est le RLS, pas la contrainte, qui parlerait).
      await expect(
        owner`UPDATE vitrine_media_config SET trailer_url = ${'http://video.dz/t.mp4'} WHERE organisation_id = ${orgAId}`,
      ).rejects.toThrowError(/https|check/i);

      await setTrailerUrl(sessionA, { trailerUrl: '' }, { store });
      await expect(store.findMediaConfig(orgAId)).resolves.toMatchObject({
        trailerUrl: null,
      });
    });

    it('cross-org invisible : B ne voit ni ne modifie les témoignages ni le trailer de A (RLS)', async () => {
      const temoignageA = await createTemoignage(
        sessionA,
        { citation: 'Réservé à A.', prenom: 'Yacine', editionReference: 'Trail 2026' },
        { store },
      );
      await setTrailerUrl(sessionA, { trailerUrl: 'https://media.dz/a.mp4' }, { store });

      const visiblesB = await store.listTemoignages(orgBId);
      expect(visiblesB.map((temoignage) => temoignage.id)).not.toContain(temoignageA.id);
      await expect(
        updateTemoignage(sessionB, temoignageA.id, { citation: 'Pirate' }, { store }),
      ).rejects.toBeInstanceOf(TemoignageNotFoundError);
      await expect(deleteTemoignage(sessionB, temoignageA.id, { store })).rejects.toBeInstanceOf(
        TemoignageNotFoundError,
      );

      // Le trailer de B est indépendant de celui de A.
      await setTrailerUrl(sessionB, { trailerUrl: 'https://media.dz/b.mp4' }, { store });
      await expect(store.findMediaConfig(orgAId)).resolves.toMatchObject({
        trailerUrl: 'https://media.dz/a.mp4',
      });
      await expect(store.findMediaConfig(orgBId)).resolves.toMatchObject({
        trailerUrl: 'https://media.dz/b.mp4',
      });

      const intact = await store.findTemoignageById(temoignageA.id, orgAId);
      expect(intact?.citation).toBe('Réservé à A.');
    });

    it('lecture publique : organisation par défaut, ordre admin, résolution du rendu', async () => {
      // La matière de A vit sur l'organisation par défaut (slug ait-aissi).
      await setTrailerUrl(sessionA, { trailerUrl: 'https://youtu.be/AbCdEf12345' }, { store });
      const page = await getRetourImagesPage({ store });
      expect(page.trailer).toEqual({
        kind: 'iframe',
        url: 'https://www.youtube.com/embed/AbCdEf12345',
      });
      expect(page.temoignages.length).toBeGreaterThan(0);
      expect(page.temoignages[0]?.initiales).toMatch(/^[A-Z]{1,2}$/);
    });
  },
);
