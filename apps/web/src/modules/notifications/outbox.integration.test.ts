import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  reuseAzzelTestDb,
  type AzzelTestConnections,
} from '@/test/integration-db';
import { readSmtpUrl } from '@/modules/iam/env';
import type { SessionRecord } from '@/modules/iam/store';

import type { InscriptionFormInput } from '@/modules/inscriptions/domain';
import { acceptDocuments, decideDossier, submitInscription } from '@/modules/inscriptions/service';
import { uploadPreuve } from '@/modules/inscriptions/proof-service';
import { LocalDiskProofStore } from '@/modules/inscriptions/proof-store';
import { createInscriptionsStore, type InscriptionsStore } from '@/modules/inscriptions/store';

import {
  RAPPEL_J7_SUBJECT,
  readRunnersAppUrl,
} from './email-contents';
import {
  createOutboxStore,
  OUTBOX_CLAIM_LEASE_MINUTES,
  type OutboxStore,
} from './outbox-store';
import { planifierRappelsJ7 } from './rappel-j7';
import { processOutbox } from './worker';

const testUrls = resolveTestDatabaseUrls('notifications');

/** JPEG minimal (en-tête valide + remplissage) pour les preuves de paiement des dossiers. */
function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  bytes.fill(0xab, 11);
  return bytes;
}

// File d’envoi Mailpit locale : assertions via son API http://localhost:8026.
// Le test n’envoie jamais vers un SMTP distant (hôte SMTP local exigé).
const MAILPIT_API_BASE = 'http://localhost:8026/api/v1/messages';

interface MailpitMessageListItem {
  ID: string;
  To: { Address: string; Name: string }[];
  Subject: string;
}

async function probeMailpit(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(`${MAILPIT_API_BASE}?limit=1`, { signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

const LOCAL_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function localSmtpUrl(): URL | null {
  const raw = readSmtpUrl();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return LOCAL_SMTP_HOSTS.has(parsed.hostname) ? parsed : null;
  } catch {
    return null;
  }
}

const mailpitUp = testUrls !== null ? await probeMailpit() : false;
const mailpitReady = mailpitUp && localSmtpUrl() !== null;

if (testUrls !== null && !mailpitReady) {
  console.warn(
    'intégration Mailpit SKIPPÉE — bash scripts/dev-mail.sh up (et SMTP_URL locale) pour l’activer',
  );
}

const RACE_DATE = '2027-03-26';

/** Story 6.4 — décale une date civile `YYYY-MM-DD` de N jours (sans fuseau). */
function decalerDate(dateIso: string, jours: number): string {
  const [annee = 0, mois = 1, jour = 1] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour) + jours * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

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
    genre: 'H',
    hebergement: '',
    ...overrides,
  };
}

