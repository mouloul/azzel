import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Le vrai worker ne doit jamais tourner dans ces tests : il se connecterait à la
// base DEV et enverait de vrais emails. Helper partagé : @/test/outbox-worker-mock.
vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import type { SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  DossierValidatedError,
  NoCoureurError,
  NumeroTransactionDejaUtiliseError,
  ProofFormatError,
  ProofTooLargeError,
  RegistrationClosedError,
} from './errors';
import { MAX_PROOF_BYTES } from './proof-format';
import { LocalDiskProofStore, sha256Hex } from './proof-store';
import { getPreuveState, uploadPreuve } from './proof-service';
import { createInscriptionsStore, type InscriptionsStore } from './store';
import { acceptDocuments, submitInscription } from './service';
import type { InscriptionFormInput } from './domain';

const testUrls = resolveTestDatabaseUrls('preuve');

function validInput(): InscriptionFormInput {
  return {
    epreuve: 'longue',
    prenom: 'Yani',
    nom: 'Ulahianne',
    telephone: '+213 555 010 203',
    contactUrgenceNom: 'Lounis Ulahianne',
    contactUrgenceTelephone: '0555 010 204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
    genre: 'H',
    hebergement: '',
  };
}

function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

function pdfBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
  bytes.fill(0x25, 9);
  return bytes;
}

