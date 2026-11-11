import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Le vrai worker ne doit jamais tourner dans ces tests (base DEV + vrais emails).
vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import { POST as postVerify } from '@/app/api/auth/verify/route';
import { GET as getDossier } from '@/app/api/coureur/dossier/route';
import { GET as getEdossard } from '@/app/api/coureur/e-dossard/route';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import type { SessionRecord } from '@/modules/iam/store';
import { createIamStore, type IamStore } from '@/modules/iam/store';
import { requestLoginCode, sha256Hex, type SendCodeFn } from '@/modules/iam/service';
import type { InscriptionFormInput } from '@/modules/inscriptions/domain';
import { LocalDiskProofStore } from '@/modules/inscriptions/proof-store';
import { uploadPreuve } from '@/modules/inscriptions/proof-service';
import {
  acceptDocuments,
  decideDossier,
  submitInscription,
} from '@/modules/inscriptions/service';
import { createInscriptionsStore, type InscriptionsStore } from '@/modules/inscriptions/store';

// Story 6.1 — intégration de la surface API native (base azzel_test, rôle
// azzel_app) : les VRAIS handlers de routes sont pilotés avec les stores
// injectés via les globales de mémoïsation (getIamStore/getInscriptionsStore).
// Couvert : verify client "native" (token UNE fois + AD-5 dans les deux sens),
// Bearer sur les routes coureur, isolation multi-organisation.

const testUrls = resolveTestDatabaseUrls('coureur-api');

const BASE = 'http://localhost:3000';

type GlobalsAvecStores = typeof globalThis & {
  __azzelIamStore?: IamStore;
  __azzelInscriptionsStore?: InscriptionsStore;
};

type PrecedentsStores = {
  __azzelIamStore?: IamStore;
  __azzelInscriptionsStore?: InscriptionsStore;
} | null;

function validInput(overrides: Partial<InscriptionFormInput> = {}): InscriptionFormInput {
  return {
    epreuve: 'longue',
    prenom: 'Yacine',
    nom: 'Amrani',
    telephone: '+213 555 010 203',
    contactUrgenceNom: 'Lounis Amrani',
    contactUrgenceTelephone: '0555 010 204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
    genre: 'H',
    wilaya: '16',
    pays: '',
    hebergement: '',
    ...overrides,
  };
}

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

function requeteGet(chemin: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(BASE + chemin, { headers });
}

function requeteVerify(body: unknown): NextRequest {
  return new NextRequest(BASE + '/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    duplex: 'half',
  });
}

function cookieToken(response: Response): string {
  const raw = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('azzel_session='));
  expect(raw).toBeDefined();
  return (raw as string).split(';')[0]?.split('=')[1] as string;
}

