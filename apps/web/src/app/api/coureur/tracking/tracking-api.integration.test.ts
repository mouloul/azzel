import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import { withOrg } from '@/db/org-scope';
import type { SessionRecord } from '@/modules/iam/store';
import { createIamStore, type IamStore } from '@/modules/iam/store';
import { sha256Hex } from '@/modules/iam/service';
import { createTrackingStore, type TrackingStore } from '@/modules/tracking/store';

import { POST as postAppareil } from '@/app/api/coureur/tracking/appareil/route';
import { POST as postSync } from '@/app/api/coureur/tracking/sync/route';
import { POST as postVerify } from '@/app/api/auth/verify/route';
import { GET as getDossier } from '@/app/api/coureur/dossier/route';
import { requestLoginCode, type SendCodeFn } from '@/modules/iam/service';

// Story 6.2 — intégration tracking (base azzel_test, rôle azzel_app) : les
// VRAIS handlers de routes pilotés avec les stores injectés via les globales
// de mémoïsation. Couvert : enregistrement (session → jeton brut une fois),
// sync end-to-end accepté/déjà-connu/idempotence (ON CONFLICT), jeton appareil
// INDÉPENDANT des sessions (AD-5 — un login web ailleurs ne coupe pas la sync),
// appareil révoqué → 401, RLS multi-org, lot > 200 → 413, position invalide
// rejetée par position (jamais stockée).

const testUrls = resolveTestDatabaseUrls('tracking-api');

const BASE = 'http://localhost:3000';

type GlobalsAvecStores = typeof globalThis & {
  __azzelIamStore?: IamStore;
  __azzelTrackingStore?: TrackingStore;
};

type PrecedentsStores = {
  __azzelIamStore?: IamStore;
  __azzelTrackingStore?: TrackingStore;
} | null;

