import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PositionTerrain } from '@azzel/shared';

import { resetOrganisationIdMemoForTests } from '@/db/org-scope';
import type { SessionRecord } from '@/modules/iam/store';
import { createContenusStore } from '@/modules/contenus/store';

import {
  getPositionsPubliques,
  getTracesPubliques,
  resetCarteCachesForTests,
} from './carte';
import { createChronoStore } from './store';
import { createTrackingStore, hashJetonAppareil } from '@/modules/tracking/store';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

// Story 7.3 — intégration carte publique anonyme (base azzel_test, rôle
// azzel_app) : getPositionsPubliques sur l'organisation PAR DÉFAUT (aucune
// session, AD-7) au-dessus du store tracking.dernieresPositions — UNE pastille
// par COUREUR (2 appareils → la plus récente), validé+numéroté+édition
// courante seulement, estompée calculée serveur (1 h, assumption balisée),
// RLS multi-org, anonymat (colonnes exactes) ; getTracesPubliques : gpx_url
// lu en base, fetch serveur INJECTÉ (fixture GPX, 404 isolé), échantillonnage
// ≤ 500. Les heures sont RELATIVES à l'horloge réelle : aucune bombe
// temporelle.

const testUrls = resolveTestDatabaseUrls('carte');

function position(capteA: Date, lat = 36.5512, lon = 4.3601): PositionTerrain {
  return { version: 1, lat, lon, capteA: capteA.toISOString() };
}

