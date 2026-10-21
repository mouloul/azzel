import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { readDatabaseUrl } from '@/modules/iam/env';
import type { SessionRecord } from '@/modules/iam/store';

import { applyAllMigrations } from './migrate';
import {
  BothAcceptancesRequiredError,
  DossierValidatedError,
  InvalidFieldsError,
  NoCoureurError,
  RegistrationClosedError,
} from './errors';
import {
  acceptDocuments,
  getAcceptancesState,
  getInscriptionState,
  submitInscription,
} from './service';
import { createInscriptionsStore, type InscriptionsStore } from './store';
import type { InscriptionFormInput } from './domain';

function parseUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const serverUrl = parseUrl(readDatabaseUrl());

const ALLOWED_TEST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

if (serverUrl !== null && !ALLOWED_TEST_HOSTS.has(serverUrl.hostname)) {
  throw new Error(
    `Base de test refusée : DATABASE_URL pointe vers « ${serverUrl.hostname} », seules localhost / 127.0.0.1 / ::1 sont autorisées.`,
  );
}

if (serverUrl === null) {
  console.warn('intégration inscriptions SKIPPÉE — bash scripts/dev-db.sh up pour l’activer');
}

const RACE_DATE = '2027-03-26';

function validInput(overrides: Partial<InscriptionFormInput> = {}): InscriptionFormInput {
  return {
    epreuve: 'longue',
    prenom: 'Yani',
    nom: 'Ulahianne',
    telephone: '+213 555 010 203',
    contactUrgenceNom: 'Lounis Ulahianne',
    contactUrgenceTelephone: '0555 010 204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
    ...overrides,
  };
}

