import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import { findOrganisationIdBySlug, resetOrganisationIdMemoForTests, withOrg } from '@/db/org-scope';
import { DEFAULT_ORGANISATION_SLUG } from '@/modules/iam/constants';
import { LocalDiskProofStore } from '@/modules/inscriptions/proof-store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  COUREURS_FICTIFS,
  SEED_EMAIL_SUFFIXE,
  SECTEURS_FICTIFS,
  VOLONTAIRES_FICTIFS,
} from './donnees';
import {
  AutorisationResetManquanteError,
  RESET_ENV_NAME,
  TABLES_PRESERVEES,
  executerReset,
  executerResetCli,
  resetAutorise,
} from './reset';
import {
  MigrationsManquantesError,
  compterEmailsExpediables,
  executerSeed,
  executerSeedCli,
  rienACreer,
} from './seed';

// Story 8.3 — matrice I/O du seed : premier passage, rejeu idempotent,
// migrations absentes, base absente, neutralisation des emails, cycle
// réinitialisation → seed. Base azzel_test, rôle azzel_app pour le seed,
// rôle propriétaire pour la purge (les tables append-only du chrono n'ont ni
// UPDATE ni DELETE côté applicatif).

const testUrls = resolveTestDatabaseUrls('seed édition complète');

const VALIDES_ATTENDUS = COUREURS_FICTIFS.filter((coureur) => coureur.stade === 'validé').length;
const REFUSES_ATTENDUS = COUREURS_FICTIFS.filter((coureur) => coureur.stade === 'refusé').length;
const MISSIONS_ATTENDUES = SECTEURS_FICTIFS.reduce(
  (total, secteur) => total + secteur.missions.length,
  0,
);

describe('seed — CLI hors base (aucune connexion requise)', () => {
  const exitCodeInitial = process.exitCode;

  afterEach(() => {
    process.exitCode = exitCodeInitial;
    vi.restoreAllMocks();
  });

  it('DATABASE_URL absente : échec explicite, aucune trace partielle', async () => {
    const erreurs: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      erreurs.push(args);
    });
    vi.stubEnv('DATABASE_URL', '');

    await executerSeedCli();

    expect(process.exitCode).toBe(1);
    expect(String(erreurs[0]?.[0])).toContain('DATABASE_URL absente');
    vi.unstubAllEnvs();
  });

  it('réinitialisation sans autorisation : refus nommant la variable de garde', async () => {
    const erreurs: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      erreurs.push(args);
    });
    vi.stubEnv(RESET_ENV_NAME, '');

    expect(resetAutorise()).toBe(false);
    await executerResetCli();

    expect(process.exitCode).toBe(1);
    expect(String(erreurs[0]?.[0])).toContain(RESET_ENV_NAME);
    expect(new AutorisationResetManquanteError().message).toContain(RESET_ENV_NAME);
    vi.unstubAllEnvs();
  });
});