describe.skipIf(testUrls === null)(
  'chrono — intégration carte publique (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;

    const chronoStore = () => createChronoStore(app);
    const trackingStore = () => createTrackingStore(app);
    const contenusStore = () => createContenusStore(app);

    let orgAId = '';
    let orgBId = '';
    let editionAId = '';
    let epreuveLongueId = '';

    /** Session factice de coureur (l'enregistrement d'appareil exige une session). */
    function sessionCoureur(organisationId: string): SessionRecord {
      return {
        accountId: randomUUID(),
        organisationId,
        email: `coureur-${randomUUID()}@test.azzel`,
        role: 'coureur',
        createdAt: new Date(),
      };
    }

    async function creerCoureur(input: {
      organisationId: string;
      editionId: string;
      epreuveId: string;
      dossard: number | null;
      status: string;
    }): Promise<{ accountId: string }> {
      const accountId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${input.organisationId}, ${`carte-${accountId}@test.azzel`}, 'coureur')
      `;
      await sql`
        INSERT INTO coureur (
          id, organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status, dossard
        )
        VALUES (
          ${randomUUID()}, ${input.organisationId}, ${accountId}, ${input.editionId}, ${input.epreuveId},
          'Prenom', 'Nom', '+213555010996', 'Contact', '0555010995',
          DATE '1990-05-12', 'M', 36, 'Senior', ${input.status}, ${input.dossard}
        )
      `;
      return { accountId };
    }

    /** Ingestion RÉELLE (store 6.2) : appareil + lot de positions idempotents. */
    async function semerPositions(
      organisationId: string,
      accountId: string,
      appareilClient: string,
      positions: PositionTerrain[],
    ): Promise<void> {
      const store = trackingStore();
      const enregistrement = await store.enregistrerAppareilCoureur({
        organisationId,
        accountId,
        appareilClient,
      });
      const appareil = await store.trouverAppareilParHash(
        hashJetonAppareil(enregistrement.jeton),
      );
      expect(appareil).not.toBeNull();
      await store.insererLotPositions({
        organisationId,
        appareilId: (appareil as { id: string }).id,
        appareilClient,
        positions,
        reception: new Date(),
      });
    }

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      resetOrganisationIdMemoForTests();

      const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgAId = (organisations[0]?.id ?? '') as string;
      if (!orgAId) {
        throw new Error('Seed « ait-aissi » absente (pnpm -F @azzel/web db:migrate).');
      }
      const editions = await sql`
        SELECT id FROM edition WHERE slug = '2027' AND organisation_id = ${orgAId}
      `;
      editionAId = (editions[0]?.id ?? '') as string;
      if (!editionAId) {
        throw new Error('Seed édition « 2027 » absente.');
      }
      const epreuves = await sql<{ id: string }[]>`
        SELECT id FROM epreuve WHERE edition_id = ${editionAId} AND slug = 'longue'
      `;
      epreuveLongueId = epreuves[0]!.id;

      // Édition PASSÉE (2026) : son coureur ne doit JAMAIS apparaître sur la
      // carte de l'édition courante. Revue 7.3 : son épreuve partage le SLUG
      // « longue » avec l'édition courante et porte SON gpx_url — la carte ne
      // doit servir NI son tracé, NI créer de doublon de slug.
      const editionPasseeId = randomUUID();
      const evenementPasseeId = randomUUID();
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementPasseeId}, ${orgAId}, 'carte-2026', 'Carte 2026')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionPasseeId}, ${orgAId}, ${evenementPasseeId}, '2026', 'Carte 2026',
                DATE '2026-05-01', TIMESTAMPTZ '2026-04-20T22:59:59Z')
      `;
      const epreuvePassee = await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km, gpx_url)
        VALUES (${randomUUID()}, ${orgAId}, ${editionPasseeId}, 'longue', 'La Grande Boucle 2026', 35.0,
                'https://cdn.azzel.dz/carte-longue-2026.gpx')
        RETURNING id
      `;

      // Coureurs de l'org A :
      // 201 — validé/numéroté, DEUX appareils (la position la plus récente fait foi)
      // 202 — validé/numéroté, position estompée (> 1 h)
      // 203 — « en constitution » (non validé) avec positions : JAMAIS exposé
      // 204 — validé mais NON numéroté avec positions : JAMAIS exposé
      // 205 — validé/numéroté de l'édition PASSÉE avec positions : JAMAIS exposé
      // 206 — validé/numéroté, appareil RÉVOQUÉ après ingestion : JAMAIS servi
      // 207 — validé/numéroté, position reçue il y a PLUS de 48 h : tombée
      const coureur201 = await creerCoureur({
        organisationId: orgAId,
        editionId: editionAId,
        epreuveId: epreuveLongueId,
        dossard: 201,
        status: 'validé',
      });
      const coureur202 = await creerCoureur({
        organisationId: orgAId,
        editionId: editionAId,
        epreuveId: epreuveLongueId,
        dossard: 202,
        status: 'validé',
      });
      const coureur203 = await creerCoureur({
        organisationId: orgAId,
        editionId: editionAId,
        epreuveId: epreuveLongueId,
        dossard: 203,
        status: 'en constitution',
      });
      const coureur204 = await creerCoureur({
        organisationId: orgAId,
        editionId: editionAId,
        epreuveId: epreuveLongueId,
        dossard: null,
        status: 'validé',
      });
      const coureur206 = await creerCoureur({
        organisationId: orgAId,
        editionId: editionAId,
        epreuveId: epreuveLongueId,
        dossard: 206,
        status: 'validé',
      });
      const coureur207 = await creerCoureur({
        organisationId: orgAId,
        editionId: editionAId,
        epreuveId: epreuveLongueId,
        dossard: 207,
        status: 'validé',
      });
      await creerCoureur({
        organisationId: orgAId,
        editionId: editionPasseeId,
        epreuveId: epreuvePassee[0]!.id as string,
        dossard: 205,
        status: 'validé',
      });

      // Positions RELATIVES à l'horloge réelle.
      await semerPositions(orgAId, coureur201.accountId, 'carte-appareil-201-tel', [
        position(new Date(Date.now() - 40 * 60_000), 36.5512, 4.3601),
      ]);
      await semerPositions(orgAId, coureur201.accountId, 'carte-appareil-201-montre', [
        // LA PLUS RÉCENTE de ses deux appareils : c'est ELLE qui fait foi.
        position(new Date(Date.now() - 2 * 60_000), 36.5702, 4.3901),
      ]);
      await semerPositions(orgAId, coureur202.accountId, 'carte-appareil-202', [
        position(new Date(Date.now() - 90 * 60_000), 36.5602, 4.3711),
      ]);
      await semerPositions(orgAId, coureur203.accountId, 'carte-appareil-203', [
        position(new Date(Date.now() - 5 * 60_000), 36.5802, 4.3811),
      ]);
      await semerPositions(orgAId, coureur204.accountId, 'carte-appareil-204', [
        position(new Date(Date.now() - 5 * 60_000), 36.5902, 4.3911),
      ]);
      // 205 (édition passée) : appareil + position chez l'org A.
      const compte205 = await sql`
        SELECT account_id FROM coureur
        WHERE organisation_id = ${orgAId} AND dossard = 205 AND status = 'validé'
        LIMIT 1
      `;
      await semerPositions(
        orgAId,
        (compte205[0] as { account_id: string }).account_id,
        'carte-appareil-205',
        [position(new Date(Date.now() - 5 * 60_000), 36.5002, 4.3501)],
      );
      // 206 (appareil révoqué) + 207 (réception > 48 h) : semés PUIS
      // neutralisés au propriétaire — la réception d'origine reste « now »
      // pour 206 (c'est la RÉVOCATION qui doit le couler), tandis que 207
      // voit sa réception SERVEUR reculée au-delà de la fenêtre jour J.
      await semerPositions(orgAId, coureur206.accountId, 'carte-appareil-206', [
        position(new Date(Date.now() - 5 * 60_000), 36.5102, 4.3401),
      ]);
      await semerPositions(orgAId, coureur207.accountId, 'carte-appareil-207', [
        position(new Date(Date.now() - 5 * 60_000), 36.5202, 4.3301),
      ]);
      await sql`
        UPDATE appareil_coureur SET revoked_at = now()
        WHERE organisation_id = ${orgAId} AND appareil_client = 'carte-appareil-206'
      `;
      await sql`
        UPDATE position SET recu_a = now() - interval '3 days'
        WHERE appareil_coureur_id = (
          SELECT id FROM appareil_coureur
          WHERE organisation_id = ${orgAId} AND appareil_client = 'carte-appareil-207'
        )
      `;

      // Org B isolée (preuve RLS) : coureur 901 validé/numéroté avec position.
      orgBId = randomUUID();
      const evenementBId = randomUUID();
      const editionBId = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgBId}, ${`carte-${orgBId.slice(0, 8)}`}, 'Carte Autre Org')
      `;
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementBId}, ${orgBId}, ${`carte-${orgBId.slice(0, 8)}`}, 'Autre Trail')
      `;
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionBId}, ${orgBId}, ${evenementBId}, '2027', 'Autre 2027',
                DATE '2027-05-01', TIMESTAMPTZ '2027-04-20T22:59:59Z')
      `;
      const epreuveB = await sql`
        INSERT INTO epreuve (id, organisation_id, edition_id, slug, name, distance_km)
        VALUES (${randomUUID()}, ${orgBId}, ${editionBId}, 'unique', 'L’Unique', 21.0)
        RETURNING id
      `;
      const coureurB = await creerCoureur({
        organisationId: orgBId,
        editionId: editionBId,
        epreuveId: epreuveB[0]!.id as string,
        dossard: 901,
        status: 'validé',
      });
      await semerPositions(orgBId, coureurB.accountId, 'carte-appareil-org-b', [
        position(new Date(Date.now() - 3 * 60_000), 35.5, 3.5),
      ]);
    }, 120_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    beforeEach(() => {
      // Le micro-cache positions est un état module : chaque test doit lire
      // l'état FRAIS de la base. Le cache traces par URL est isolé pareil.
      resetCarteCachesForTests();
    });

    it('UNE pastille par COUREUR : deux appareils → la plus récente fait foi', async () => {
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      const pastilles201 = positions.filter((p) => p.dossard === 201);
      expect(pastilles201).toHaveLength(1);
      expect(pastilles201[0]!.lat).toBe(36.5702);
      expect(pastilles201[0]!.lon).toBe(4.3901);
    });

    it('validé + numéroté + édition COURANTE seulement : 203/204/205/206/207 jamais exposés', async () => {
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      const dossards = positions.map((p) => p.dossard);
      expect(dossards).toContain(201);
      expect(dossards).toContain(202);
      expect(dossards).not.toContain(203);
      expect(dossards).not.toContain(204);
      expect(dossards).not.toContain(205);
      expect(dossards).not.toContain(206);
      expect(dossards).not.toContain(207);
    });

    it('revue 7.3 — fenêtre 48 h sur la réception : la position de 207 (reçue il y a 3 jours) est TOMBÉE', async () => {
      // Preuve du vivant : la position existe BIEN en base (jamais supprimée),
      // c'est la LECTURE carte qui la borne au comportement jour J.
      const lignes = await sql<{ count: string }[]>`
        SELECT count(*) AS count FROM position p
        JOIN appareil_coureur ac ON ac.id = p.appareil_coureur_id
        WHERE ac.appareil_client = 'carte-appareil-207'
      `;
      expect(Number(lignes[0]!.count)).toBe(1);
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      expect(positions.some((p) => p.dossard === 207)).toBe(false);
    });

    it('revue 7.3 — appareil RÉVOQUÉ : plus JAMAIS servi (la position de 206 existe mais reste privée)', async () => {
      const lignes = await sql<{ count: string }[]>`
        SELECT count(*) AS count FROM position p
        JOIN appareil_coureur ac ON ac.id = p.appareil_coureur_id
        WHERE ac.appareil_client = 'carte-appareil-206' AND ac.revoked_at IS NOT NULL
      `;
      expect(Number(lignes[0]!.count)).toBe(1);
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      expect(positions.some((p) => p.dossard === 206)).toBe(false);
    });

    it('estompée calculée SERVEUR : > 1 h estompée, récente pleine — jamais supprimée', async () => {
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      const parDossard = new Map(positions.map((p) => [p.dossard, p]));
      expect(parDossard.get(201)!.estompée).toBe(false);
      expect(parDossard.get(202)!.estompée).toBe(true);
      // Jamais effacée : la position estompée RESTE servie.
      expect(parDossard.get(202)!.lat).toBe(36.5602);
    });

    it('ANONYMAT strict : colonnes EXACTES du contrat public, aucune donnée personnelle', async () => {
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      expect(positions.length).toBeGreaterThan(0);
      for (const positionPublique of positions) {
        expect(Object.keys(positionPublique).sort()).toEqual([
          'capteA',
          'dossard',
          'epreuveNom',
          'epreuveSlug',
          'estompée',
          'lat',
          'lon',
        ]);
      }
      expect(JSON.stringify(positions)).not.toMatch(
        /jeton|prenom|first_name|last_name|email|phone|photo|account|appareil/i,
      );
    });

    it('RLS multi-org : la carte publique ne sert QUE l’organisation par défaut (901 ne fuite pas)', async () => {
      const { positions } = await getPositionsPubliques({
        chronoStore: chronoStore(),
        trackingStore: trackingStore(),
      });
      expect(positions.some((p) => p.dossard === 901)).toBe(false);
      // Preuve du vivant côté B : la lecture org-scopée B voit bien 901.
      const storeB = trackingStore();
      const sousB = await storeB.dernieresPositions(orgBId);
      expect(sousB.map((p) => p.dossard)).toEqual([901]);
    });

    it('traces : gpx_url lu en base, fetch serveur, échantillonnage ≤ 500, 404 ISOLÉ par épreuve', async () => {
      const segments = Array.from(
        { length: 1_200 },
        (_, index) => `<trkpt lat="${(36.5 + index / 10_000).toFixed(6)}" lon="${(4.36 + index / 10_000).toFixed(6)}"/>`,
      ).join('');
      await sql`
        UPDATE epreuve SET gpx_url = 'https://cdn.azzel.dz/carte-longue.gpx'
        WHERE organisation_id = ${orgAId} AND edition_id = ${editionAId} AND slug = 'longue'
      `;
      await sql`
        UPDATE epreuve SET gpx_url = 'https://cdn.azzel.dz/carte-casse.gpx'
        WHERE organisation_id = ${orgAId} AND edition_id = ${editionAId} AND slug = 'moyenne'
      `;
      const fetchGpx = vi.fn(async (url: string) =>
        url.endsWith('carte-casse.gpx')
          ? new Response('Not Found', { status: 404 })
          : new Response(`<gpx><trk><trkseg>${segments}</trkseg></trk></gpx>`, { status: 200 }),
      );
      const { traces } = await getTracesPubliques({
        chronoStore: chronoStore(),
        contenusStore: contenusStore(),
        fetchGpx,
      });
      // 404 isolé : seule « longue » servie, « moyenne » absente — jamais d'erreur.
      expect(traces.map((trace) => trace.epreuveSlug)).toEqual(['longue']);
      const longue = traces[0]!;
      expect(longue.epreuveNom).toBe('La Grande Boucle');
      expect(longue.points).toHaveLength(500);
      expect(longue.points[0]!.lat).toBeCloseTo(36.5, 5);
      expect(longue.points[499]!.lat).toBeCloseTo(36.5 + 1_199 / 10_000, 3);
      // Le GPX brut ne traverse JAMAIS : seules des coordonnées servies.
      expect(JSON.stringify(traces)).not.toMatch(/trkpt|gpx/i);
    });

    it('revue 7.3 — SCOPÉ à l’ÉDITION COURANTE : le slug « longue » existe dans DEUX éditions, seul le tracé 2027 est servi', async () => {
      await sql`
        UPDATE epreuve SET gpx_url = 'https://cdn.azzel.dz/carte-longue.gpx'
        WHERE organisation_id = ${orgAId} AND edition_id = ${editionAId} AND slug = 'longue'
      `;
      // L'épreuve « longue » de l'édition 2026 porte son PROPRE gpx_url
      // (posé au beforeAll) : elle ne doit être NI fetchée NI servie, et le
      // slug ne doit PAS apparaître deux fois.
      const fetchGpx = vi.fn(
        async (_url: string) =>
          new Response('<gpx><trk><trkseg><trkpt lat="10" lon="10"/></trkseg></trk></gpx>', {
            status: 200,
          }),
      );
      const { traces } = await getTracesPubliques({
        chronoStore: chronoStore(),
        contenusStore: contenusStore(),
        fetchGpx,
      });
      const longues = traces.filter((trace) => trace.epreuveSlug === 'longue');
      expect(longues).toHaveLength(1);
      expect(longues[0]!.points).toEqual([{ lat: 10, lon: 10 }]);
      const urls = fetchGpx.mock.calls.map(([url]) => url);
      // Le tracé de l'édition COURANTE est fetché ; celui de l'édition PASSÉE
      // (même slug) ne l'est JAMAIS.
      expect(urls).toContain('https://cdn.azzel.dz/carte-longue.gpx');
      expect(urls).not.toContain('https://cdn.azzel.dz/carte-longue-2026.gpx');
    });
  },
);