describe.skipIf(serverUrl === null)('inscriptions — intégration Postgres (base azzel_test)', () => {
  const baseUrl = serverUrl as URL;
  let sql: postgres.Sql;
  let store: InscriptionsStore;

  beforeAll(async () => {
    const adminUrl = new URL(baseUrl.toString());
    adminUrl.pathname = '/postgres';
    const admin = postgres(adminUrl.toString(), { max: 1 });
    await admin`DROP DATABASE IF EXISTS azzel_test WITH (FORCE)`;
    await admin`CREATE DATABASE azzel_test`;
    await admin.end({ timeout: 5 });

    const testUrl = new URL(baseUrl.toString());
    testUrl.pathname = '/azzel_test';
    sql = postgres(testUrl.toString(), { max: 2 });
    await applyAllMigrations(sql);
    store = createInscriptionsStore(sql);
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  });

  afterEach(async () => {
    if (sql) {
      await sql`UPDATE edition SET registration_closes_at = TIMESTAMPTZ '2027-03-16T22:59:59Z'`;
      await sql`UPDATE document SET version = 'v1' WHERE slug IN ('decharge', 'reglement')`;
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
      createdAt: new Date(),
    };
  }

  it('migrations : 0001 à 0004 appliquées avec les seeds attendus', async () => {
    const rows =
      await sql`SELECT name FROM schema_migrations ORDER BY name`;
    expect(rows.map((row) => row.name)).toEqual([
      '0001_iam.sql',
      '0002_inscriptions.sql',
      '0003_documents.sql',
      '0004_coureur_checks.sql',
    ]);

    const editions = await sql`
      SELECT name, race_date::text AS race_date, registration_closes_at
      FROM edition WHERE slug = '2027'
    `;
    const edition = editions[0];
    expect(edition?.name).toBe('Édition 2027');
    expect(edition?.race_date).toBe(RACE_DATE);
    expect(edition?.registration_closes_at.toISOString()).toBe('2027-03-16T22:59:59.000Z');

    const epreuves = await sql`
      SELECT slug, distance_km::float8 AS distance_km FROM epreuve ORDER BY distance_km DESC
    `;
    expect(epreuves).toEqual([
      { slug: 'longue', distance_km: 35 },
      { slug: 'moyenne', distance_km: 12 },
    ]);

    const documents = await sql`
      SELECT slug, version, content FROM document ORDER BY slug
    `;
    expect(documents.map((row) => row.slug)).toEqual(['decharge', 'reglement']);
    for (const document of documents) {
      expect(document.version).toBe('v1');
      expect(document.content).toContain('TEXTE PROVISOIRE');
      expect(document.content).toContain('à remplacer par l’organisateur');
    }

    const colonnes = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'coureur' AND column_name IN (
        'decharge_accepted_at', 'decharge_version',
        'reglement_accepted_at', 'reglement_version'
      ) ORDER BY column_name
    `;
    expect(colonnes.map((row) => row.column_name)).toEqual([
      'decharge_accepted_at',
      'decharge_version',
      'reglement_accepted_at',
      'reglement_version',
    ]);
  });

  it('migrations idempotentes : re-exécution sans erreur ni doublon', async () => {
    const applied = await applyAllMigrations(sql);
    expect(applied).toEqual([]);
    const rows = await sql`SELECT count(*)::int AS count FROM schema_migrations`;
    expect(rows[0]?.count).toBe(4);
  });

  it('inscription complète : coureur créé, rattaché édition/épreuve/organisation', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });

    expect(summary.epreuve).toBe('longue');
    expect(summary.age).toBe(36);
    expect(summary.categorie).toBe('Senior');
    expect(summary.status).toBe('en constitution');

    const rows = await sql`
      SELECT organisation_id, edition_id, epreuve_id, first_name, phone, tshirt_size
      FROM coureur WHERE account_id = ${session.accountId}
    `;
    const row = rows[0];
    expect(row?.organisation_id).toBe(session.organisationId);
    expect(row?.first_name).toBe('Yani');
    expect(row?.phone).toBe('+213555010203');
    expect(row?.tshirt_size).toBe('M');
  });

  it('formulaire incomplet : chaque champ nommé, aucun coureur créé', async () => {
    const session = await createSession();
    const error = await submitInscription(session, { prenom: 'Yani' }, { store }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(InvalidFieldsError);
    expect(Object.keys((error as InvalidFieldsError).fields).sort()).toEqual(
      ['epreuve', 'nom', 'telephone', 'contactUrgenceNom', 'contactUrgenceTelephone', 'dateNaissance', 'tailleTshirt'].sort(),
    );
    const rows = await sql`SELECT count(*)::int AS count FROM coureur WHERE account_id = ${session.accountId}`;
    expect(rows[0]?.count).toBe(0);
  });

  it('date de naissance absurde : moins de 10 ans ou plus de 100 ans refusés', async () => {
    const jeune = await createSession();
    await expect(
      submitInscription(jeune, validInput({ dateNaissance: '2020-06-01' }), { store }),
    ).rejects.toBeInstanceOf(InvalidFieldsError);

    const doyen = await createSession();
    await expect(
      submitInscription(doyen, validInput({ dateNaissance: '1910-06-01' }), { store }),
    ).rejects.toBeInstanceOf(InvalidFieldsError);
  });

  it('après clôture : refus avec message explicite, aucun coureur créé', async () => {
    const session = await createSession();
    await sql`UPDATE edition SET registration_closes_at = now() - interval '1 day'`;
    await expect(submitInscription(session, validInput(), { store })).rejects.toBeInstanceOf(
      RegistrationClosedError,
    );
    const rows =
      await sql`SELECT count(*)::int AS count FROM coureur WHERE account_id = ${session.accountId}`;
    expect(rows[0]?.count).toBe(0);
  });

  it('double soumission non validée : mise à jour sans doublon', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store });
    const updated = await submitInscription(
      session,
      validInput({ epreuve: 'moyenne', tailleTshirt: 'XL' }),
      { store },
    );

    expect(updated.epreuve).toBe('moyenne');
    expect(updated.tailleTshirt).toBe('XL');

    const rows = await sql`
      SELECT count(*)::int AS count FROM coureur WHERE account_id = ${session.accountId}
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it('dossier déjà validé : modification refusée, ligne inchangée', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await sql`UPDATE coureur SET status = 'valide' WHERE id = ${summary.id}`;

    await expect(
      submitInscription(session, validInput({ epreuve: 'moyenne' }), { store }),
    ).rejects.toBeInstanceOf(DossierValidatedError);

    const rows = await sql`
      SELECT e.slug FROM coureur c JOIN epreuve e ON e.id = c.epreuve_id WHERE c.account_id = ${session.accountId}
    `;
    expect(rows[0]?.slug).toBe('longue');
  });

  it('getInscriptionState : édition ouverte, épreuves et récap coureur', async () => {
    const session = await createSession();
    await submitInscription(session, validInput({ dateNaissance: '2007-03-26' }), { store });

    const state = await getInscriptionState(session, { store });
    expect(state.edition).not.toBeNull();
    expect(state.edition?.registrationOpen).toBe(true);
    expect(state.epreuves.map((epreuve) => epreuve.slug).sort()).toEqual(['longue', 'moyenne']);
    expect(state.coureur?.age).toBe(20);
    expect(state.coureur?.categorie).toBe('Senior');
  });

  it('acceptations : les deux cases → horodatage serveur et versions résolues côté serveur', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await sql`UPDATE document SET version = 'v2' WHERE slug = 'decharge'`;

    const before = new Date();
    const result = await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    const after = new Date();

    expect(result.decharge.version).toBe('v2');
    expect(result.reglement.version).toBe('v1');

    const rows = await sql`
      SELECT decharge_accepted_at, decharge_version, reglement_accepted_at, reglement_version
      FROM coureur WHERE id = ${summary.id}
    `;
    const row = rows[0];
    expect(row?.decharge_version).toBe('v2');
    expect(row?.reglement_version).toBe('v1');
    const dechargeAt = row?.decharge_accepted_at as Date;
    const reglementAt = row?.reglement_accepted_at as Date;
    expect(dechargeAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5);
    expect(dechargeAt.getTime()).toBeLessThanOrEqual(after.getTime() + 5);
    expect(reglementAt.getTime()).toBe(dechargeAt.getTime());
  });

  it('acceptations : une seule case → refus atomique, rien n’est écrit en base', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });

    await expect(
      acceptDocuments(session, { decharge: true, reglement: false }, { store }),
    ).rejects.toBeInstanceOf(BothAcceptancesRequiredError);

    const rows = await sql`
      SELECT decharge_accepted_at, reglement_accepted_at
      FROM coureur WHERE id = ${summary.id}
    `;
    expect(rows[0]?.decharge_accepted_at).toBeNull();
    expect(rows[0]?.reglement_accepted_at).toBeNull();
  });

  it('acceptations : session sans coureur → NoCoureurError, aucune ligne ni acceptation écrite', async () => {
    const session = await createSession();
    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(NoCoureurError);

    const rows = await sql`
      SELECT decharge_accepted_at, reglement_accepted_at
      FROM coureur WHERE account_id = ${session.accountId}
    `;
    expect(rows).toEqual([]);
  });

  it('acceptations : après clôture → refus, acceptations inchangées', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    await sql`UPDATE edition SET registration_closes_at = now() - interval '1 day'`;

    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(RegistrationClosedError);

    const rows =
      await sql`SELECT decharge_version FROM coureur WHERE id = ${summary.id}`;
    expect(rows[0]?.decharge_version).toBe('v1');
  });

  it('acceptations : dossier validé → refus immuable sans modification', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    const avant = await sql`
      SELECT decharge_accepted_at, decharge_version FROM coureur WHERE id = ${summary.id}
    `;
    await sql`UPDATE coureur SET status = 'valide' WHERE id = ${summary.id}`;

    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(DossierValidatedError);

    const apres = await sql`
      SELECT decharge_accepted_at, decharge_version FROM coureur WHERE id = ${summary.id}
    `;
    expect(apres[0]?.decharge_accepted_at?.toISOString()).toBe(
      (avant[0]?.decharge_accepted_at as Date).toISOString(),
    );
    expect(apres[0]?.decharge_version).toBe(avant[0]?.decharge_version);
  });

  it('acceptations : ré-acceptation met à jour horodatage et version', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    const premiere = await acceptDocuments(
      session,
      { decharge: true, reglement: true },
      { store },
    );

    await sql`UPDATE document SET version = 'v3' WHERE slug = 'reglement'`;
    await sql`UPDATE coureur SET decharge_accepted_at = now() - interval '2 hours' WHERE id = ${summary.id}`;

    const seconde = await acceptDocuments(
      session,
      { decharge: true, reglement: true },
      { store },
    );

    expect(seconde.reglement.version).toBe('v3');
    expect(seconde.decharge.version).toBe('v1');
    expect(seconde.decharge.acceptedAt).not.toBe(premiere.decharge.acceptedAt);
  });

  it('getAcceptancesState : documents avec version, état null puis horodaté', async () => {
    const session = await createSession();
    const avant = await getAcceptancesState(session, { store });
    expect(avant.edition).not.toBeNull();
    expect(avant.coureurStatus).toBeNull();
    expect(avant.acceptances.decharge).toBeNull();
    expect(avant.documents.map((document) => document.slug)).toEqual(['decharge', 'reglement']);
    expect(avant.documents[0]?.version).toBe('v1');

    await submitInscription(session, validInput(), { store });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });

    const apres = await getAcceptancesState(session, { store });
    expect(apres.coureurStatus).toBe('en constitution');
    expect(apres.acceptances.decharge).toMatchObject({ version: 'v1' });
    expect(apres.acceptances.reglement).toMatchObject({ version: 'v1' });
    expect(apres.acceptances.decharge?.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