describe.skipIf(testUrls === null)('preuve — intégration Postgres (base azzel_test)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app.
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: InscriptionsStore;
  let storageDir: string;
  let proofStore: LocalDiskProofStore;

  beforeAll(async () => {
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createInscriptionsStore(app);
    storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-preuve-it-'));
    proofStore = new LocalDiskProofStore(storageDir);
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    rmSync(storageDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (sql) {
      await sql`UPDATE edition SET registration_closes_at = TIMESTAMPTZ '2027-03-16T22:59:59Z'`;
    }
  });

  async function createSession(): Promise<SessionRecord> {
    const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
    const organisation = organisations[0];
    if (!organisation) {
      throw new Error('organisation seed absente');
    }
    const accountId = randomUUID();
    await sql`
      INSERT INTO account (id, organisation_id, email)
      VALUES (${accountId}, ${organisation.id}, ${`coureur-${accountId}@test.azzel`})
    `;
    return {
      accountId,
      organisationId: organisation.id,
      email: `coureur-${accountId}@test.azzel`,
      role: 'coureur' as const,
      createdAt: new Date(),
    };
  }

  async function createCoureurSession(): Promise<SessionRecord> {
    const session = await createSession();
    await submitInscription(session, validInput(), { store });
    // Acceptations avant la preuve (PO, 11/11/2026).
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    return session;
  }

  async function coureurIdFor(accountId: string): Promise<string> {
    const rows = await sql`SELECT id FROM coureur WHERE account_id = ${accountId}`;
    const row = rows[0];
    if (!row) {
      throw new Error('coureur absent en base');
    }
    return row.id as string;
  }

  async function activePreuveRows(coureurId: string) {
    return sql`SELECT id, storage_key, mime, size_bytes, sha256, status FROM preuve WHERE coureur_id = ${coureurId} AND status = 'active'`;
  }

  async function preuveCountForAccount(accountId: string): Promise<number> {
    const rows = await sql`
      SELECT count(*)::int AS count FROM preuve p
      JOIN coureur c ON c.id = p.coureur_id
      WHERE c.account_id = ${accountId}
    `;
    return rows[0]?.count ?? 0;
  }

  it('migrations : table preuve présente avec index et contrainte une seule active', async () => {
    const tables =
      await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'preuve' ORDER BY column_name`;
    expect(tables.map((row) => row.column_name)).toEqual([
      'coureur_id',
      'created_at',
      'id',
      'mime',
      'numero_transaction',
      'organisation_id',
      'sha256',
      'size_bytes',
      'status',
      'storage_key',
    ]);

    const indexes = await sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'preuve' ORDER BY indexname
    `;
    const names = indexes.map((row) => row.indexname);
    expect(names).toContain('preuve_coureur_idx');
    expect(names).toContain('preuve_coureur_active_uidx');
    expect(names).toContain('preuve_numero_transaction_actif_uidx');
  });

  it('dépôt image valide : ligne active + fichier ≤ 300 Ko sur disque + récap', async () => {
    const session = await createCoureurSession();
    const bytes = jpegBytes(280_000);
    const filesBefore = readdirSync(storageDir).length;

    const summary = await uploadPreuve(session, bytes, { store, proofStore });

    expect(summary.sizeBytes).toBe(280_000);
    expect(summary.sizeBytes).toBeLessThanOrEqual(MAX_PROOF_BYTES);
    expect(summary.format).toBe('JPEG');
    expect(summary.depositedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const rows = await activePreuveRows(await coureurIdFor(session.accountId));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.mime).toBe('image/jpeg');
    expect(row?.size_bytes).toBe(280_000);
    expect(row?.sha256).toBe(sha256Hex(bytes));

    const stored = path.join(storageDir, row?.storage_key as string);
    expect(statSync(stored).size).toBeLessThanOrEqual(MAX_PROOF_BYTES);
    expect(sha256Hex(new Uint8Array(readFileSync(stored)))).toBe(row?.sha256);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore + 1);
  });

  it('dépôt PDF ≤ 300 Ko : stocké tel quel, octets identiques sur disque', async () => {
    const session = await createCoureurSession();
    const bytes = pdfBytes(200_000);

    const summary = await uploadPreuve(session, bytes, { store, proofStore });

    expect(summary.mime).toBe('application/pdf');
    expect(summary.format).toBe('PDF');

    const rows = await activePreuveRows(await coureurIdFor(session.accountId));
    const stored = new Uint8Array(
      readFileSync(path.join(storageDir, rows[0]?.storage_key as string)),
    );
    expect(stored.byteLength).toBe(200_000);
    expect(sha256Hex(stored)).toBe(sha256Hex(bytes));
  });

  it('limite exacte : MAX_PROOF_BYTES octets acceptés, un octet de plus refusé (drift TS/SQL cassera ici)', async () => {
    const session = await createCoureurSession();
    const summary = await uploadPreuve(session, jpegBytes(MAX_PROOF_BYTES), { store, proofStore });
    expect(summary.sizeBytes).toBe(MAX_PROOF_BYTES);

    const coureur = await sql`SELECT id FROM coureur WHERE account_id = ${session.accountId}`;
    expect(coureur).toHaveLength(1);

    const autre = await createCoureurSession();
    await expect(
      uploadPreuve(autre, jpegBytes(MAX_PROOF_BYTES + 1), { store, proofStore }),
    ).rejects.toBeInstanceOf(ProofTooLargeError);
  });

  it('format refusé (contenu texte) : 400 logique ProofFormatError, aucune ligne ni fichier', async () => {
    const session = await createCoureurSession();
    const before = await preuveCountForAccount(session.accountId);
    const filesBefore = readdirSync(storageDir).length;

    await expect(
      uploadPreuve(session, new TextEncoder().encode('reçu forgé en .jpg'), { store, proofStore }),
    ).rejects.toBeInstanceOf(ProofFormatError);

    expect(await preuveCountForAccount(session.accountId)).toBe(before);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore);
  });

  it('image de plus de 300 Ko servie telle quelle : ProofTooLargeError, rien écrit', async () => {
    const session = await createCoureurSession();
    const filesBefore = readdirSync(storageDir).length;
    await expect(
      uploadPreuve(session, jpegBytes(400_000), { store, proofStore }),
    ).rejects.toBeInstanceOf(ProofTooLargeError);
    expect(await preuveCountForAccount(session.accountId)).toBe(0);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore);
  });

  it('nouveau dépôt : la nouvelle devient active, l’ancienne reste en base marquée remplacée et sur disque', async () => {
    const session = await createCoureurSession();
    const coureurId = await coureurIdFor(session.accountId);
    const first = await uploadPreuve(session, jpegBytes(150_000), { store, proofStore });
    const second = await uploadPreuve(session, jpegBytes(120_000), { store, proofStore });

    expect(second.id).not.toBe(first.id);

    const all = await sql`
      SELECT id, status, storage_key FROM preuve
      WHERE coureur_id = ${coureurId}
      ORDER BY created_at ASC
    `;
    expect(all).toHaveLength(2);
    expect(all[0]?.status).toBe('replaced');
    expect(all[0]?.id).toBe(first.id);
    expect(all[1]?.status).toBe('active');
    expect(all[1]?.id).toBe(second.id);

    const active = await activePreuveRows(coureurId);
    expect(active).toHaveLength(1);

    for (const row of all) {
      expect(readdirSync(storageDir)).toContain(row?.storage_key);
    }
  });

  it('retry idempotent : même checksum → même preuve active, aucun doublon de ligne', async () => {
    const session = await createCoureurSession();
    const coureurId = await coureurIdFor(session.accountId);
    const bytes = jpegBytes(100_000);
    const filesBefore = readdirSync(storageDir).length;
    const first = await uploadPreuve(session, bytes, { store, proofStore });
    const replay = await uploadPreuve(session, bytes, { store, proofStore });

    expect(replay.id).toBe(first.id);
    expect(replay.depositedAt).toBe(first.depositedAt);

    const rows = await sql`SELECT count(*)::int AS count FROM preuve WHERE coureur_id = ${coureurId}`;
    expect(rows[0]?.count).toBe(1);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore + 1);
  });

  it('numéro de transaction : un reçu ne justifie qu’un dossier, rien écrit pour le second', async () => {
    const premier = await createCoureurSession();
    const second = await createCoureurSession();
    const numero = `TX${Date.now()}`;
    const filesBefore = readdirSync(storageDir).length;
    const deposee = await uploadPreuve(premier, jpegBytes(30_000), {
      store,
      proofStore,
      numeroTransaction: numero,
    });
    expect(deposee.numeroTransaction).toBe(numero);

    await expect(
      uploadPreuve(second, jpegBytes(31_000), { store, proofStore, numeroTransaction: numero }),
    ).rejects.toBeInstanceOf(NumeroTransactionDejaUtiliseError);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore + 1);

    // Le même coureur peut redéposer avec le même numéro (remplacement).
    const remplacement = await uploadPreuve(premier, jpegBytes(32_000), {
      store,
      proofStore,
      numeroTransaction: numero,
    });
    expect(remplacement.id).not.toBe(deposee.id);
  });

  it('garde sans coureur : NoCoureurError, rien écrit', async () => {
    const session = await createSession();
    const filesBefore = readdirSync(storageDir).length;
    await expect(
      uploadPreuve(session, jpegBytes(1024), { store, proofStore }),
    ).rejects.toBeInstanceOf(NoCoureurError);
    expect(await preuveCountForAccount(session.accountId)).toBe(0);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore);
  });

  it('garde après clôture : RegistrationClosedError, rien écrit', async () => {
    const session = await createCoureurSession();
    await sql`UPDATE edition SET registration_closes_at = now() - interval '1 day'`;
    const filesBefore = readdirSync(storageDir).length;
    await expect(
      uploadPreuve(session, jpegBytes(1024), { store, proofStore }),
    ).rejects.toBeInstanceOf(RegistrationClosedError);
    expect(await preuveCountForAccount(session.accountId)).toBe(0);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore);
    await sql`UPDATE edition SET registration_closes_at = TIMESTAMPTZ '2027-03-16T22:59:59Z'`;
  });

  it('garde dossier validé : DossierValidatedError, aucune ligne ni fichier', async () => {
    const session = await createCoureurSession();
    await sql`UPDATE coureur SET status = 'validé' WHERE account_id = ${session.accountId}`;
    const filesBefore = readdirSync(storageDir).length;
    await expect(
      uploadPreuve(session, jpegBytes(1024), { store, proofStore }),
    ).rejects.toBeInstanceOf(DossierValidatedError);
    expect(await preuveCountForAccount(session.accountId)).toBe(0);
    expect(readdirSync(storageDir)).toHaveLength(filesBefore);
  });

  it('getPreuveState : null avant dépôt, résumé après dépôt', async () => {
    const session = await createCoureurSession();
    const avant = await getPreuveState(session, { store, proofStore });
    expect(avant.coureurStatus).toBe('en constitution');
    expect(avant.preuve).toBeNull();

    await uploadPreuve(session, jpegBytes(50_000), { store, proofStore });

    const apres = await getPreuveState(session, { store, proofStore });
    expect(apres.preuve).not.toBeNull();
    expect(apres.preuve?.sizeBytes).toBe(50_000);
    expect(apres.preuve?.depositedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