describe.skipIf(testUrls === null)(
  'API tracking coureurs — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let iamStore: IamStore;
    let organisationId: string;
    let precedents: PrecedentsStores = null;

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      iamStore = createIamStore(connections.app);

      // Injection des stores dans les globales de mémoïsation : les handlers
      // de routes (service sans deps) servent la base de test, rôle azzel_app.
      const globals = globalThis as GlobalsAvecStores;
      precedents = {
        __azzelIamStore: globals.__azzelIamStore,
        __azzelTrackingStore: globals.__azzelTrackingStore,
      };
      globals.__azzelIamStore = iamStore;
      globals.__azzelTrackingStore = createTrackingStore(connections.app);

      const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      organisationId = organisations[0]?.id as string;
    }, 60_000);

    afterAll(async () => {
      const globals = globalThis as GlobalsAvecStores;
      if (precedents) {
        globals.__azzelIamStore = precedents.__azzelIamStore;
        globals.__azzelTrackingStore = precedents.__azzelTrackingStore;
      }
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    /** Coureur de l'org A avec une session posée directement en base. */
    async function coureurAvecSession(): Promise<{ session: SessionRecord; token: string }> {
      const accountId = randomUUID();
      const email = `tracking-${accountId}@test.azzel`;
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${email}, 'coureur')
      `;
      const token = `jeton-tracking-${randomUUID()}`;
      await sql`
        INSERT INTO session (organisation_id, account_id, token_hash, expires_at)
        VALUES (${organisationId}, ${accountId}, ${sha256Hex(token)}, now() + interval '30 days')
      `;
      return {
        session: {
          accountId,
          organisationId,
          email,
          role: 'coureur',
          createdAt: new Date(),
        },
        token,
      };
    }

    function requeteAppareil(token: string, appareilClient: string): NextRequest {
      const corps = JSON.stringify({ appareilClient });
      return new NextRequest(BASE + '/api/coureur/tracking/appareil', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(new TextEncoder().encode(corps).length),
          authorization: `Bearer ${token}`,
        },
        body: corps,
      });
    }

    function requeteSync(jeton: string, corpsIn: unknown): NextRequest {
      const corps = JSON.stringify(corpsIn);
      return new NextRequest(BASE + '/api/coureur/tracking/sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(new TextEncoder().encode(corps).length),
          authorization: `Bearer ${jeton}`,
        },
        body: corps,
      });
    }

    function position(capteA: string, surcharge: { lat?: number; lon?: number } = {}) {
      return { version: 1, lat: 36.712345, lon: 3.187654, capteA, ...surcharge };
    }

    it('enregistrement : session → jeton BRUT une fois ; sans session → 401', async () => {
      const { token } = await coureurAvecSession();

      const refus = await postAppareil(requeteAppareil('jeton-inconnu', 'app-trk-enr'));
      expect(refus.status).toBe(401);

      const response = await postAppareil(requeteAppareil(token, 'app-trk-enr'));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { appareilServeurId: string; jeton: string };
      expect(body.jeton.length).toBeGreaterThan(20);
      // Seul le HASH vit en base : le jeton brut n'apparaît nulle part.
      const hashes = await sql`SELECT jeton_hash FROM appareil_coureur WHERE id = ${body.appareilServeurId}`;
      expect(hashes[0]?.jeton_hash).toBe(sha256Hex(body.jeton));
      expect(hashes[0]?.jeton_hash).not.toBe(body.jeton);
    });

    it('sync end-to-end : accepté puis déjà-connu, rejeu SANS doublon (idempotence)', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-sync'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      // Lot VIDE : sync réussie — last_sync_at est rafraîchi AUSSI pour un
      // lot vide (l'appareil a parlé, l'audit le raconte).
      const vide = await postSync(requeteSync(jeton, { appareilId: 'app-trk-sync', positions: [] }));
      expect(vide.status).toBe(200);
      const appareilApresVide = await sql<{ last_sync_at: Date | null }[]>`
        SELECT last_sync_at FROM appareil_coureur WHERE jeton_hash = ${sha256Hex(jeton)}
      `;
      expect(appareilApresVide[0]?.last_sync_at).not.toBeNull();

      const positions = [
        position('2027-05-16T07:05:09.000Z'),
        position('2027-05-16T07:12:09.000Z'),
      ];
      const premier = await postSync(
        requeteSync(jeton, { appareilId: 'app-trk-sync', positions }),
      );
      expect(premier.status).toBe(200);
      const corpsPremier = (await premier.json()) as {
        resultats: { cle: string; statut: string }[];
        compteurs: { acceptes: number; dejaConnus: number; rejetes: number };
      };
      expect(corpsPremier.compteurs).toEqual({ acceptes: 2, dejaConnus: 0, rejetes: 0 });
      expect(corpsPremier.resultats[0]?.cle).toBe(
        'position:v1:app-trk-sync:2027-05-16T07:05:09.000Z',
      );

      // Rejeu du MÊME lot : chaque clé est déjà-connue, aucune nouvelle ligne.
      const totalAvant =
        await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM position`;
      const rejeu = await postSync(
        requeteSync(jeton, { appareilId: 'app-trk-sync', positions }),
      );
      expect(rejeu.status).toBe(200);
      const corpsRejeu = (await rejeu.json()) as {
        compteurs: { acceptes: number; dejaConnus: number; rejetes: number };
      };
      expect(corpsRejeu.compteurs).toEqual({ acceptes: 0, dejaConnus: 2, rejetes: 0 });
      const totalApres =
        await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM position`;
      expect(totalApres[0]?.count).toBe(totalAvant[0]?.count);

      // last_sync_at rafraîchi par l'ingestion réussie.
      const appareil = await sql<{ last_sync_at: Date | null }[]>`
        SELECT last_sync_at FROM appareil_coureur WHERE jeton_hash = ${sha256Hex(jeton)}
      `;
      expect(appareil[0]?.last_sync_at).not.toBeNull();
    });

    it('AD-5 : un login web APRÈS l’app tue la session mais PAS la sync positions', async () => {
      const { session, token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-ad5'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      // Login web du même compte : la session unique révoque TOUTES les
      // sessions interactives antérieures — la session native ci-dessus meurt.
      let codeCapte = '';
      const sendCode: SendCodeFn = async (_email: string, code: string) => {
        codeCapte = code;
      };
      await requestLoginCode(session.email, { store: iamStore, sendCode });
      const responseWeb = await postVerify(
        new NextRequest(BASE + '/api/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: session.email, code: codeCapte }),
          duplex: 'half',
        }),
      );
      expect(responseWeb.status).toBe(200);

      // La session native est morte (401) : le login web a révoqué les
      // sessions interactives antérieures du compte (session unique AD-5).
      const dossier = await getDossier(
        new NextRequest(BASE + '/api/coureur/dossier', {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(dossier.status).toBe(401);

      // …mais la sync positions CONTINUE : le jeton d'appareil est indépendant.
      const sync = await postSync(
        requeteSync(jeton, {
          appareilId: 'app-trk-ad5',
          positions: [position('2027-05-16T08:05:09.000Z')],
        }),
      );
      expect(sync.status).toBe(200);
      const corps = (await sync.json()) as {
        compteurs: { acceptes: number };
      };
      expect(corps.compteurs.acceptes).toBe(1);
    });

    it('appareil révoqué : 401 DÉDIÉ tracking.appareil_revoked, rien n’est ingéré', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-revok'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      await sql`UPDATE appareil_coureur SET revoked_at = now() WHERE jeton_hash = ${sha256Hex(jeton)}`;

      const totalAvant =
        await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM position`;
      const response = await postSync(
        requeteSync(jeton, { appareilId: 'app-trk-revok', positions: [position('2027-05-16T09:05:09.000Z')] }),
      );
      expect(response.status).toBe(401);
      const corps = (await response.json()) as { error: { code: string } };
      expect(corps.error.code).toBe('tracking.appareil_revoked');
      const totalApres =
        await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM position`;
      expect(totalApres[0]?.count).toBe(totalAvant[0]?.count);
    });

    it('RLS multi-org : les positions de l’org A sont INVISIBLES sous le GUC de l’org B', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-rls'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };
      const sync = await postSync(
        requeteSync(jeton, {
          appareilId: 'app-trk-rls',
          positions: [position('2027-05-16T10:05:09.000Z')],
        }),
      );
      expect(sync.status).toBe(200);

      // Organisation B (DML propriétaire) : sous son GUC, la table position
      // ne montre RIEN de l'org A (RLS stricte pattern 0020).
      const orgB = randomUUID();
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgB}, ${`org-tracking-${orgB.slice(0, 8)}`}, 'Tracking Autre Org')
      `;
      const vuesDepuisB = await withOrg(app, orgB, async (tx) => {
        const rows = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM position`;
        return rows[0]?.count ?? 0;
      });
      expect(vuesDepuisB).toBe(0);

      // …tandis que sous le GUC de l'org A, la position est là.
      const vuesDepuisA = await withOrg(app, organisationId, async (tx) => {
        const rows = await tx<{ count: number }[]>`
          SELECT count(*)::int AS count FROM position
          WHERE organisation_id = ${organisationId}
        `;
        return rows[0]?.count ?? 0;
      });
      expect(vuesDepuisA).toBeGreaterThan(0);
    });

    it('lot > 200 : 413 tracking.lot_trop_grand, rien n’est ingéré', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-413'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      const positions = Array.from({ length: 201 }, (_, index) =>
        position(new Date(Date.UTC(2027, 4, 16, 7, 0, index)).toISOString()),
      );
      const response = await postSync(requeteSync(jeton, { appareilId: 'app-trk-413', positions }));
      expect(response.status).toBe(413);
      const corps = (await response.json()) as { error: { code: string } };
      expect(corps.error.code).toBe('tracking.lot_trop_grand');
    });

    it('position invalide (lat 999) : rejetée PAR POSITION, jamais stockée', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-invalid'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      const response = await postSync(
        requeteSync(jeton, {
          appareilId: 'app-trk-invalid',
          positions: [position('2027-05-16T11:05:09.000Z', { lat: 999 }), position('2027-05-16T11:12:09.000Z')],
        }),
      );
      expect(response.status).toBe(200);
      const corps = (await response.json()) as {
        resultats: { statut: string; motif?: string }[];
        compteurs: { acceptes: number; rejetes: number };
      };
      expect(corps.compteurs).toEqual({ acceptes: 1, dejaConnus: 0, rejetes: 1 });
      expect(corps.resultats[0]).toEqual({ cle: '', statut: 'rejeté', motif: 'position invalide' });

      const invalides = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM position
        WHERE cle_idempotence LIKE 'position:v1:app-trk-invalid:2027-05-16T11:05:09%'
      `;
      expect(invalides[0]?.count).toBe(0);
    });

    it('appareil du lot incohérent avec le Bearer : 400 (le serveur dispose)', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-dispose'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      const response = await postSync(
        requeteSync(jeton, {
          appareilId: 'appareil-etranger',
          positions: [position('2027-05-16T12:05:09.000Z')],
        }),
      );
      expect(response.status).toBe(400);
      const corps = (await response.json()) as { error: { code: string } };
      expect(corps.error.code).toBe('tracking.position_invalide');
    });

    it('capteA dupliqué DANS le lot : pas d’erreur SQL, UNE SEULE ligne stockée', async () => {
      const { token } = await coureurAvecSession();
      const enregistrement = await postAppareil(requeteAppareil(token, 'app-trk-dup'));
      const { jeton } = (await enregistrement.json()) as { jeton: string };

      // Deux positions de même capteA (clé identique deux fois dans le même
      // INSERT unnest) : DO NOTHING absorbe le doublon intrinsèque — la clé
      // est connue du serveur, les deux résultats le disent, mais UNE SEULE
      // ligne vit en base (l'appareil réel ne peut pas produire ce lot :
      // PRIMARY KEY outbox).
      const doublon = position('2027-05-16T13:05:09.000Z');
      const response = await postSync(
        requeteSync(jeton, { appareilId: 'app-trk-dup', positions: [doublon, doublon] }),
      );
      expect(response.status).toBe(200);
      const corps = (await response.json()) as {
        resultats: { statut: string }[];
        compteurs: { acceptes: number; dejaConnus: number; rejetes: number };
      };
      expect(corps.compteurs.rejetes).toBe(0);
      expect(corps.resultats.every((resultat) => resultat.statut !== 'rejeté')).toBe(true);
      const total = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM position
        WHERE cle_idempotence LIKE 'position:v1:app-trk-dup:%'
      `;
      expect(total[0]?.count).toBe(1);

      // Rejeu du lot : déjà-connu, toujours une seule ligne.
      const rejeu = await postSync(
        requeteSync(jeton, { appareilId: 'app-trk-dup', positions: [doublon, doublon] }),
      );
      expect(rejeu.status).toBe(200);
      const totalApres = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM position
        WHERE cle_idempotence LIKE 'position:v1:app-trk-dup:%'
      `;
      expect(totalApres[0]?.count).toBe(1);
    });
  },
);