describe.skipIf(testUrls === null)('seed « édition complète » — intégration Postgres', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  let connections: AzzelTestConnections | undefined;
  let owner: postgres.Sql;
  let app: postgres.Sql;
  let proofStore: LocalDiskProofStore;
  let storageDir = '';
  let organisationId: string;

  beforeAll(async () => {
    storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-seed-it-'));
    proofStore = new LocalDiskProofStore(storageDir);
    resetOrganisationIdMemoForTests();
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner, app } = connections);
    const id = await findOrganisationIdBySlug(app, DEFAULT_ORGANISATION_SLUG);
    if (id === null) {
      throw new Error('organisation par défaut absente de la base de test');
    }
    organisationId = id;
  }, 120_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    if (storageDir) {
      rmSync(storageDir, { recursive: true, force: true });
    }
    resetOrganisationIdMemoForTests();
  });

  async function compter(table: string): Promise<number> {
    const rows = await owner.unsafe(`SELECT count(*)::int AS total FROM ${table}`);
    return (rows[0] as { total: number } | undefined)?.total ?? 0;
  }

  it('premier seed : édition peuplée, tous les stades de dossier représentés', async () => {
    const rapport = await executerSeed({ sql: app, proofStore });

    expect(rapport.coureursCrees).toBe(COUREURS_FICTIFS.length);
    expect(rapport.dossiersValides).toBe(VALIDES_ATTENDUS);
    expect(rapport.dossiersRefuses).toBe(REFUSES_ATTENDUS);
    expect(rapport.dossardsAttribues).toBe(VALIDES_ATTENDUS);
    expect(rapport.volontairesCrees).toBe(VOLONTAIRES_FICTIFS.length);
    expect(rapport.secteursCrees).toBe(SECTEURS_FICTIFS.length);
    expect(rapport.missionsCreees).toBe(MISSIONS_ATTENDUES);
    expect(rapport.evenementsTerrainCrees).toBeGreaterThan(0);
    expect(rienACreer(rapport)).toBe(false);

    const statuts = await owner<{ status: string; total: number }[]>`
      SELECT status, count(*)::int AS total FROM coureur GROUP BY status
    `;
    const parStatut = new Map(statuts.map((ligne) => [ligne.status, ligne.total]));
    expect(parStatut.get('validé')).toBe(VALIDES_ATTENDUS);
    expect(parStatut.get('refusé')).toBe(REFUSES_ATTENDUS);
    expect(parStatut.get('en constitution')).toBe(
      COUREURS_FICTIFS.length - VALIDES_ATTENDUS - REFUSES_ATTENDUS,
    );

    // Un dossier refusé porte TOUJOURS son motif (contrainte couplée 0006).
    const refuses = await owner<{ refusal_reason: string | null }[]>`
      SELECT refusal_reason FROM coureur WHERE status = 'refusé'
    `;
    expect(refuses).toHaveLength(REFUSES_ATTENDUS);
    expect(refuses.every((ligne) => (ligne.refusal_reason ?? '').length > 0)).toBe(true);

    // Les dossiers à valider ont bien une preuve active à examiner.
    const preuvesActives = await owner<{ total: number }[]>`
      SELECT count(*)::int AS total FROM preuve WHERE status = 'active'
    `;
    expect(preuvesActives[0]?.total).toBe(
      COUREURS_FICTIFS.filter((coureur) => coureur.stade !== 'inscription seule').length,
    );

    // Toutes les adresses engendrées sont sur le domaine réservé.
    const horsDomaine = await owner<{ email: string }[]>`
      SELECT email FROM account WHERE email NOT LIKE ${`%${SEED_EMAIL_SUFFIXE}`}
    `;
    expect(horsDomaine).toEqual([]);
  }, 180_000);

  it('aucune ligne email_outbox produite par le seed n’est expédiable', async () => {
    expect(await compterEmailsExpediables(app, organisationId)).toBe(0);

    const total = await compter('email_outbox');
    expect(total).toBeGreaterThan(0);
    const statuts = await owner<{ statut: string; total: number }[]>`
      SELECT statut, count(*)::int AS total FROM email_outbox GROUP BY statut
    `;
    expect(statuts.map((ligne) => ligne.statut).sort()).toEqual(['cancelled']);
  });

  it('seed rejoué : aucun doublon, le script rapporte qu’il n’a rien eu à créer', async () => {
    const avant = {
      coureurs: await compter('coureur'),
      comptes: await compter('account'),
      preuves: await compter('preuve'),
      volontaires: await compter('volontaire'),
      secteurs: await compter('secteur'),
      missions: await compter('mission'),
      affectations: await compter('affectation'),
      terrain: await compter('terrain_evenement'),
    };

    const rapport = await executerSeed({ sql: app, proofStore });

    expect(rienACreer(rapport)).toBe(true);
    expect(rapport.coureursCrees).toBe(0);
    expect(rapport.coureursDejaPresents).toBe(COUREURS_FICTIFS.length);
    expect({
      coureurs: await compter('coureur'),
      comptes: await compter('account'),
      preuves: await compter('preuve'),
      volontaires: await compter('volontaire'),
      secteurs: await compter('secteur'),
      missions: await compter('mission'),
      affectations: await compter('affectation'),
      terrain: await compter('terrain_evenement'),
    }).toEqual(avant);
    expect(await compterEmailsExpediables(app, organisationId)).toBe(0);
  }, 180_000);

  it('réinitialisation : les données du seed disparaissent, les migrations subsistent', async () => {
    const rapport = await executerReset(owner);

    expect(rapport.total).toBeGreaterThan(0);
    for (const table of [
      'coureur',
      'account',
      'preuve',
      'volontaire',
      'secteur',
      'mission',
      'affectation',
      'terrain_evenement',
      'email_outbox',
    ]) {
      expect(await compter(table)).toBe(0);
    }
    for (const table of TABLES_PRESERVEES) {
      expect(await compter(table)).toBeGreaterThan(0);
    }
    const heures = await owner<{ total: number }[]>`
      SELECT count(*)::int AS total FROM epreuve WHERE heure_depart IS NOT NULL
    `;
    expect(heures[0]?.total).toBe(0);
  });

  it('réinitialisation puis seed : l’édition est de nouveau complète', async () => {
    const rapport = await executerSeed({ sql: app, proofStore });

    expect(rapport.coureursCrees).toBe(COUREURS_FICTIFS.length);
    expect(rapport.dossardsAttribues).toBe(VALIDES_ATTENDUS);
    expect(await compter('coureur')).toBe(COUREURS_FICTIFS.length);
    expect(await compterEmailsExpediables(app, organisationId)).toBe(0);
  }, 180_000);

  it('les écritures du seed restent scopées par organisation (GUC posé)', async () => {
    const vues = await withOrg(app, organisationId, async (tx) => {
      const rows = await tx<{ total: number }[]>`SELECT count(*)::int AS total FROM coureur`;
      return rows[0]?.total ?? 0;
    });
    expect(vues).toBe(COUREURS_FICTIFS.length);
  });

  it('seed sans migrations : échec explicite renvoyant vers db:migrate', async () => {
    await owner`DROP TABLE IF EXISTS terrain_evenement CASCADE`;

    await expect(executerSeed({ sql: app, proofStore })).rejects.toBeInstanceOf(
      MigrationsManquantesError,
    );
    await expect(executerSeed({ sql: app, proofStore })).rejects.toThrow(/db:migrate/);
  });
});
