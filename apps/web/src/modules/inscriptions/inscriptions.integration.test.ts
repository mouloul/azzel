import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';

import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

import { applyAllMigrations, MIGRATION_DIRS } from './migrate';
import {
  BothAcceptancesRequiredError,
  DossierAReprendreError,
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

/** Noms des fichiers .sql de tous les dossiers de migrations du runner, triés. */
async function listMigrationFiles(): Promise<string[]> {
  const names: string[] = [];
  for (const dir of MIGRATION_DIRS) {
    const entries = await readdir(dir);
    names.push(...entries.filter((name) => name.endsWith('.sql')));
  }
  return names.sort();
}

const testUrls = resolveTestDatabaseUrls('inscriptions');

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
    genre: 'H',
    hebergement: '',
    ...overrides,
  };
}

describe.skipIf(testUrls === null)('inscriptions — intégration Postgres (base azzel_test)', () => {
  const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
  // sql : propriétaire (fixtures + assertions, bypass RLS) ; app : rôle azzel_app.
  let connections: AzzelTestConnections | undefined;
  let sql: postgres.Sql;
  let app: postgres.Sql;
  let store: InscriptionsStore;

  beforeAll(async () => {
    connections = await recreateAzzelTestDb(ownerUrl, appUrl);
    ({ owner: sql, app } = connections);
    store = createInscriptionsStore(app);
  }, 60_000);

  afterAll(async () => {
    if (connections) {
      await closeAzzelTestDb(connections);
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
      role: 'coureur' as const,
      createdAt: new Date(),
    };
  }

  describe('contingent de places', () => {
    afterEach(async () => {
      await sql`UPDATE edition SET capacite = 600, seuil_affichage_places = 200`;
      await sql`DELETE FROM coureur`;
    });

    async function statutDe(session: SessionRecord): Promise<string | null> {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM coureur WHERE account_id = ${session.accountId}
      `;
      return rows[0]?.status ?? null;
    }

    it('la dernière place n’est attribuée QU’UNE fois, même sur dix envois simultanés', async () => {
      await sql`UPDATE edition SET capacite = 1`;
      const sessions = await Promise.all(Array.from({ length: 10 }, () => createSession()));

      // Envoi réellement concurrent : sans verrou côté base, chaque transaction
      // lit « 0 place occupée » et les dix se croient admises.
      const resultats = await Promise.allSettled(
        sessions.map((session) => submitInscription(session, validInput(), { store })),
      );
      expect(resultats.every((r) => r.status === 'fulfilled')).toBe(true);

      const statuts = await Promise.all(sessions.map(statutDe));
      expect(statuts.filter((statut) => statut === 'en constitution')).toHaveLength(1);
      expect(statuts.filter((statut) => statut === 'liste d’attente')).toHaveLength(9);
    });

    it('capacité atteinte : l’inscription est enregistrée en liste d’attente, pas refusée', async () => {
      await sql`UPDATE edition SET capacite = 0`;
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      expect(await statutDe(session)).toBe('liste d’attente');
    });

    it('modifier son inscription ne consomme pas une seconde place', async () => {
      await sql`UPDATE edition SET capacite = 1`;
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      await submitInscription(session, validInput({ prenom: 'Yanis' }), { store });
      expect(await statutDe(session)).toBe('en constitution');

      // La place reste prise par le même dossier : le suivant attend.
      const autre = await createSession();
      await submitInscription(autre, validInput(), { store });
      expect(await statutDe(autre)).toBe('liste d’attente');
    });

    it('un coureur en liste d’attente peut corriger son inscription sans être promu', async () => {
      await sql`UPDATE edition SET capacite = 0`;
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      await submitInscription(session, validInput({ prenom: 'Yanis' }), { store });
      expect(await statutDe(session)).toBe('liste d’attente');
      const rows = await sql<{ first_name: string }[]>`
        SELECT first_name FROM coureur WHERE account_id = ${session.accountId}
      `;
      expect(rows[0]?.first_name).toBe('Yanis');
    });

    it('un dossier refusé rend sa place', async () => {
      await sql`UPDATE edition SET capacite = 1`;
      const premier = await createSession();
      await submitInscription(premier, validInput(), { store });
      await sql`
        UPDATE coureur SET status = 'refusé', refusal_reason = 'Preuve illisible.'
        WHERE account_id = ${premier.accountId}
      `;
      const suivant = await createSession();
      await submitInscription(suivant, validInput(), { store });
      expect(await statutDe(suivant)).toBe('en constitution');
    });
  });

  describe('échéance de la preuve', () => {
    afterEach(async () => {
      await sql`UPDATE edition SET capacite = 600, delai_preuve_jours = 2`;
      await sql`DELETE FROM coureur`;
    });

    async function ligne(session: SessionRecord) {
      const rows = await sql<{ status: string; preuve_due_at: Date | null }[]>`
        SELECT status, preuve_due_at FROM coureur WHERE account_id = ${session.accountId}
      `;
      return rows[0];
    }

    it('une place prise : l’échéance est figée à la fin du surlendemain', async () => {
      const session = await createSession();
      const avant = Date.now();
      await submitInscription(session, validInput(), { store });
      const row = await ligne(session);
      expect(row?.status).toBe('en constitution');
      expect(row?.preuve_due_at).not.toBeNull();
      // Fenêtre large : on vérifie l'ordre de grandeur (deux jours), le calcul
      // exact à la seconde près est couvert par echeance.test.ts.
      const delta = (row?.preuve_due_at as Date).getTime() - avant;
      expect(delta).toBeGreaterThan(24 * 3600 * 1000);
      expect(delta).toBeLessThan(4 * 24 * 3600 * 1000);
    });

    it('liste d’attente : aucune échéance — on ne réclame pas un versement pour une place qu’on n’a pas', async () => {
      await sql`UPDATE edition SET capacite = 0`;
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      const row = await ligne(session);
      expect(row?.status).toBe('liste d’attente');
      expect(row?.preuve_due_at).toBeNull();
    });

    it('corriger son inscription ne repousse PAS l’échéance', async () => {
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      const premiere = (await ligne(session))?.preuve_due_at;

      await sql`
        UPDATE coureur SET preuve_due_at = TIMESTAMPTZ '2027-01-01T22:59:59.999Z'
        WHERE account_id = ${session.accountId}
      `;
      await submitInscription(session, validInput({ prenom: 'Yanis' }), { store });
      const apres = (await ligne(session))?.preuve_due_at;

      // L'échéance posée en base survit à la modification : elle n'est ni
      // recalculée, ni remise à la valeur d'origine.
      expect(apres?.toISOString()).toBe('2027-01-01T22:59:59.999Z');
      expect(apres?.toISOString()).not.toBe(premiere?.toISOString());
    });
  });

  describe('balayage des échéances dépassées', () => {
    afterEach(async () => {
      await sql`UPDATE edition SET capacite = 600, delai_preuve_jours = 2`;
      await sql`DELETE FROM email_outbox`;
      await sql`DELETE FROM preuve`;
      await sql`DELETE FROM coureur`;
    });

    /** Inscrit, puis force l'échéance dans le passé. */
    async function inscritEchu(decalageMs: number): Promise<SessionRecord> {
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      await sql`
        UPDATE coureur
        SET preuve_due_at = ${new Date(Date.now() + decalageMs)}
        WHERE account_id = ${session.accountId}
      `;
      return session;
    }

    async function statutDe(session: SessionRecord): Promise<string | null> {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM coureur WHERE account_id = ${session.accountId}
      `;
      return rows[0]?.status ?? null;
    }

    it('échéance dépassée sans preuve : expirée, et la place est rendue', async () => {
      await sql`UPDATE edition SET capacite = 1`;
      const retardataire = await inscritEchu(-1000);

      const bilan = await store.expirerInscriptionsEchues(new Date());
      expect(bilan.expirees).toBe(1);
      expect(await statutDe(retardataire)).toBe('expirée');

      // La place libérée profite au suivant : c'est tout l'intérêt.
      const suivant = await createSession();
      await submitInscription(suivant, validInput(), { store });
      expect(await statutDe(suivant)).toBe('en constitution');
    });

    it('échéance à venir : intouchée', async () => {
      const aLheure = await inscritEchu(60_000);
      const bilan = await store.expirerInscriptionsEchues(new Date());
      expect(bilan.expirees).toBe(0);
      expect(await statutDe(aLheure)).toBe('en constitution');
    });

    it('preuve déposée : jamais expirée, même après l’échéance', async () => {
      // La règle porte sur le DÉPÔT de la preuve, pas sur sa validation par
      // l'équipe : un dossier déposé à temps ne doit pas sauter parce que
      // personne ne l'a encore regardé.
      const session = await inscritEchu(-1000);
      const coureurs = await sql<{ id: string; organisation_id: string }[]>`
        SELECT id, organisation_id FROM coureur WHERE account_id = ${session.accountId}
      `;
      const coureur = coureurs[0];
      await sql`
        INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
        VALUES (${coureur!.organisation_id}, ${coureur!.id}, 'k', 'image/jpeg', 1024, 'abc', 'active')
      `;
      const bilan = await store.expirerInscriptionsEchues(new Date());
      expect(bilan.expirees).toBe(0);
      expect(await statutDe(session)).toBe('en constitution');
    });

    it('rejeu du balayage : aucun doublon, aucun second email', async () => {
      await inscritEchu(-1000);
      const premier = await store.expirerInscriptionsEchues(new Date());
      const second = await store.expirerInscriptionsEchues(new Date());
      expect(premier.expirees).toBe(1);
      expect(second.expirees).toBe(0);

      const emails = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox WHERE type = 'inscription_expiree'
      `;
      expect(emails[0]?.count).toBe(1);
    });

    it('un dossier en liste d’attente n’expire jamais : il n’a pas d’échéance', async () => {
      await sql`UPDATE edition SET capacite = 0`;
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      const bilan = await store.expirerInscriptionsEchues(new Date());
      expect(bilan.expirees).toBe(0);
      expect(await statutDe(session)).toBe('liste d’attente');
    });

    it('la date du constat est enregistrée — sinon impossible de répondre à qui conteste', async () => {
      const session = await inscritEchu(-1000);
      const instant = new Date('2027-04-01T10:00:00Z');
      await store.expirerInscriptionsEchues(instant);
      const rows = await sql<{ expired_at: Date | null }[]>`
        SELECT expired_at FROM coureur WHERE account_id = ${session.accountId}
      `;
      expect(rows[0]?.expired_at?.toISOString()).toBe(instant.toISOString());
    });
  });

  describe('rappel de la veille', () => {
    afterEach(async () => {
      await sql`DELETE FROM email_outbox`;
      await sql`DELETE FROM preuve`;
      await sql`DELETE FROM coureur`;
    });

    async function inscritAvecEcheance(dansMs: number): Promise<SessionRecord> {
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      await sql`
        UPDATE coureur SET preuve_due_at = ${new Date(Date.now() + dansMs)}
        WHERE account_id = ${session.accountId}
      `;
      return session;
    }

    async function rappels(): Promise<number> {
      const rows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox WHERE type = 'rappel_preuve'
      `;
      return rows[0]?.count ?? 0;
    }

    it('échéance dans 20 heures : rappel enfilé', async () => {
      await inscritAvecEcheance(20 * 3600 * 1000);
      expect(await store.enfilerRappelsPreuve(new Date())).toBe(1);
      expect(await rappels()).toBe(1);
    });

    it('échéance dans 40 heures : trop tôt, aucun rappel', async () => {
      await inscritAvecEcheance(40 * 3600 * 1000);
      expect(await store.enfilerRappelsPreuve(new Date())).toBe(0);
    });

    it('échéance déjà passée : plus un rappel mais une expiration', async () => {
      await inscritAvecEcheance(-3600 * 1000);
      expect(await store.enfilerRappelsPreuve(new Date())).toBe(0);
    });

    it('un cron horaire ne doit pas envoyer vingt-quatre emails : un seul rappel', async () => {
      await inscritAvecEcheance(20 * 3600 * 1000);
      for (let passage = 0; passage < 5; passage += 1) {
        await store.enfilerRappelsPreuve(new Date());
      }
      expect(await rappels()).toBe(1);
    });

    it('preuve déjà déposée : aucun rappel — il n’y a plus rien à rappeler', async () => {
      const session = await inscritAvecEcheance(20 * 3600 * 1000);
      const coureurs = await sql<{ id: string; organisation_id: string }[]>`
        SELECT id, organisation_id FROM coureur WHERE account_id = ${session.accountId}
      `;
      const coureur = coureurs[0];
      await sql`
        INSERT INTO preuve (organisation_id, coureur_id, storage_key, mime, size_bytes, sha256, status)
        VALUES (${coureur!.organisation_id}, ${coureur!.id}, 'k', 'image/jpeg', 1024, 'abc', 'active')
      `;
      expect(await store.enfilerRappelsPreuve(new Date())).toBe(0);
    });
  });

  describe('contingent d’hébergement', () => {
    afterEach(async () => {
      await sql`UPDATE edition SET capacite = 600, capacite_hebergement = 200`;
      await sql`DELETE FROM coureur`;
    });

    async function hebergementDe(session: SessionRecord): Promise<boolean | null> {
      const rows = await sql<{ hebergement: boolean }[]>`
        SELECT hebergement FROM coureur WHERE account_id = ${session.accountId}
      `;
      return rows[0]?.hebergement ?? null;
    }

    it('option demandée, lit disponible : accordée', async () => {
      const session = await createSession();
      await submitInscription(session, validInput({ hebergement: 'oui' }), { store });
      expect(await hebergementDe(session)).toBe(true);
    });

    it('option non demandée : pas d’hébergement', async () => {
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      expect(await hebergementDe(session)).toBe(false);
    });

    it('le dernier lit n’est attribué QU’UNE fois sur dix demandes simultanées', async () => {
      await sql`UPDATE edition SET capacite_hebergement = 1`;
      const sessions = await Promise.all(Array.from({ length: 10 }, () => createSession()));
      await Promise.all(
        sessions.map((session) =>
          submitInscription(session, validInput({ hebergement: 'oui' }), { store }),
        ),
      );
      const accordes = await Promise.all(sessions.map(hebergementDe));
      expect(accordes.filter(Boolean)).toHaveLength(1);
    });

    it('hébergement complet : l’inscription passe quand même, sans le lit', async () => {
      await sql`UPDATE edition SET capacite_hebergement = 0`;
      const session = await createSession();
      await submitInscription(session, validInput({ hebergement: 'oui' }), { store });
      expect(await hebergementDe(session)).toBe(false);
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM coureur WHERE account_id = ${session.accountId}
      `;
      expect(rows[0]?.status).toBe('en constitution');
    });

    it('un dossier expiré rend son lit', async () => {
      await sql`UPDATE edition SET capacite_hebergement = 1`;
      const premier = await createSession();
      await submitInscription(premier, validInput({ hebergement: 'oui' }), { store });
      await sql`
        UPDATE coureur SET status = 'expirée', expired_at = now()
        WHERE account_id = ${premier.accountId}
      `;
      const suivant = await createSession();
      await submitInscription(suivant, validInput({ hebergement: 'oui' }), { store });
      expect(await hebergementDe(suivant)).toBe(true);
    });

    it('contingent abaissé à zéro : le détenteur perd son lit à son prochain envoi', async () => {
      // Comportement vérifié pour la recette (étape 6.9) : le contingent fait
      // autorité à CHAQUE enregistrement, il n'est pas acquis une fois pour
      // toutes. À connaître avant d'abaisser le contingent en cours de route.
      await sql`UPDATE edition SET capacite_hebergement = 1`;
      const session = await createSession();
      await submitInscription(session, validInput({ hebergement: 'oui' }), { store });
      expect(await hebergementDe(session)).toBe(true);

      await sql`UPDATE edition SET capacite_hebergement = 0`;
      await submitInscription(session, validInput({ hebergement: 'oui' }), { store });
      expect(await hebergementDe(session)).toBe(false);
    });

    it('renoncer à l’hébergement libère le lit pour un autre', async () => {
      await sql`UPDATE edition SET capacite_hebergement = 1`;
      const session = await createSession();
      await submitInscription(session, validInput({ hebergement: 'oui' }), { store });
      await submitInscription(session, validInput(), { store });
      expect(await hebergementDe(session)).toBe(false);

      const autre = await createSession();
      await submitInscription(autre, validInput({ hebergement: 'oui' }), { store });
      expect(await hebergementDe(autre)).toBe(true);
    });
  });

  describe('réglages d’édition et liste d’attente (administration)', () => {
    afterEach(async () => {
      await sql`UPDATE edition SET capacite = 600, seuil_affichage_places = 200, capacite_hebergement = 200, prix_dossard_da = 2000, prix_hebergement_da = 1500, delai_preuve_jours = 2, date_course_publique = 0`;
      await sql`DELETE FROM edition_reglage_journal`;
      await sql`DELETE FROM coureur`;
    });

    async function editionId(): Promise<string> {
      const rows = await sql<{ id: string }[]>`SELECT id FROM edition LIMIT 1`;
      return rows[0]!.id;
    }

    async function organisationId(): Promise<string> {
      const rows = await sql<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      return rows[0]!.id;
    }

    it('relever la capacité : valeur appliquée et changement journalisé', async () => {
      const session = await createSession();
      await store.updateReglagesEdition({
        organisationId: await organisationId(),
        editionId: await editionId(),
        accountId: session.accountId,
        reglages: { capacite: 1000 },
      });
      const rows = await sql<{ capacite: number }[]>`SELECT capacite FROM edition LIMIT 1`;
      expect(rows[0]?.capacite).toBe(1000);

      const journal = await sql<
        { champ: string; ancienne_valeur: number; nouvelle_valeur: number }[]
      >`SELECT champ, ancienne_valeur, nouvelle_valeur FROM edition_reglage_journal`;
      expect(journal).toEqual([
        { champ: 'capacite', ancienne_valeur: 600, nouvelle_valeur: 1000 },
      ]);
    });

    it('la date de course est cachée par défaut : une édition neuve ne divulgue rien', async () => {
      const rows = await sql<{ date_course_publique: number }[]>`
        SELECT date_course_publique FROM edition LIMIT 1
      `;
      expect(rows[0]?.date_course_publique).toBe(0);
    });

    it('publier la date : appliqué, journalisé, et la contrainte refuse tout autre entier', async () => {
      const session = await createSession();
      const edition = await store.updateReglagesEdition({
        organisationId: await organisationId(),
        editionId: await editionId(),
        accountId: session.accountId,
        reglages: { dateCoursePublique: 1 },
      });
      expect(edition.dateCoursePublique).toBe(true);

      const journal = await sql<{ champ: string; ancienne_valeur: number; nouvelle_valeur: number }[]>`
        SELECT champ, ancienne_valeur, nouvelle_valeur FROM edition_reglage_journal
      `;
      expect(journal).toEqual([
        { champ: 'dateCoursePublique', ancienne_valeur: 0, nouvelle_valeur: 1 },
      ]);

      await expect(sql`UPDATE edition SET date_course_publique = 2`).rejects.toThrow();
    });

    it('la lecture publique de l’accueil suit le réglage', async () => {
      const lecture = await store.readDefaultOrgDateCourse();
      expect(lecture?.publique).toBe(false);
      await sql`UPDATE edition SET date_course_publique = 1`;
      expect((await store.readDefaultOrgDateCourse())?.publique).toBe(true);
    });

    it('une ligne PAR CHAMP modifié : un champ inchangé ne laisse aucune trace', async () => {
      const session = await createSession();
      await store.updateReglagesEdition({
        organisationId: await organisationId(),
        editionId: await editionId(),
        accountId: session.accountId,
        // capacite inchangée, seuil modifié : une seule ligne attendue.
        reglages: { capacite: 600, seuilAffichagePlaces: 150 },
      });
      const journal = await sql<{ champ: string }[]>`
        SELECT champ FROM edition_reglage_journal
      `;
      expect(journal.map((l) => l.champ)).toEqual(['seuilAffichagePlaces']);
    });

    it('liste d’attente : ordonnée par ancienneté d’inscription', async () => {
      await sql`UPDATE edition SET capacite = 0`;
      const premier = await createSession();
      await submitInscription(premier, validInput({ prenom: 'Premier' }), { store });
      const second = await createSession();
      await submitInscription(second, validInput({ prenom: 'Second' }), { store });

      const attente = await store.listListeAttente(await editionId(), await organisationId());
      expect(attente.map((c) => c.prenom)).toEqual(['Premier', 'Second']);
    });

    it('attribuer une place : le coureur passe en constitution avec une échéance neuve', async () => {
      await sql`UPDATE edition SET capacite = 0`;
      const session = await createSession();
      await submitInscription(session, validInput(), { store });
      await sql`UPDATE edition SET capacite = 1`;

      const attente = await store.listListeAttente(await editionId(), await organisationId());
      const resultat = await store.attribuerPlace({
        organisationId: await organisationId(),
        coureurId: attente[0]!.id,
        maintenant: new Date(),
      });
      expect(resultat).toBe('attribuee');

      const rows = await sql<{ status: string; preuve_due_at: Date | null }[]>`
        SELECT status, preuve_due_at FROM coureur WHERE account_id = ${session.accountId}
      `;
      expect(rows[0]?.status).toBe('en constitution');
      // Le délai repart de l'attribution : le coureur n'est pas puni de son attente.
      expect(rows[0]?.preuve_due_at).not.toBeNull();
    });

    it('attribuer sans place libre : refusé, le coureur reste en attente', async () => {
      await sql`UPDATE edition SET capacite = 1`;
      const occupant = await createSession();
      await submitInscription(occupant, validInput(), { store });
      const attendeur = await createSession();
      await submitInscription(attendeur, validInput(), { store });

      const attente = await store.listListeAttente(await editionId(), await organisationId());
      const resultat = await store.attribuerPlace({
        organisationId: await organisationId(),
        coureurId: attente[0]!.id,
        maintenant: new Date(),
      });
      expect(resultat).toBe('complet');

      const rows = await sql<{ status: string }[]>`
        SELECT status FROM coureur WHERE account_id = ${attendeur.accountId}
      `;
      expect(rows[0]?.status).toBe('liste d’attente');
    });
  });

  it('migrations : toutes appliquées avec les seeds attendus', async () => {
    const rows =
      await sql`SELECT name FROM schema_migrations ORDER BY name`;
    // Liste dérivée des fichiers plutôt qu'écrite en dur : chaque story ajoute une
    // migration, et une liste figée ici fait échouer la suite pour une raison sans rapport.
    expect(rows.map((row) => row.name)).toEqual(await listMigrationFiles());

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
    // Migration 0040 : la longue s'aligne sur le relevé GPX (28,0 km) et les
    // noms ne portent plus la distance. La moyenne garde sa distance annoncée
    // tant que son tracé court n'est pas défini.
    expect(epreuves).toEqual([
      { slug: 'longue', distance_km: 28 },
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
    expect(rows[0]?.count).toBe((await listMigrationFiles()).length);
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
      ['epreuve', 'nom', 'telephone', 'contactUrgenceNom', 'contactUrgenceTelephone', 'dateNaissance', 'tailleTshirt', 'genre'].sort(),
    );
    const rows = await sql`SELECT count(*)::int AS count FROM coureur WHERE account_id = ${session.accountId}`;
    expect(rows[0]?.count).toBe(0);
  });

  it('date de naissance absurde : moins de 18 ans ou plus de 100 ans refusés', async () => {
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
    await sql`UPDATE coureur SET status = 'validé' WHERE id = ${summary.id}`;

    await expect(
      submitInscription(session, validInput({ epreuve: 'moyenne' }), { store }),
    ).rejects.toBeInstanceOf(DossierValidatedError);

    const rows = await sql`
      SELECT e.slug FROM coureur c JOIN epreuve e ON e.id = c.epreuve_id WHERE c.account_id = ${session.accountId}
    `;
    expect(rows[0]?.slug).toBe('longue');
  });

  it('dossier refusé : submitInscription le reprend (en constitution, motif effacé, saisie appliquée)', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    await sql`UPDATE coureur SET status = 'refusé', refusal_reason = 'dossier incomplet' WHERE id = ${summary.id}`;

    const repris = await submitInscription(session, validInput({ epreuve: 'moyenne' }), { store });

    expect(repris.status).toBe('en constitution');
    const rows = await sql`
      SELECT e.slug, c.status, c.refusal_reason
      FROM coureur c JOIN epreuve e ON e.id = c.epreuve_id
      WHERE c.account_id = ${session.accountId}
    `;
    expect(rows[0]?.slug).toBe('moyenne');
    expect(rows[0]?.status).toBe('en constitution');
    expect(rows[0]?.refusal_reason).toBeNull();
  });

  it('dossier refusé : acceptDocuments rejeté, acceptations inchangées', async () => {
    const session = await createSession();
    const summary = await submitInscription(session, validInput(), { store });
    const snapshot = await acceptDocuments(
      session,
      { decharge: true, reglement: true },
      { store },
    );
    await sql`UPDATE coureur SET status = 'refusé', refusal_reason = 'dossier incomplet' WHERE id = ${summary.id}`;

    // Refusé : rien ne bouge tant que le dossier n'est pas repris par
    // « Modifier mon inscription ».
    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(DossierAReprendreError);

    const rows = await sql`
      SELECT decharge_accepted_at, reglement_accepted_at, refusal_reason
      FROM coureur WHERE id = ${summary.id}
    `;
    expect(rows[0]?.decharge_accepted_at?.toISOString()).toBe(snapshot.decharge.acceptedAt);
    expect(rows[0]?.reglement_accepted_at?.toISOString()).toBe(snapshot.reglement.acceptedAt);
    expect(rows[0]?.refusal_reason).toBe('dossier incomplet');
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
    // Marge d'horloge ±1 s : l'horodatage vient de now() côté Postgres (VM Docker),
    // dont l'horloge peut dériver de quelques dizaines de ms de celle de l'hôte.
    // L'invariant protégé : horodatage serveur DANS la fenêtre de la requête, et
    // décharge/règlement frappées du même now() (transaction commune).
    expect(dechargeAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(dechargeAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
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
    await sql`UPDATE coureur SET status = 'validé' WHERE id = ${summary.id}`;

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
