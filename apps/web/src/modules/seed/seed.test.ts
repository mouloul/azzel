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
import { detectProofFormat } from '@/modules/inscriptions/proof-format';
import { LocalDiskProofStore, type ProofStore } from '@/modules/inscriptions/proof-store';
import {
  PROOF_STORAGE_DRIVER_ENV,
  PROOF_STORAGE_DRIVER_OBJET,
} from '@/modules/inscriptions/proof-store-objet';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  AFFECTATIONS_FICTIVES,
  COUREURS_FICTIFS,
  HEURES_DEPART_FICTIVES,
  PLAN_TERRAIN,
  SEED_EMAIL_SUFFIXE,
  SECTEURS_FICTIFS,
  VOLONTAIRES_FICTIFS,
} from './donnees';
import {
  AutorisationResetManquanteError,
  RESET_ENV_NAME,
  RoleProprietaireManquantError,
  TABLES_PRESERVEES,
  TABLES_PURGEES,
  executerReset,
  executerResetCli,
  resetAutorise,
} from './reset';
import {
  MigrationsManquantesError,
  avertissementStockagePreuves,
  compterEmailsExpediables,
  executerSeed,
  executerSeedCli,
  octetsPreuveFictive,
  rienACreer,
} from './seed';

// Story 8.3 — matrice I/O du seed : premier passage, rejeu idempotent,
// migrations absentes, base absente, réinitialisation sans rôle propriétaire,
// neutralisation des emails, cycle réinitialisation → seed. Base azzel_test,
// rôle azzel_app pour le seed, rôle propriétaire pour la purge (les tables
// append-only du chrono n'ont ni UPDATE ni DELETE côté applicatif).

const testUrls = resolveTestDatabaseUrls('seed édition complète');

const VALIDES_ATTENDUS = COUREURS_FICTIFS.filter((coureur) => coureur.stade === 'validé').length;
const REFUSES_ATTENDUS = COUREURS_FICTIFS.filter((coureur) => coureur.stade === 'refusé').length;
const MISSIONS_ATTENDUES = SECTEURS_FICTIFS.reduce(
  (total, secteur) => total + secteur.missions.length,
  0,
);
const AFFECTATIONS_ATTENDUES = AFFECTATIONS_FICTIVES.reduce(
  (total, affectation) => total + affectation.volontaires.length,
  0,
);
const RETRAITS_ATTENDUS = Math.min(PLAN_TERRAIN.retrait.coureurs, VALIDES_ATTENDUS);
const PASSAGES_ATTENDUS =
  Math.min(PLAN_TERRAIN.cp1.coureurs, VALIDES_ATTENDUS) +
  Math.min(PLAN_TERRAIN.cp2.coureurs, VALIDES_ATTENDUS) +
  Math.min(PLAN_TERRAIN.arrivee.coureurs, VALIDES_ATTENDUS);

describe('seed — CLI hors base (aucune connexion requise)', () => {
  const exitCodeInitial = process.exitCode;

  afterEach(() => {
    // Nettoyage dans afterEach, PAS en fin de corps de test : un échec
    // d'assertion laisserait sinon l'environnement pollué pour les cas suivants.
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.exitCode = exitCodeInitial;
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
  });

  it('réinitialisation sans rôle propriétaire : refus nommant DATABASE_OWNER_URL', async () => {
    const erreurs: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      erreurs.push(args);
    });
    vi.stubEnv(RESET_ENV_NAME, '1');
    vi.stubEnv('DATABASE_OWNER_URL', '');

    expect(resetAutorise()).toBe(true);
    await executerResetCli();

    expect(process.exitCode).toBe(1);
    expect(String(erreurs[0]?.[0])).toContain('DATABASE_OWNER_URL');
    expect(new RoleProprietaireManquantError().message).toContain('DATABASE_OWNER_URL');
  });
});