describe.skipIf(testUrls === null)('notifications — intégration Postgres (base azzel_test)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app.
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: InscriptionsStore;
  let outbox: OutboxStore;
  let organisationId: string;
  let storageDir = '';
  let proofStore: LocalDiskProofStore;

  const noTrigger = async (): Promise<void> => {};

  /** Un dossier n'est validable qu'avec preuve active + décharge + règlement (story 1.6). */
  async function completerDossier(session: SessionRecord): Promise<void> {
    await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });
    await acceptDocuments(session, { decharge: true, reglement: true }, { store });
  }

  beforeAll(async () => {
    storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-outbox-it-'));
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createInscriptionsStore(app);
    outbox = createOutboxStore(app);
    proofStore = new LocalDiskProofStore(storageDir);

    const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
    organisationId = organisations[0]?.id as string;
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    if (storageDir) {
      rmSync(storageDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (sql) {
      await sql`DELETE FROM email_outbox`;
    }
  });

  async function createSession(): Promise<SessionRecord> {
    const accountId = randomUUID();
    const email = `coureur-${accountId}@test.azzel`;
    await sql`
      INSERT INTO account (id, organisation_id, email)
      VALUES (${accountId}, ${organisationId}, ${email})
    `;
    return {
      accountId,
      organisationId,
      email,
      role: 'coureur' as const,
      createdAt: new Date(),
    };
  }

  async function organisateurSession(): Promise<SessionRecord> {
    const accountId = randomUUID();
    const email = `organisateur-${accountId}@test.azzel`;
    await sql`
      INSERT INTO account (id, organisation_id, email, role)
      VALUES (${accountId}, ${organisationId}, ${email}, 'organisateur')
    `;
    return {
      accountId,
      organisationId,
      email,
      role: 'organisateur' as const,
      createdAt: new Date(),
    };
  }

  async function coureurIdFor(accountId: string): Promise<string> {
    const rows = await sql`SELECT id FROM coureur WHERE account_id = ${accountId}`;
    const row = rows[0];
    if (!row) {
      throw new Error('coureur absent en base');
    }
    return row.id as string;
  }

  async function outboxRows(): Promise<
    {
      id: string;
      destinataire: string;
      type: string;
      payload: Record<string, unknown>;
      statut: string;
      attempts: number;
      last_error: string | null;
      next_attempt_at: Date | null;
      sent_at: Date | null;
      created_at: Date;
    }[]
  > {
    return sql`
      SELECT id, destinataire, type, payload, statut, attempts, last_error,
             next_attempt_at, sent_at, created_at
      FROM email_outbox
      WHERE organisation_id = ${organisationId}
      ORDER BY created_at ASC
    `;
  }

  it('inscription soumise : ligne inscription_recue pending dans la même transaction, destinataire et payload justes', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), {
      store,
      triggerOutbox: noTrigger,
    });
    expect(summary.status).toBe('en constitution');

    const rows = await outboxRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.type).toBe('inscription_recue');
    expect(row?.statut).toBe('pending');
    expect(row?.destinataire).toBe(session.email);
    expect(row?.payload).toEqual({ prenom: 'Yani', epreuve: 'La Longue — 35 km' });
    expect(row?.attempts).toBe(0);
    expect(row?.sent_at).toBeNull();
  });

  it('décisions : valider → dossier_valide, refuser → dossier_refuse avec motif dans le payload', async () => {
    const valideSession = await createSession();
    await submitInscription(valideSession, validInput(), { store, triggerOutbox: noTrigger });
    await completerDossier(valideSession);
    const valideCoureur = await coureurIdFor(valideSession.accountId);
    await decideDossier(await organisateurSession(), valideCoureur, { decision: 'valider' }, {
      store,
      triggerOutbox: noTrigger,
    });

    const refuseSession = await createSession();
    await submitInscription(refuseSession, validInput({ prenom: 'Iness' }), {
      store,
      triggerOutbox: noTrigger,
    });
    const refuseCoureur = await coureurIdFor(refuseSession.accountId);
    await decideDossier(
      await organisateurSession(),
      refuseCoureur,
      { decision: 'refuser', motif: 'Reçu de paiement illisible' },
      { store, triggerOutbox: noTrigger },
    );

    const rows = await outboxRows();
    const validation = rows.find(
      (row) => row.destinataire === valideSession.email && row.type === 'dossier_valide',
    );
    expect(validation).toBeDefined();
    expect(validation?.payload).toEqual({ prenom: 'Yani', epreuve: 'La Longue — 35 km' });
    expect(validation?.statut).toBe('pending');

    const refus = rows.find(
      (row) => row.destinataire === refuseSession.email && row.type === 'dossier_refuse',
    );
    expect(refus).toBeDefined();
    expect(refus?.payload).toEqual({
      prenom: 'Iness',
      epreuve: 'La Longue — 35 km',
      motif: 'Reçu de paiement illisible',
    });
  });

  it('re-validation idempotente : aucune nouvelle ligne outbox pour le no-op', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });
    await completerDossier(session);
    const coureurId = await coureurIdFor(session.accountId);
    const organisateur = await organisateurSession();

    await decideDossier(organisateur, coureurId, { decision: 'valider' }, {
      store,
      triggerOutbox: noTrigger,
    });
    await decideDossier(organisateur, coureurId, { decision: 'valider' }, {
      store,
      triggerOutbox: noTrigger,
    });

    const rows = (await outboxRows()).filter((row) => row.destinataire === session.email);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.type === 'dossier_valide')).toHaveLength(1);
  });

  it('cycle complet avec transport stubbé : pending → sent (attempts 1, sent_at), jamais re-sent', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });

    const sent: { to: string; subject: string }[] = [];
    const first = await processOutbox(10, {
      store: outbox,
      send: async (to, subject) => {
        sent.push({ to, subject });
      },
    });
    expect(first).toEqual({ processed: 1, sent: 1, failed: 0, storeError: null });
    expect(sent).toEqual([{ to: session.email, subject: 'Azzel — ton inscription est bien reçue' }]);

    const rows = await outboxRows();
    expect(rows[0]?.statut).toBe('sent');
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.sent_at).not.toBeNull();

    const second = await processOutbox(10, {
      store: outbox,
      send: async () => {
        throw new Error('ne doit pas être rappelé');
      },
    });
    expect(second).toEqual({ processed: 0, sent: 0, failed: 0, storeError: null });
  });

  it('SMTP en panne : pending → failed (attempts 1, last_error, backoff posé), événement métier déjà réussi', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });

    const summary = await processOutbox(10, {
      store: outbox,
      send: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:2525');
      },
    });
    expect(summary.sent).toBe(0);
    expect(summary.failed).toBeGreaterThanOrEqual(1);

    const rows = (await outboxRows()).filter((row) => row.destinataire === session.email);
    expect(rows[0]?.statut).toBe('failed');
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.last_error).toContain('ECONNREFUSED');
    expect(rows[0]?.next_attempt_at).not.toBeNull();

    // Rejeu après réparation : backoff expiré artificiellement → failed → sent, attempts 2.
    await sql`UPDATE email_outbox SET next_attempt_at = now() - interval '1 minute' WHERE destinataire = ${session.email}`;
    const replay = await processOutbox(10, {
      store: outbox,
      send: async () => {},
    });
    expect(replay.sent).toBeGreaterThanOrEqual(1);
    const after = (await outboxRows()).filter((row) => row.destinataire === session.email);
    expect(after[0]?.statut).toBe('sent');
    expect(after[0]?.attempts).toBe(2);
    expect(after[0]?.next_attempt_at).toBeNull();
  });

  it('revendication atomique : un seul gagnant par ligne (double envoi concurrent impossible)', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });
    const rows = (await outboxRows()).filter((row) => row.destinataire === session.email);
    const id = rows[0]?.id as string;

    const first = await outbox.claimOutboxRow(organisationId, id);
    const second = await outbox.claimOutboxRow(organisationId, id);
    expect(first).toBe(true);
    expect(second).toBe(false);

    const after = (await outboxRows()).filter((row) => row.id === id);
    expect(after[0]?.statut).toBe('sending');
    expect(after[0]?.attempts).toBe(1);
  });

  it('bail de revendication : « sending » orpheline non reprise avant expiration, reprise après', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });
    const id = (await outboxRows()).filter((row) => row.destinataire === session.email)[0]
      ?.id as string;

    // Process mort juste après le claim : la ligne reste « sending », jamais marquée.
    expect(await outbox.claimOutboxRow(organisationId, id)).toBe(true);
    const claimed = (await outboxRows()).filter((row) => row.id === id)[0];
    expect(claimed?.statut).toBe('sending');

    // Bail encore valide : la file ne propose rien, l'envoi n'est même pas tenté.
    const immediate = await processOutbox(10, {
      store: outbox,
      send: async () => {
        throw new Error('ne doit pas être appelé');
      },
    });
    expect(immediate).toEqual({ processed: 0, sent: 0, failed: 0, storeError: null });

    await sql`
      UPDATE email_outbox
      SET claimed_at = now() - make_interval(mins => ${OUTBOX_CLAIM_LEASE_MINUTES + 1})
      WHERE id = ${id}
    `;

    const replay = await processOutbox(10, { store: outbox, send: async () => {} });
    expect(replay.sent).toBe(1);

    const after = (await outboxRows()).filter((row) => row.id === id)[0];
    expect(after?.statut).toBe('sent');
    // Une seule reprise : la tentative abandonnée plus celle du rejeu.
    expect(after?.attempts).toBe(2);
  });

  it('backoff : failed non repris avant next_attempt_at, repris après expiration', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });

    const fail = await processOutbox(10, {
      store: outbox,
      send: async () => {
        throw new Error('smtp down');
      },
    });
    expect(fail.failed).toBe(1);
    const failed = (await outboxRows()).filter((row) => row.destinataire === session.email)[0];
    expect(failed?.next_attempt_at).not.toBeNull();
    expect((failed?.next_attempt_at as Date).getTime()).toBeGreaterThan(Date.now());

    // Backoff actif : la file ne propose rien, l'envoi n'est même pas tenté.
    const immediate = await processOutbox(10, {
      store: outbox,
      send: async () => {
        throw new Error('ne doit pas être appelé');
      },
    });
    expect(immediate).toEqual({ processed: 0, sent: 0, failed: 0, storeError: null });

    await sql`UPDATE email_outbox SET next_attempt_at = now() - interval '1 minute' WHERE destinataire = ${session.email}`;
    const replay = await processOutbox(10, {
      store: outbox,
      send: async () => {},
    });
    expect(replay.sent).toBe(1);
  });

  it('story 6.4 — rappel J-7 : fenêtre, validés seulement, payload figé, idempotence au rejeu, rien le jour J ni après', async () => {
    // Coureurs : un validé, un non validé (les coureurs validés par les tests
    // précédents restent en base — l'attendu est compté, pas deviné).
    const valideSession = await createSession();
    await submitInscription(valideSession, validInput(), { store, triggerOutbox: noTrigger });
    await completerDossier(valideSession);
    const valideCoureur = await coureurIdFor(valideSession.accountId);
    await decideDossier(await organisateurSession(), valideCoureur, { decision: 'valider' }, {
      store,
      triggerOutbox: noTrigger,
    });
    const attenteSession = await createSession();
    await submitInscription(attenteSession, validInput({ prenom: 'Iness' }), {
      store,
      triggerOutbox: noTrigger,
    });

    const edition = await store.findCurrentEdition(organisationId);
    expect(edition).not.toBeNull();
    const dateCourse = (edition as NonNullable<typeof edition>).dateCourse;
    const valides = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM coureur
      WHERE organisation_id = ${organisationId} AND status = 'validé'
    `;
    const attendu = valides[0]?.count ?? 0;
    expect(attendu).toBeGreaterThanOrEqual(1);

    // Avant J-7 : aucun enfilement.
    const avant = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, -8));
    expect(avant.enfiles).toBe(0);
    expect(avant.horsFenetre).toBe(1);

    // J-7 : chaque validé reçoit UNE ligne, le non validé est exclu.
    const j7 = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, -7));
    expect(j7.enfiles).toBe(attendu);
    expect(j7.erreur).toBeNull();

    let rows = (await outboxRows()).filter((row) => row.type === 'rappel_j7');
    expect(rows).toHaveLength(attendu);
    const mien = rows.find((row) => row.destinataire === valideSession.email);
    expect(mien).toBeDefined();
    expect(mien?.statut).toBe('pending');
    expect(mien?.payload).toEqual({ prenom: 'Yani', dateCourse });
    expect(rows.some((row) => row.destinataire === attenteSession.email)).toBe(false);

    // Rejeu le même jour PUIS rattrapage J-5 : AUCUN doublon (index unique partiel).
    const rejeu = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, -7));
    expect(rejeu.enfiles).toBe(0);
    expect(rejeu.dejaEnfiles).toBe(attendu);
    const rattrapage = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, -5));
    expect(rattrapage.enfiles).toBe(0);
    rows = (await outboxRows()).filter((row) => row.type === 'rappel_j7');
    expect(rows).toHaveLength(attendu);

    // Jour de course puis après : aucun enfilement.
    const jourJ = await planifierRappelsJ7({ outbox, inscriptions: store }, dateCourse);
    expect(jourJ.enfiles).toBe(0);
    const apres = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, 1));
    expect(apres.enfiles).toBe(0);
  });

  it('story 6.4 — envoi effectif par le worker : échec → failed + backoff, rejeu → sent, jamais re-enfilé pendant l’échec', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });
    await completerDossier(session);
    const coureurId = await coureurIdFor(session.accountId);
    await decideDossier(await organisateurSession(), coureurId, { decision: 'valider' }, {
      store,
      triggerOutbox: noTrigger,
    });
    const edition = await store.findCurrentEdition(organisationId);
    const dateCourse = (edition as NonNullable<typeof edition>).dateCourse;

    const plan = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, -5));
    expect(plan.enfiles).toBeGreaterThanOrEqual(1);

    // Échec SMTP : la ligne passe failed avec backoff — l'événement métier est déjà là.
    const echec = await processOutbox(50, {
      store: outbox,
      send: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:2525');
      },
    });
    expect(echec.failed).toBeGreaterThanOrEqual(1);
    const failed = (await outboxRows()).find(
      (row) => row.type === 'rappel_j7' && row.destinataire === session.email,
    );
    expect(failed?.statut).toBe('failed');
    expect(failed?.next_attempt_at).not.toBeNull();

    // Pendant l’échec, un rejeu du cron NE double PAS (l’index prime sur le statut).
    const rejeu = await planifierRappelsJ7({ outbox, inscriptions: store }, decalerDate(dateCourse, -4));
    expect(rejeu.enfiles).toBe(0);
    expect(
      (await outboxRows()).filter((row) => row.type === 'rappel_j7' && row.destinataire === session.email),
    ).toHaveLength(1);

    // Réparation + backoff expiré : le worker envoie, objet et lien app exacts.
    await sql`
      UPDATE email_outbox SET next_attempt_at = now() - interval '1 minute'
      WHERE type = 'rappel_j7' AND destinataire = ${session.email}
    `;
    const envoyes: { to: string; subject: string; text: string }[] = [];
    const envoi = await processOutbox(50, {
      store: outbox,
      send: async (to, subject, text) => {
        envoyes.push({ to, subject, text });
      },
    });
    expect(envoi.sent).toBeGreaterThanOrEqual(1);
    const mien = envoyes.find((entry) => entry.to === session.email);
    expect(mien?.subject).toBe(RAPPEL_J7_SUBJECT);
    expect(mien?.text).toContain('Salut Yani');
    expect(mien?.text).toContain('100 %');
    expect(mien?.text).toContain('powerbank');
    expect(mien?.text).toContain(readRunnersAppUrl());
    expect(mien?.text).not.toContain('Un point après l’autre');

    const sent = (await outboxRows()).find(
      (row) => row.type === 'rappel_j7' && row.destinataire === session.email,
    );
    expect(sent?.statut).toBe('sent');
    expect(sent?.attempts).toBe(2);
  });

  it('story 6.4 (revue) — idempotence scopée par édition : deux saisons → le même destinataire reçoit les DEUX rappels, rejeu même saison → zéro doublon', async () => {
    // Saison 1 : l'édition seedée (2027), le coureur validé reçoit son rappel.
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });
    await completerDossier(session);
    const coureurId = await coureurIdFor(session.accountId);
    await decideDossier(await organisateurSession(), coureurId, { decision: 'valider' }, {
      store,
      triggerOutbox: noTrigger,
    });
    const edition1 = await store.findCurrentEdition(organisationId);
    const date1 = (edition1 as NonNullable<typeof edition1>).dateCourse;
    const saison1 = await planifierRappelsJ7(
      { outbox, inscriptions: store },
      decalerDate(date1, -7),
    );
    expect(saison1.enfiles).toBeGreaterThanOrEqual(1);
    expect(
      (await outboxRows()).filter(
        (row) => row.type === 'rappel_j7' && row.destinataire === session.email,
      ),
    ).toHaveLength(1);

    // Saison 2 : une édition ULTÉRIEURE devient courante ; le MÊME compte s'y
    // réinscrit (l'email est unique par organisation — même destinataire).
    const evenement = await sql<{ id: string }[]>`
      SELECT id FROM evenement WHERE slug = 'trail-ait-aissi'
    `;
    const evenementId = evenement[0]?.id;
    if (!evenementId) {
      throw new Error('evenement seed absent');
    }
    let edition2Id = '';
    let date2 = '';
    try {
      const edition2 = await sql<{ id: string; race_date: string }[]>`
        INSERT INTO edition (organisation_id, evenement_id, slug, name, race_date, registration_closes_at)
        VALUES (
          ${organisationId}, ${evenementId}, '2028-recette-j7', 'Édition suivante',
          ${decalerDate(date1, 400)}::date, now() + interval '30 days'
        )
        RETURNING id, race_date::text AS race_date
      `;
      edition2Id = edition2[0]?.id as string;
      date2 = edition2[0]?.race_date as string;
      const epreuve2 = await sql<{ id: string }[]>`
        INSERT INTO epreuve (organisation_id, edition_id, slug, name, distance_km)
        VALUES (${organisationId}, ${edition2Id}, 'longue', 'La Longue — 35 km', 35.0)
        RETURNING id
      `;
      const epreuve2Id = epreuve2[0]?.id;
      if (!epreuve2Id) {
        throw new Error('épreuve saison 2 non créée');
      }
      await sql`
        INSERT INTO coureur (
          organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status
        )
        VALUES (
          ${organisationId}, ${session.accountId}, ${edition2Id}, ${epreuve2Id},
          'Yani', 'Ulahianne', '+213 555 010 203', 'Lounis', '0555 010 204',
          '1990-05-12', 'M', 36, 'Senior', 'validé'
        )
      `;
      // L'édition suivante est désormais courante (race_date max) et dans SA
      // fenêtre J-7 : le même destinataire reçoit le SECOND rappel.
      const courante = await store.findCurrentEdition(organisationId);
      expect(courante?.id).toBe(edition2Id);
      const saison2 = await planifierRappelsJ7(
        { outbox, inscriptions: store },
        decalerDate(date2, -7),
      );
      expect(saison2.enfiles).toBeGreaterThanOrEqual(1);

      const rappels = (await outboxRows()).filter(
        (row) => row.type === 'rappel_j7' && row.destinataire === session.email,
      );
      expect(rappels).toHaveLength(2);
      expect(new Set(rappels.map((row) => row.payload.dateCourse))).toEqual(
        new Set([date1, date2]),
      );

      // Rejeu même saison (rattrapage J-5) : zéro doublon.
      const rejeu = await planifierRappelsJ7(
        { outbox, inscriptions: store },
        decalerDate(date2, -5),
      );
      expect(rejeu.enfiles).toBe(0);
      expect(rejeu.dejaEnfiles).toBeGreaterThanOrEqual(1);
      expect(
        (await outboxRows()).filter(
          (row) => row.type === 'rappel_j7' && row.destinataire === session.email,
        ),
      ).toHaveLength(2);
    } finally {
      if (edition2Id !== '') {
        await sql`DELETE FROM coureur WHERE edition_id = ${edition2Id}`;
        await sql`DELETE FROM epreuve WHERE edition_id = ${edition2Id}`;
        await sql`DELETE FROM edition WHERE id = ${edition2Id}`;
      }
    }
  });

  it('story 6.4 (revue) — pagination : au-delà de 200 coureurs, les validés des pages suivantes reçoivent le rappel', async () => {
    const edition = await store.findCurrentEdition(organisationId);
    expect(edition).not.toBeNull();
    const editionId = (edition as NonNullable<typeof edition>).id;
    const dateCourse = (edition as NonNullable<typeof edition>).dateCourse;
    const epreuve = await sql<{ id: string }[]>`
      SELECT id FROM epreuve WHERE edition_id = ${editionId} LIMIT 1
    `;
    const epreuveId = epreuve[0]?.id;
    if (!epreuveId) {
      throw new Error('épreuve seed absente');
    }
    const ids = Array.from({ length: 205 }, () => randomUUID());
    try {
      await sql`
        INSERT INTO account (id, organisation_id, email)
        SELECT id, ${organisationId}, 'page-j7-' || id || '@test.azzel'
        FROM unnest(${ids}::uuid[]) AS id
      `;
      await sql`
        INSERT INTO coureur (
          organisation_id, account_id, edition_id, epreuve_id,
          first_name, last_name, phone, emergency_contact_name, emergency_contact_phone,
          birth_date, tshirt_size, age, age_category, status
        )
        SELECT ${organisationId}, id, ${editionId}, ${epreuveId},
               'Page', 'J7', '+213 555 010 203', 'Lounis', '0555 010 204',
               '1990-05-12', 'M', 36, 'Senior', 'validé'
        FROM unnest(${ids}::uuid[]) AS id
      `;
      const resume = await planifierRappelsJ7(
        { outbox, inscriptions: store },
        decalerDate(dateCourse, -7),
      );
      expect(resume.enfiles).toBeGreaterThanOrEqual(205);
      const rappels = (await outboxRows()).filter(
        (row) => row.type === 'rappel_j7' && row.destinataire.startsWith('page-j7-'),
      );
      expect(rappels).toHaveLength(205);
      // Rejeu : idempotence sur les DEUX pages.
      const rejeu = await planifierRappelsJ7(
        { outbox, inscriptions: store },
        decalerDate(dateCourse, -5),
      );
      expect(rejeu.enfiles).toBe(0);
      expect(
        (await outboxRows()).filter(
          (row) => row.type === 'rappel_j7' && row.destinataire.startsWith('page-j7-'),
        ),
      ).toHaveLength(205);
    } finally {
      await sql`
        DELETE FROM coureur
        WHERE account_id IN (SELECT id FROM account WHERE email LIKE 'page-j7-%@test.azzel')
      `;
      await sql`DELETE FROM account WHERE email LIKE 'page-j7-%@test.azzel'`;
    }
  });

  it('poison (attempts ≥ 5) : exclu de la file, ligne visible en base, comptée par le CLI', async () => {
    const session = await createSession();
    await submitInscription(session, validInput(), { store, triggerOutbox: noTrigger });
    await sql`
      UPDATE email_outbox
      SET attempts = 5, statut = 'failed', last_error = 'tentatives épuisées'
      WHERE destinataire = ${session.email}
    `;

    const summary = await processOutbox(10, {
      store: outbox,
      send: async () => {
        throw new Error('ne doit pas être appelé');
      },
    });
    expect(summary).toEqual({ processed: 0, sent: 0, failed: 0, storeError: null });

    // Dead-letter implicite : la ligne reste visible en base pour inspection.
    const rows = (await outboxRows()).filter((row) => row.destinataire === session.email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(5);
    expect(await outbox.countDeadLetters()).toBe(1);
  });

  it('ordre created_at et limite : processOutbox(2) traite les deux plus anciennes seulement', async () => {
    const sessions: SessionRecord[] = [];
    for (let index = 0; index < 3; index += 1) {
      const session = await createSession();
      await submitInscription(session, validInput({ prenom: `Coureur${index}` }), {
        store,
        triggerOutbox: noTrigger,
      });
      sessions.push(session);
    }
    const rows = await outboxRows();
    expect(rows).toHaveLength(3);
    const rowId = (index: number): string => {
      const row = rows[index];
      if (!row) {
        throw new Error('ligne outbox absente');
      }
      return row.id;
    };
    await sql`UPDATE email_outbox SET created_at = now() - interval '3 hours' WHERE id = ${rowId(0)}`;
    await sql`UPDATE email_outbox SET created_at = now() - interval '2 hours' WHERE id = ${rowId(1)}`;
    await sql`UPDATE email_outbox SET created_at = now() - interval '1 hour' WHERE id = ${rowId(2)}`;

    const processed: string[] = [];
    const summary = await processOutbox(2, {
      store: outbox,
      send: async (to) => {
        processed.push(to);
      },
    });
    expect(summary.processed).toBe(2);
    expect(summary.sent).toBe(2);
    expect(processed).toEqual([sessions[0]?.email, sessions[1]?.email]);

    const after = await outboxRows();
    const third = after.find((row) => row.id === rows[2]?.id);
    expect(third?.statut).toBe('pending');
  });

  it('échec du déclencheur best effort : la soumission réussit quand même', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), {
      store,
      triggerOutbox: () => {
        throw new Error('worker indisponible');
      },
    });
    expect(summary.status).toBe('en constitution');
    const rows = (await outboxRows()).filter((row) => row.destinataire === session.email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.statut).toBe('pending');
  });
});

describe.skipIf(!mailpitReady)('notifications — intégration Mailpit (envoi réel, UI http://localhost:8026)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  // sql : propriétaire (fixtures) ; app : rôle azzel_app. La base azzel_test a été
  // créée et migrée par le describe précédent — on s'y reconnecte sans la recréer.
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: InscriptionsStore;
  let outbox: OutboxStore;
  let organisationId: string;
  let storageDir = '';
  let proofStore: LocalDiskProofStore;

  beforeAll(async () => {
    storageDir = mkdtempSync(path.join(tmpdir(), 'azzel-j7-mailpit-'));
    proofStore = new LocalDiskProofStore(storageDir);
    connections = await reuseAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createInscriptionsStore(app);
    outbox = createOutboxStore(app);
    const organisations = await sql`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
    organisationId = organisations[0]?.id as string;
    await mailpitPurge();
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
    }
    if (storageDir) {
      rmSync(storageDir, { recursive: true, force: true });
    }
  });

  async function mailpitPurge(): Promise<void> {
    await fetch(MAILPIT_API_BASE, { method: 'DELETE' });
  }

  async function mailpitMessages(): Promise<MailpitMessageListItem[]> {
    const response = await fetch(`${MAILPIT_API_BASE}?limit=100`);
    const body = (await response.json()) as { messages: MailpitMessageListItem[] };
    return body.messages ?? [];
  }

  async function mailpitMessageText(id: string): Promise<string> {
    const response = await fetch(`http://localhost:8026/api/v1/message/${id}`);
    const body = (await response.json()) as { Text?: string };
    return body.Text ?? '';
  }

  async function findMailpitMessage(
    destinataire: string,
    subject: string,
  ): Promise<MailpitMessageListItem | null> {
    const messages = await mailpitMessages();
    return (
      messages.find(
        (message) =>
          message.Subject === subject &&
          message.To.some((recipient) => recipient.Address === destinataire),
      ) ?? null
    );
  }

  async function createSession(): Promise<SessionRecord> {
    const accountId = randomUUID();
    const email = `coureur-${accountId}@test.azzel`;
    await sql`
      INSERT INTO account (id, organisation_id, email)
      VALUES (${accountId}, ${organisationId}, ${email})
    `;
    return {
      accountId,
      organisationId,
      email,
      role: 'coureur' as const,
      createdAt: new Date(),
    };
  }

  it('inscription → outbox → processOutbox → message visible dans Mailpit → purge', async () => {
    try {
      const session = await createSession();
      await submitInscription(session, validInput(), { store, triggerOutbox: async () => {} });

      const summary = await processOutbox(10, { store: outbox });
      expect(summary.sent).toBeGreaterThanOrEqual(1);

      const message = await findMailpitMessage(
        session.email,
        'Azzel — ton inscription est bien reçue',
      );
      expect(message).not.toBeNull();
      const text = await mailpitMessageText((message as MailpitMessageListItem).ID);
      expect(text).toContain('Salut Yani');
      expect(text).toContain('/espace-coureur');
    } finally {
      await mailpitPurge();
    }
  });

  it('refus avec motif → email avec motif et numéro d’assistance dans Mailpit', async () => {
    try {
      const session = await createSession();
      await submitInscription(session, validInput(), { store, triggerOutbox: async () => {} });
      const coureurRows = await sql`SELECT id FROM coureur WHERE account_id = ${session.accountId}`;
      const organisateurId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${organisateurId}, ${organisationId}, ${`organisateur-${organisateurId}@test.azzel`}, 'organisateur')
      `;
      await decideDossier(
        {
          accountId: organisateurId,
          organisationId,
          email: `organisateur-${organisateurId}@test.azzel`,
          role: 'organisateur',
          createdAt: new Date(),
        },
        coureurRows[0]?.id as string,
        { decision: 'refuser', motif: 'Reçu de paiement illisible' },
        { store, triggerOutbox: async () => {} },
      );

      const summary = await processOutbox(10, { store: outbox });
      expect(summary.sent).toBeGreaterThanOrEqual(1);

      const message = await findMailpitMessage(session.email, 'Azzel — ton dossier est refusé');
      expect(message).not.toBeNull();
      const text = await mailpitMessageText((message as MailpitMessageListItem).ID);
      expect(text).toContain('Motif : Reçu de paiement illisible');
      expect(text).toContain('Appeler l’équipe');
    } finally {
      await mailpitPurge();
    }
  });

  it('story 6.4 — rappel J-7 → email texte brut avec conseils et lien app dans Mailpit', async () => {
    try {
      const session = await createSession();
      await submitInscription(session, validInput(), { store, triggerOutbox: async () => {} });
      await uploadPreuve(session, jpegBytes(20_000), { store, proofStore });
      await acceptDocuments(session, { decharge: true, reglement: true }, { store });
      const coureurRows = await sql`SELECT id FROM coureur WHERE account_id = ${session.accountId}`;
      const organisateurId = randomUUID();
      await sql`
        INSERT INTO account (id, organisation_id, email, role)
        VALUES (${organisateurId}, ${organisationId}, ${`organisateur-${organisateurId}@test.azzel`}, 'organisateur')
      `;
      await decideDossier(
        {
          accountId: organisateurId,
          organisationId,
          email: `organisateur-${organisateurId}@test.azzel`,
          role: 'organisateur',
          createdAt: new Date(),
        },
        coureurRows[0]?.id as string,
        { decision: 'valider' },
        { store, triggerOutbox: async () => {} },
      );

      const edition = await store.findCurrentEdition(organisationId);
      const dateCourse = (edition as NonNullable<typeof edition>).dateCourse;
      const plan = await planifierRappelsJ7(
        { outbox, inscriptions: store },
        decalerDate(dateCourse, -7),
      );
      expect(plan.enfiles).toBeGreaterThanOrEqual(1);

      const summary = await processOutbox(50, { store: outbox });
      expect(summary.sent).toBeGreaterThanOrEqual(1);

      const message = await findMailpitMessage(session.email, RAPPEL_J7_SUBJECT);
      expect(message).not.toBeNull();
      const text = await mailpitMessageText((message as MailpitMessageListItem).ID);
      expect(text).toContain('Salut Yani');
      expect(text).toContain('Ta course est le');
      expect(text).toContain('100 %');
      expect(text).toContain('powerbank');
      expect(text).toContain(readRunnersAppUrl());
      expect(text).not.toContain('Un point après l’autre');
    } finally {
      await mailpitPurge();
    }
  });
});