describe.skipIf(testUrls === null)(
  'API coureur natif — intégration Postgres (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let iamStore: IamStore;
    let inscriptionsStore: InscriptionsStore;
    let storageDir = '';
    let organisationId: string;
    let precedents: PrecedentsStores = null;

    beforeAll(async () => {
      storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-coureur-api-it-'));
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql } = connections);
      iamStore = createIamStore(connections.app);
      inscriptionsStore = createInscriptionsStore(connections.app);

      // Injection des stores dans les globales de mémoïsation : les handlers
      // de routes (service sans deps) servent la base de test, rôle azzel_app.
      const globals = globalThis as GlobalsAvecStores;
      precedents = {
        __azzelIamStore: globals.__azzelIamStore,
        __azzelInscriptionsStore: globals.__azzelInscriptionsStore,
      };
      globals.__azzelIamStore = iamStore;
      globals.__azzelInscriptionsStore = inscriptionsStore;

      const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      organisationId = organisations[0]?.id as string;
    }, 60_000);

    afterAll(async () => {
      const globals = globalThis as GlobalsAvecStores;
      if (precedents) {
        globals.__azzelIamStore = precedents.__azzelIamStore;
        globals.__azzelInscriptionsStore = precedents.__azzelInscriptionsStore;
      }
      if (connections) {
        await closeAzzelTestDb(connections);
      }
      if (storageDir) {
        rmSync(storageDir, { recursive: true, force: true });
      }
    });

    async function capturerCode(): Promise<{ sendCode: SendCodeFn; code: () => string }> {
      let captured = '';
      return {
        sendCode: async (_email: string, code: string) => {
          captured = code;
        },
        code: () => captured,
      };
    }

    /** Connexion NATIVE via le vrai handler : renvoie le token Bearer. */
    async function connexionNative(email: string): Promise<string> {
      const capture = await capturerCode();
      await requestLoginCode(email, { store: iamStore, sendCode: capture.sendCode });
      const response = await postVerify(
        requeteVerify({ email, code: capture.code(), client: 'native' }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { token: string };
      return body.token;
    }

    it('verify natif : token renvoyé UNE fois, Bearer accepté sur /api/coureur/dossier', async () => {
      const email = `native-${randomUUID()}@test.azzel`;
      const token = await connexionNative(email);

      const response = await getDossier(
        requeteGet('/api/coureur/dossier', { authorization: `Bearer ${token}` }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        edition: { slug: string } | null;
        pieces: { id: string; fait: boolean }[];
      };
      expect(body.edition?.slug).toBe('2027');
      expect(body.pieces.some((piece) => piece.id === 'email' && piece.fait)).toBe(true);
    });

    it('AD-5 : une connexion web APRÈS l’app révoque le Bearer natif', async () => {
      const email = `ad5-${randomUUID()}@test.azzel`;
      const tokenNatif = await connexionNative(email);

      // Le Bearer natif fonctionne…
      const avant = await getDossier(
        requeteGet('/api/coureur/dossier', { authorization: `Bearer ${tokenNatif}` }),
      );
      expect(avant.status).toBe(200);

      // …puis connexion web (cookie, sans client natif) du même compte.
      const capture = await capturerCode();
      await requestLoginCode(email, { store: iamStore, sendCode: capture.sendCode });
      const responseWeb = await postVerify(
        requeteVerify({ email, code: capture.code() }),
      );
      expect(responseWeb.status).toBe(200);
      const bodyWeb = (await responseWeb.json()) as { token?: string; redirectTo?: string };
      expect(bodyWeb.token).toBeUndefined();
      // Connexion web d'un coureur sans dossier, édition 2027 aux inscriptions
      // ouvertes : première étape non faite de la checklist réelle (Postgres).
      expect(bodyWeb.redirectTo).toBe('/inscription');
      const tokenWeb = cookieToken(responseWeb);
      expect(tokenWeb).not.toBe(tokenNatif);

      // La session unique révoque le jeton natif : Bearer → 401 enveloppe iam.
      const apres = await getDossier(
        requeteGet('/api/coureur/dossier', { authorization: `Bearer ${tokenNatif}` }),
      );
      expect(apres.status).toBe(401);
      const bodyErreur = (await apres.json()) as { error: { code: string } };
      expect(bodyErreur.error.code).toBe('iam.unauthenticated');

      // …tandis que la session web vit sa vie.
      const sessionWeb = await getDossier(
        requeteGet('/api/coureur/dossier', { cookie: `azzel_session=${tokenWeb}` }),
      );
      expect(sessionWeb.status).toBe(200);
    });

    it('routes coureur : dossier validé → checklist verte + e-dossard payloadQr azzel-e1:<jeton>', async () => {
      const proofStore = new LocalDiskProofStore(storageDir);
      const accountId = randomUUID();
      const email = `valide-${accountId}@test.azzel`;
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${email}, 'coureur')
      `;
      const session: SessionRecord = {
        accountId,
        organisationId,
        email,
        role: 'coureur',
        createdAt: new Date(),
      };
      await submitInscription(session, validInput(), { store: inscriptionsStore });
      await uploadPreuve(session, jpegBytes(20_000), {
        store: inscriptionsStore,
        proofStore,
      });
      await acceptDocuments(session, { decharge: true, reglement: true }, {
        store: inscriptionsStore,
      });
      const rows = await sql`SELECT id FROM coureur WHERE account_id = ${accountId}`;
      const organisateur: SessionRecord = {
        accountId: randomUUID(),
        organisationId,
        email: `orga-${randomUUID()}@test.azzel`,
        role: 'organisateur',
        createdAt: new Date(),
      };
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${organisateur.accountId}, ${organisationId}, ${organisateur.email}, 'organisateur')
      `;
      await decideDossier(organisateur, rows[0]?.id as string, { decision: 'valider' }, {
        store: inscriptionsStore,
      });

      const token = await connexionNative(email);

      // Dossier : la pièce « validation » est verte → l'app court-circuite vers
      // l'e-dossard (décision ecranApresDossier).
      const dossier = await getDossier(
        requeteGet('/api/coureur/dossier', { authorization: `Bearer ${token}` }),
      );
      expect(dossier.status).toBe(200);
      const checklist = (await dossier.json()) as { pieces: { id: string; fait: boolean }[] };
      expect(
        checklist.pieces.find((piece) => piece.id === 'validation')?.fait,
      ).toBe(true);

      // E-dossard : disponible + payload QR au contrat shared.
      const edossard = await getEdossard(
        requeteGet('/api/coureur/e-dossard', { authorization: `Bearer ${token}` }),
      );
      expect(edossard.status).toBe(200);
      const etat = (await edossard.json()) as {
        disponible: boolean;
        jeton: string;
        dossard: number | null;
        payloadQr: string;
        editionNom: string;
      };
      expect(etat.disponible).toBe(true);
      expect(etat.jeton).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(etat.dossard).toEqual(expect.any(Number));
      expect(etat.payloadQr).toBe(`azzel-e1:${etat.jeton}`);
      expect(etat.editionNom).toBe('Édition 2027');
    });

    it('e-dossard : dossier non validé → { disponible: false }, aucun jeton en base', async () => {
      const accountId = randomUUID();
      const email = `encours-${accountId}@test.azzel`;
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountId}, ${organisationId}, ${email}, 'coureur')
      `;
      const session: SessionRecord = {
        accountId,
        organisationId,
        email,
        role: 'coureur',
        createdAt: new Date(),
      };
      await submitInscription(session, validInput(), { store: inscriptionsStore });

      const token = await connexionNative(email);
      const response = await getEdossard(
        requeteGet('/api/coureur/e-dossard', { authorization: `Bearer ${token}` }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ disponible: false });
      const jetons =
        await sql`SELECT jeton_edossard FROM coureur WHERE account_id = ${accountId}`;
      expect(jetons[0]?.jeton_edossard).toBeNull();
    });

    it('isolation multi-organisation : la session B ne voit QUE l’édition de son organisation', async () => {
      // Organisation B avec sa propre édition + épreuve (le RLS/GUC fait le
      // cloisonnement — aucune fuite de l’édition A vers B par l’API).
      const orgB = randomUUID();
      const suffixe = randomUUID().slice(0, 8);
      await sql`
        INSERT INTO organisation (id, slug, name)
        VALUES (${orgB}, ${`org-api-${suffixe}`}, 'Autre organisation')
      `;
      const evenementB = randomUUID();
      await sql`
        INSERT INTO evenement (id, organisation_id, slug, name)
        VALUES (${evenementB}, ${orgB}, ${`evt-${suffixe}`}, 'Autre trail')
      `;
      const editionB = randomUUID();
      await sql`
        INSERT INTO edition (id, organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (${editionB}, ${orgB}, ${evenementB}, ${`ed-${suffixe}`}, 'Autre édition', DATE '2027-04-10', TIMESTAMPTZ '2027-03-31T22:59:59Z')
      `;
      await sql`
        INSERT INTO epreuve (organisation_id, edition_id, slug, name, distance_km)
        VALUES (${orgB}, ${editionB}, 'courte', 'La Courte — 6 km', 6.0)
      `;

      // Coureur B (compte + inscription) et session posée directement : la
      // connexion par code résout l'organisation par défaut (A) — la session B
      // est créée en base comme le ferait un compte de l'org B.
      const accountB = randomUUID();
      const emailB = `b-${accountB}@test.azzel`;
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${accountB}, ${orgB}, ${emailB}, 'coureur')
      `;
      const sessionB: SessionRecord = {
        accountId: accountB,
        organisationId: orgB,
        email: emailB,
        role: 'coureur',
        createdAt: new Date(),
      };
      await submitInscription(sessionB, validInput({ epreuve: 'courte' }), {
        store: inscriptionsStore,
      });
      const tokenB = `jeton-b-${randomUUID()}`;
      await sql`
        INSERT INTO session (organisation_id, account_id, token_hash, expires_at)
        VALUES (${orgB}, ${accountB}, ${sha256Hex(tokenB)}, now() + interval '30 days')
      `;

      const dossier = await getDossier(
        requeteGet('/api/coureur/dossier', { authorization: `Bearer ${tokenB}` }),
      );
      expect(dossier.status).toBe(200);
      const checklist = (await dossier.json()) as {
        edition: { slug: string; nom: string } | null;
        pieces: { id: string; fait: boolean }[];
        recap: { epreuve: string } | null;
      };
      expect(checklist.edition?.slug).toBe(`ed-${suffixe}`);
      expect(checklist.edition?.nom).toBe('Autre édition');
      expect(checklist.recap?.epreuve).toBe('La Courte — 6 km');
      // Pas de fuite de l'édition A (org ait-aissi) dans la réponse.
      expect(checklist.edition?.slug).not.toBe('2027');

      // E-dossard : non validé côté B → indisponible, sans toucher à l'org A.
      const edossard = await getEdossard(
        requeteGet('/api/coureur/e-dossard', { authorization: `Bearer ${tokenB}` }),
      );
      expect(edossard.status).toBe(200);
      expect(await edossard.json()).toEqual({ disponible: false });
    });
  },
);
