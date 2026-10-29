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

import { resolvePartenaires, MAX_SPONSORS_PAR_ORG } from './domain';
import { SponsorNotFoundError, SponsorsLimitError } from './errors';
import { getSponsorsAdminState, createSponsor, deleteSponsor, setSponsorMode, updateSponsor } from './service';
import { createSponsorsStore, type SponsorsStore } from './store';

// Story 2.3 — intégration sponsors (base azzel_test, rôle azzel_app) :
// CRUD org-scopé, config mode A/B, exclusivité du flag signature et
// invisibilité croisée inter-organisations (RLS, FR-27).

const testUrls = resolveTestDatabaseUrls('sponsors');

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
  'sponsors — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let store: SponsorsStore;
    let orgAId = '';
    let orgBId = '';
    let sessionA: SessionRecord;
    let sessionB: SessionRecord;

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      store = createSponsorsStore(app);

      const organisations =
        await sql<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgAId = organisations[0]?.id ?? '';
      if (!orgAId) {
        throw new Error('Seed « ait-aissi » absente : lance pnpm -F @azzel/web db:migrate');
      }
      // Organisation B en fixture propriétaire (DML uniquement).
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

    it('CRUD org-scopé : création, mise à jour, suppression, listes par organisation', async () => {
      const cree = await createSponsor(
        sessionA,
        { name: 'Ifri', url: 'https://ifri.dz', signature: true },
        { store },
      );
      expect(cree).toMatchObject({ nom: 'Ifri', url: 'https://ifri.dz', signature: true });

      const modifie = await updateSponsor(
        sessionA,
        cree.id,
        { name: 'Ifri Eau', logoUrl: 'https://ifri.dz/logo.png' },
        { store },
      );
      expect(modifie).toMatchObject({
        nom: 'Ifri Eau',
        url: 'https://ifri.dz',
        logoUrl: 'https://ifri.dz/logo.png',
        signature: true,
      });

      const listeA = await store.listSponsors(orgAId);
      expect(listeA.map((sponsor) => sponsor.id)).toEqual([cree.id]);

      await expect(deleteSponsor(sessionA, cree.id, { store })).resolves.toEqual({ ok: true });
      await expect(store.findSponsorById(cree.id, orgAId)).resolves.toBeNull();
    });

    it('config mode : défaut A sans ligne, set B puis retour A (upsert)', async () => {
      const initial = await getSponsorsAdminState(sessionA, { store });
      expect(initial.mode).toBe('A');
      expect(initial.sponsors).toEqual([]);

      await expect(setSponsorMode(sessionA, { mode: 'B' }, { store })).resolves.toMatchObject({
        mode: 'B',
      });
      await expect((await getSponsorsAdminState(sessionA, { store })).mode).toBe('B');
      await expect(setSponsorMode(sessionA, { mode: 'A' }, { store })).resolves.toMatchObject({
        mode: 'A',
      });
    });

    it('exclusivité du flag signature : une seule ligne marquée par organisation', async () => {
      const premier = await createSponsor(sessionA, { name: 'Premier' }, { store });
      const signature = await createSponsor(
        sessionA,
        { name: 'Ifri', signature: true },
        { store },
      );
      expect(premier.signature).toBe(false);
      expect(signature.signature).toBe(true);

      // Re-signature du premier : le flag quitte Ifri.
      const reSigne = await updateSponsor(sessionA, premier.id, { signature: true }, { store });
      expect(reSigne.signature).toBe(true);
      const ifri = await store.findSponsorById(signature.id, orgAId);
      expect(ifri?.isSignature).toBe(false);
    });

    it('cross-org invisible : B ne voit ni ne modifie les sponsors de A (RLS)', async () => {
      const sponsorA = await createSponsor(sessionA, { name: 'Ifri' }, { store });
      await createSponsor(sessionB, { name: 'Sponsor B' }, { store });

      const listeB = await store.listSponsors(orgBId);
      expect(listeB.map((sponsor) => sponsor.name)).toEqual(['Sponsor B']);

      await expect(
        updateSponsor(sessionB, sponsorA.id, { name: 'Pirate' }, { store }),
      ).rejects.toBeInstanceOf(SponsorNotFoundError);
      await expect(deleteSponsor(sessionB, sponsorA.id, { store })).rejects.toBeInstanceOf(
        SponsorNotFoundError,
      );
      const intact = await store.findSponsorById(sponsorA.id, orgAId);
      expect(intact?.name).toBe('Ifri');
    });

    it('lecture publique : org par défaut (ait-aissi), mode sans config → A', async () => {
      const { mode, sponsors } = await store.readDefaultOrgPartenaires();
      expect(mode).toBe('A');
      expect(sponsors.length).toBeGreaterThan(0);
      expect(
        sponsors.every((sponsor) => sponsor.organisationId === orgAId),
      ).toBe(true);
      // Résolution vitrine cohérente avec la présence de sponsors.
      expect(resolvePartenaires(mode, sponsors)).not.toBeNull();
    });

    it('validation en base : nom > 80 caractères refusé par le CHECK (défense en profondeur)', async () => {
      await expect(
        store.createSponsor({
          organisationId: orgAId,
          name: 'y'.repeat(81),
          url: null,
          logoUrl: null,
          isSignature: false,
        }),
      ).rejects.toThrow();
    });

    it('index unique partiel : deux sponsors signature concurrents impossibles', async () => {
      await sql`
        INSERT INTO sponsor (organisation_id, name, is_signature)
        VALUES (${orgBId}, 'Sig Un', true)
      `;
      await expect(sql`
        INSERT INTO sponsor (organisation_id, name, is_signature)
        VALUES (${orgBId}, 'Sig Deux', true)
      `).rejects.toThrow(/sponsor_signature_unique/);
    });

    it('plafond : création refusée au-delà de 20 sponsors par organisation, sans effet sur l’autre org', async () => {
      const existants = await store.listSponsors(orgBId);
      for (let i = existants.length; i < MAX_SPONSORS_PAR_ORG; i += 1) {
        await createSponsor(sessionB, { name: `Comblement ${i + 1}` }, { store });
      }
      await expect(
        createSponsor(sessionB, { name: 'Trop' }, { store }),
      ).rejects.toBeInstanceOf(SponsorsLimitError);
      // Limite strictement par organisation : orgA continue de créer.
      await expect(
        createSponsor(sessionA, { name: 'Encore possible A' }, { store }),
      ).resolves.toBeTruthy();
    });

    it('plafond sous concurrence : createSponsor attend le verrou consultatif de l’organisation', async () => {
      // Un test « deux créations en parallèle » ne prouve rien ici : la fenêtre
      // entre count et INSERT est trop courte pour que les transactions se
      // chevauchent (il passait aussi sans verrou). On tient donc NOUS-MÊMES le
      // verrou de l'organisation, sur une autre connexion : la création doit
      // rester bloquée tant qu'on ne l'a pas relâché.
      let terminee = false;
      let creation: Promise<unknown> = Promise.resolve();
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${`sponsor:${orgAId}`}))`;
        creation = createSponsor(sessionA, { name: 'Attend le verrou' }, { store }).finally(() => {
          terminee = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(terminee, 'createSponsor n’a pas attendu le verrou').toBe(false);
      });
      // Verrou relâché au commit : la création aboutit.
      await creation;
      expect(terminee).toBe(true);
    });
  },
);