describe('avertissement de stockage des preuves', () => {
  it('disque local : avertit en nommant la variable à poser, jamais une story', () => {
    const avertissement = avertissementStockagePreuves(new LocalDiskProofStore('/tmp/inexistant'));

    expect(avertissement).not.toBeNull();
    expect(avertissement as string).toContain('DISQUE LOCAL');
    // L'opérateur doit lire QUOI FAIRE, pas un numéro de story qui le laisse
    // conclure qu'il n'y a rien à faire.
    expect(avertissement as string).toContain(PROOF_STORAGE_DRIVER_ENV);
    expect(avertissement as string).toContain(PROOF_STORAGE_DRIVER_OBJET);
    expect(avertissement as string).not.toContain('story 8.2');
  });

  it('tout autre ProofStore (stockage objet) : aucun avertissement', () => {
    // Doublure : seule compte ici l'absence d'héritage de LocalDiskProofStore.
    const objet: ProofStore = {
      put: async () => {
        throw new Error('non sollicité');
      },
      read: async () => null,
      remove: async () => undefined,
    };

    expect(avertissementStockagePreuves(objet)).toBeNull();
  });
});

describe('preuve de paiement fictive', () => {
  it('est un PDF réellement affichable, cohérent avec detectProofFormat', () => {
    const octets = octetsPreuveFictive();
    const texte = Buffer.from(octets).toString('latin1');

    expect(detectProofFormat(octets)).toBe('pdf');
    expect(octets.byteLength).toBeGreaterThan(0);
    expect(octets.byteLength).toBeLessThanOrEqual(300 * 1024);
    // Structure minimale d'un PDF valide : une page, une table xref dont
    // l'offset déclaré tombe bien sur le mot-clé « xref », et un %%EOF.
    expect(texte).toContain('/Type /Page');
    expect(texte.endsWith('%%EOF\n')).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(texte)?.[1]);
    expect(Number.isInteger(startxref)).toBe(true);
    expect(texte.slice(startxref, startxref + 4)).toBe('xref');
    // Le document dit lui-même qu'il ne vaut rien.
    expect(texte).toContain('DOCUMENT FICTIF');
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
    expect(rapport.affectationsCreees).toBe(AFFECTATIONS_ATTENDUES);
    expect(rapport.evenementsTerrainCrees).toBe(RETRAITS_ATTENDUS + PASSAGES_ATTENDUS);
    expect(rienACreer(rapport)).toBe(false);

    // Seul avertissement attendu : les preuves atterrissent sur le disque local,
    // et le message nomme la variable à poser. Tout saut de cible (secteur,
    // mission, volontaire, checkpoint) en ajouterait un.
    expect(rapport.avertissements).toHaveLength(1);
    expect(rapport.avertissements[0]).toContain('DISQUE LOCAL');
    expect(rapport.avertissements[0]).toContain(PROOF_STORAGE_DRIVER_ENV);
    expect(rapport.avertissements[0]).toContain(PROOF_STORAGE_DRIVER_OBJET);

    const statuts = await owner<{ status: string; total: number }[]>`
      SELECT status, count(*)::int AS total FROM coureur GROUP BY status
    `;
    const parStatut = new Map(statuts.map((ligne) => [ligne.status, ligne.total]));
    expect(parStatut.get('validé')).toBe(VALIDES_ATTENDUS);
    expect(parStatut.get('refusé')).toBe(REFUSES_ATTENDUS);
    // Cycle de vie : la preuve déposée place le dossier « en validation » ;
    // seules les inscriptions nues restent « en constitution ».
    expect(parStatut.get('en validation')).toBe(
      COUREURS_FICTIFS.filter((coureur) => coureur.stade === 'dossier complet').length,
    );
    expect(parStatut.get('en constitution')).toBe(
      COUREURS_FICTIFS.filter((coureur) => coureur.stade === 'inscription seule').length,
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

    // Heures de départ échelonnées posées sur les DEUX épreuves.
    const departs = await owner<{ slug: string; heure_depart: Date | null }[]>`
      SELECT slug, heure_depart FROM epreuve ORDER BY slug
    `;
    expect(departs).toHaveLength(Object.keys(HEURES_DEPART_FICTIVES).length);
    expect(departs.every((ligne) => ligne.heure_depart !== null)).toBe(true);
    const heuresDistinctes = new Set(
      departs.map((ligne) => (ligne.heure_depart as Date).toISOString()),
    );
    expect(heuresDistinctes.size).toBe(departs.length);

    // Événements terrain : les deux types, et checkpoint_id non nul sur les
    // passages (CHECK SQL : non nul si et seulement si type = 'passage').
    const terrain = await owner<{ type: string; total: number; sans_checkpoint: number }[]>`
      SELECT type, count(*)::int AS total,
             count(*) FILTER (WHERE checkpoint_id IS NULL)::int AS sans_checkpoint
      FROM terrain_evenement GROUP BY type ORDER BY type
    `;
    const parType = new Map(terrain.map((ligne) => [ligne.type, ligne]));
    expect(parType.get('retrait')?.total).toBe(RETRAITS_ATTENDUS);
    expect(parType.get('retrait')?.sans_checkpoint).toBe(RETRAITS_ATTENDUS);
    expect(parType.get('passage')?.total).toBe(PASSAGES_ATTENDUS);
    expect(parType.get('passage')?.sans_checkpoint).toBe(0);

    // Aucun passage ne précède le départ de l'épreuve de SON coureur : des
    // départs échelonnés avec une heure de passage unique donneraient des
    // temps de classement négatifs.
    const avantDepart = await owner<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM terrain_evenement te
      JOIN coureur c ON c.jeton_edossard = te.jeton_coureur
      JOIN epreuve e ON e.id = c.epreuve_id
      WHERE te.type = 'passage' AND te.horodatage_reception < e.heure_depart
    `;
    expect(avantDepart[0]?.total).toBe(0);
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

  it('les listes de purge couvrent toutes les tables du schéma', async () => {
    const rows = await owner<{ nom: string }[]>`
      SELECT table_name AS nom FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const connues = new Set<string>([...TABLES_PURGEES, ...TABLES_PRESERVEES]);
    const oubliees = rows.map((row) => row.nom).filter((nom) => !connues.has(nom));
    // Une table ajoutée par une migration future doit être classée
    // explicitement : purgée, ou préservée parce que les migrations la peuplent.
    expect(oubliees).toEqual([]);
    const fantomes = [...connues].filter((nom) => !rows.some((row) => row.nom === nom));
    expect(fantomes).toEqual([]);
  });

  it('réinitialisation : les données du seed disparaissent, les migrations subsistent', async () => {
    const rapport = await executerReset(owner);

    expect(rapport.total).toBeGreaterThan(0);
    expect(rapport.heuresDepartEffacees).toBe(Object.keys(HEURES_DEPART_FICTIVES).length);
    for (const table of TABLES_PURGEES) {
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
    expect(rapport.affectationsCreees).toBe(AFFECTATIONS_ATTENDUES);
    expect(rapport.evenementsTerrainCrees).toBe(RETRAITS_ATTENDUS + PASSAGES_ATTENDUS);
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

  // ⚠️ DERNIER CAS DE LA SUITE — il mutile le schéma de la base partagée
  // (DROP TABLE terrain_evenement CASCADE) pour éprouver la détection des
  // migrations manquantes. Tout cas ajouté après lui tournerait sur un schéma
  // incomplet : insérer les nouveaux cas AVANT celui-ci.
  it('seed sans migrations : échec explicite renvoyant vers db:migrate', async () => {
    await owner`DROP TABLE IF EXISTS terrain_evenement CASCADE`;

    await expect(executerSeed({ sql: app, proofStore })).rejects.toBeInstanceOf(
      MigrationsManquantesError,
    );
    await expect(executerSeed({ sql: app, proofStore })).rejects.toThrow(/db:migrate/);
  });
});
