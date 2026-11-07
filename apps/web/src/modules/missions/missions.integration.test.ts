import { randomUUID } from 'node:crypto';

import { Workbook } from 'exceljs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getSession,
  requestLoginCode,
  verifyLoginCode,
  type LoginSession,
} from '@/modules/iam/service';
import { createIamStore, type IamStore, type SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  affecterVolontaire,
  createMission,
  createSecteur,
  deleteVolontaire,
  importVolontaires,
  renvoyerInvitation,
  getVolontairesAdminState,
  updateVolontaire,
} from './service';
import {
  VolontaireAffecteError,
  VolontaireDejaActifError,
  VolontaireEmailPrisError,
  VolontaireNotFoundError,
} from './errors';
import { createMissionsStore, type MissionsStore } from './store';
import { processOutbox } from '@/modules/notifications/worker';
import { createOutboxStore } from '@/modules/notifications/outbox-store';

// Story 3.1 — intégration volontaires (base azzel_test, rôle azzel_app) :
// import atomique + rapport, invitations (email sans jeton vers /connexion,
// renvoi, rejeu outbox), connexion par code unifiée (activated_at posé une
// fois, session unique), schéma cible de la migration 0035.

const testUrls = resolveTestDatabaseUrls('missions');

function sessionAdmin(organisationId: string): SessionRecord {
  return {
    accountId: randomUUID(),
    organisationId,
    email: `organisateur-${randomUUID()}@test.azzel`,
    role: 'organisateur',
    createdAt: new Date(),
  };
}

async function xlsxVolontaires(rows: (string | number)[][]): Promise<Uint8Array> {
  const classeur = new Workbook();
  const feuille = classeur.addWorksheet('Volontaires');
  feuille.addRow(['Nom', 'Email', 'Téléphone']);
  for (const row of rows) {
    feuille.addRow(row);
  }
  return new Uint8Array((await classeur.xlsx.writeBuffer()) as ArrayBuffer);
}

function csvVolontaires(lignes: string[]): Uint8Array {
  return new TextEncoder().encode(['Nom;Email;Téléphone', ...lignes].join('\n'));
}

describe.skipIf(testUrls === null)(
  'missions — intégration volontaires (base azzel_test)',
  () => {
    const { appUrl, ownerUrl } = testUrls as NonNullable<typeof testUrls>;
    let connections: AzzelTestConnections | undefined;
    let sql: postgres.Sql;
    let app: postgres.Sql;
    let missionsStore: MissionsStore;
    let iamStore: IamStore;
    let orgId = '';

    beforeAll(async () => {
      connections = await recreateAzzelTestDb(ownerUrl, appUrl);
      ({ owner: sql, app } = connections);
      missionsStore = createMissionsStore(app);
      iamStore = createIamStore(app);
      const organisations =
        await sql<{ id: string }[]>`SELECT id FROM organisation WHERE slug = 'ait-aissi'`;
      orgId = organisations[0]?.id ?? '';
      if (!orgId) {
        throw new Error('Seed « ait-aissi » absente : lance pnpm -F @azzel/web db:migrate');
      }
    }, 60_000);

    afterAll(async () => {
      if (connections) {
        await closeAzzelTestDb(connections);
      }
    });

    /** Connexion par code de bout en bout (story 1.2) : demande + saisie. */
    async function connecterParCode(email: string): Promise<LoginSession> {
      let code = '';
      await requestLoginCode(email, {
        store: iamStore,
        sendCode: async (_destinataire, envoye) => {
          code = envoye;
        },
      });
      expect(code).toMatch(/^\d{6}$/);
      return verifyLoginCode(email, code, { store: iamStore });
    }

    async function activatedAt(email: string): Promise<Date | null> {
      const rows = await sql<{ activated_at: Date | null }[]>`
        SELECT activated_at FROM account WHERE organisation_id = ${orgId} AND email = ${email}
      `;
      return rows[0]?.activated_at ?? null;
    }

    async function volontaireIdPar(email: string): Promise<string> {
      const rows = await sql<{ id: string }[]>`
        SELECT v.id FROM volontaire v JOIN account a ON a.id = v.account_id
        WHERE a.email = ${email} AND v.organisation_id = ${orgId}
      `;
      const id = rows[0]?.id;
      if (!id) {
        throw new Error(`aucun volontaire pour ${email}`);
      }
      return id;
    }

    it('migration 0035 : schéma cible — activated_at + invitation_outbox_id, plus de mot de passe ni de table invitation', async () => {
      const colonnes = await sql<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('account', 'volontaire')
      `;
      const noms = colonnes.map((c) => `${c.table_name}.${c.column_name}`);
      expect(noms).toEqual(
        expect.arrayContaining(['account.activated_at', 'volontaire.invitation_outbox_id']),
      );
      // Plus aucune colonne de mot de passe sur le compte.
      expect(noms.filter((nom) => nom.startsWith('account.password'))).toEqual([]);
      const tables = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'invitation'
      `;
      expect(tables[0]?.count).toBe(0);
    });

    it('import nominal xlsx : comptes + fiches + invitations + emails en file, tout ou rien', async () => {
      const session = sessionAdmin(orgId);
      const rapport = await importVolontaires(
        session,
        {
          bytes: await xlsxVolontaires([
            ['Kahina', 'kahina@exemple.dz', '+213 555 010 203'],
            ['Yani', 'yani@exemple.dz', ''],
            ['Iness', 'iness@exemple.dz', ''],
          ]),
          filename: 'volontaires.xlsx',
        },
        { store: missionsStore },
      );
      expect(rapport.resume).toEqual({ crees: 3, ignores: 0, rejetes: 0, invitationsEnFile: 3 });

      const comptes = await sql<{ role: string; activated_at: Date | null }[]>`
        SELECT role, activated_at FROM account
        WHERE organisation_id = ${orgId} AND email = 'kahina@exemple.dz'
      `;
      expect(comptes[0]).toMatchObject({ role: 'volontaire', activated_at: null });

      const fiches = await sql<{ nom: string; telephone: string | null }[]>`
        SELECT v.nom, v.telephone FROM volontaire v
        JOIN account a ON a.id = v.account_id
        WHERE v.organisation_id = ${orgId} AND a.email = 'kahina@exemple.dz'
      `;
      expect(fiches[0]).toMatchObject({ nom: 'Kahina', telephone: '+213 555 010 203' });

      const outbox = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox
        WHERE organisation_id = ${orgId} AND type = 'invitation_volontaire' AND statut = 'pending'
      `;
      expect(outbox[0]?.count).toBe(3);

      // Invitation = ligne outbox référencée par la fiche (source unique du
      // statut admin) ; payload { nom } SANS jeton.
      const invitation = await sql<{ payload: Record<string, unknown> }[]>`
        SELECT o.payload FROM volontaire v
        JOIN account a ON a.id = v.account_id
        JOIN email_outbox o ON o.id = v.invitation_outbox_id
        WHERE v.organisation_id = ${orgId} AND a.email = 'kahina@exemple.dz'
      `;
      expect(invitation[0]?.payload).toEqual({ nom: 'Kahina' });
      const avecJeton = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox
        WHERE type = 'invitation_volontaire' AND payload ? 'jeton'
      `;
      expect(avecJeton[0]?.count).toBe(0);
    });

    it('re-import du même fichier : lignes ignorées « déjà volontaire », aucune nouvelle invitation', async () => {
      const session = sessionAdmin(orgId);
      const avant = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox WHERE type = 'invitation_volontaire'
      `;
      const rapport = await importVolontaires(
        session,
        {
          bytes: await xlsxVolontaires([['Kahina', 'kahina@exemple.dz', '']]),
          filename: 'volontaires.xlsx',
        },
        { store: missionsStore },
      );
      expect(rapport.resume).toEqual({ crees: 0, ignores: 1, rejetes: 0, invitationsEnFile: 0 });
      expect(rapport.lignes[0]?.raison).toContain('déjà volontaire');
      const apres = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox WHERE type = 'invitation_volontaire'
      `;
      expect(apres[0]?.count).toBe(avant[0]?.count);
    });

    it('doublon dans le fichier et email déjà coureur : rejets ligne par ligne, valides importées', async () => {
      // Compte coureur préexistant (fixture propriétaire, rôle par défaut).
      const emailCoureur = `coureur-${randomUUID()}@test.azzel`;
      await sql`
        INSERT INTO account (organisation_id, email) VALUES (${orgId}, ${emailCoureur})
      `;

      const session = sessionAdmin(orgId);
      const rapport = await importVolontaires(
        session,
        {
          bytes: csvVolontaires([
            `Doublon;doublon@exemple.dz;`,
            `Doublon bis;doublon@exemple.dz;`,
            `Coureur Existant;${emailCoureur};`,
            `Valide;valide@exemple.dz;`,
            `;sansnom@exemple.dz;`,
          ]),
          filename: 'volontaires.csv',
        },
        { store: missionsStore },
      );
      expect(rapport.resume).toEqual({ crees: 2, ignores: 0, rejetes: 3, invitationsEnFile: 2 });
      const parLigne = new Map(rapport.lignes.map((l) => [l.ligne, l]));
      // 1ʳᵉ occurrence créée, 2ᵉ rejetée « doublon dans le fichier ».
      expect(parLigne.get(2)).toMatchObject({ email: 'doublon@exemple.dz', statut: 'créé' });
      expect(parLigne.get(3)).toMatchObject({ email: 'doublon@exemple.dz', statut: 'rejeté' });
      expect(parLigne.get(5)).toMatchObject({ email: 'valide@exemple.dz', statut: 'créé' });
      expect(rapport.lignes.filter((l) => l.statut === 'rejeté').map((l) => l.raison)).toEqual(
        expect.arrayContaining([
          'doublon dans le fichier',
          'un compte coureur existe déjà',
          'nom manquant',
        ]),
      );
    });

    it('connexion volontaire par code : session /volontaires, activated_at posé une fois, session antérieure révoquée', async () => {
      const session = sessionAdmin(orgId);
      await importVolontaires(
        session,
        { bytes: csvVolontaires(['Activation;activation@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      expect(await activatedAt('activation@exemple.dz')).toBeNull();

      const premiere = await connecterParCode('activation@exemple.dz');
      expect(premiere.role).toBe('volontaire');
      expect(await getSession(premiere.token, { store: iamStore })).toMatchObject({
        role: 'volontaire',
        email: 'activation@exemple.dz',
      });
      const activeLe = await activatedAt('activation@exemple.dz');
      expect(activeLe).not.toBeNull();

      // Reconnexion : nouvelle session, l'ancienne révoquée (session unique),
      // activated_at JAMAIS réécrit (COALESCE).
      const seconde = await connecterParCode('Activation@Exemple.DZ ');
      expect(await getSession(premiere.token, { store: iamStore })).toBeNull();
      expect(await getSession(seconde.token, { store: iamStore })).toMatchObject({
        role: 'volontaire',
      });
      expect((await activatedAt('activation@exemple.dz'))?.getTime()).toBe(activeLe?.getTime());

      // Le rôle reste volontaire (jamais promu, jamais recréé en coureur).
      const comptes = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM account
        WHERE organisation_id = ${orgId} AND email = 'activation@exemple.dz' AND role = 'volontaire'
      `;
      expect(comptes[0]?.count).toBe(1);
    });

    it('renvoi manuel : non activé → nouvel email, ancien annulé, référence mise à jour ; activé → 409', async () => {
      const session = sessionAdmin(orgId);
      await importVolontaires(
        session,
        { bytes: csvVolontaires(['Renvoi;renvoi@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      const volontaireId = await volontaireIdPar('renvoi@exemple.dz');
      const reference = async (): Promise<string | null> => {
        const rows = await sql<{ invitation_outbox_id: string | null }[]>`
          SELECT invitation_outbox_id FROM volontaire WHERE id = ${volontaireId}
        `;
        return rows[0]?.invitation_outbox_id ?? null;
      };
      const avant = await reference();
      expect(avant).not.toBeNull();

      await expect(
        renvoyerInvitation(session, volontaireId, { store: missionsStore }),
      ).resolves.toEqual({ email: 'renvoi@exemple.dz' });
      const apres = await reference();
      expect(apres).not.toBeNull();
      expect(apres).not.toBe(avant);

      // L'email précédent (encore pending) est ANNULÉ : un seul email
      // d'invitation en attente par volontaire.
      const statuts = await sql<{ id: string; statut: string }[]>`
        SELECT id, statut FROM email_outbox
        WHERE destinataire = 'renvoi@exemple.dz' AND type = 'invitation_volontaire'
      `;
      expect(statuts).toEqual(
        expect.arrayContaining([
          { id: avant, statut: 'cancelled' },
          { id: apres, statut: 'pending' },
        ]),
      );
      expect(statuts).toHaveLength(2);

      // Première connexion par code → activé → plus de renvoi (409), aucun email.
      await connecterParCode('renvoi@exemple.dz');
      await expect(
        renvoyerInvitation(session, volontaireId, { store: missionsStore }),
      ).rejects.toBeInstanceOf(VolontaireDejaActifError);
      const apresRefus = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM email_outbox
        WHERE destinataire = 'renvoi@exemple.dz' AND type = 'invitation_volontaire'
      `;
      expect(apresRefus[0]?.count).toBe(2);
      expect(await reference()).toBe(apres);
    });

    it('volontaire dont l’email est ajouté à AZZEL_ADMIN_EMAILS après l’import : connexion par code, rôle reste volontaire', async () => {
      await importVolontaires(
        sessionAdmin(orgId),
        { bytes: csvVolontaires(['Promu;promu@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      const precedent = process.env.AZZEL_ADMIN_EMAILS;
      process.env.AZZEL_ADMIN_EMAILS = 'promu@exemple.dz';
      try {
        const connexion = await connecterParCode('promu@exemple.dz');
        // Rôle renvoyé = rôle d'atterrissage (homePathForRole → /volontaires).
        expect(connexion.role).toBe('volontaire');
        expect(await getSession(connexion.token, { store: iamStore })).toMatchObject({
          role: 'volontaire',
        });
        const comptes = await sql<{ role: string }[]>`
          SELECT role FROM account WHERE organisation_id = ${orgId} AND email = 'promu@exemple.dz'
        `;
        expect(comptes.map((c) => c.role)).toEqual(['volontaire']);
      } finally {
        if (precedent === undefined) {
          delete process.env.AZZEL_ADMIN_EMAILS;
        } else {
          process.env.AZZEL_ADMIN_EMAILS = precedent;
        }
      }
    });

    it('renvoi d’un email déjà envoyé (sent) : la ligne envoyée reste « sent », la nouvelle part en file', async () => {
      const session = sessionAdmin(orgId);
      await importVolontaires(
        session,
        { bytes: csvVolontaires(['Envoyé;envoye@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      const volontaireId = await volontaireIdPar('envoye@exemple.dz');
      await sql`
        UPDATE email_outbox SET statut = 'sent', sent_at = now()
        WHERE destinataire = 'envoye@exemple.dz' AND type = 'invitation_volontaire'
      `;
      await renvoyerInvitation(session, volontaireId, { store: missionsStore });
      const statuts = await sql<{ statut: string }[]>`
        SELECT statut FROM email_outbox
        WHERE destinataire = 'envoye@exemple.dz' AND type = 'invitation_volontaire'
        ORDER BY created_at ASC
      `;
      expect(statuts.map((l) => l.statut)).toEqual(['sent', 'pending']);
    });

    it('import d’un email AZZEL_ADMIN_EMAILS : ligne rejetée, aucun compte créé', async () => {
      const precedent = process.env.AZZEL_ADMIN_EMAILS;
      process.env.AZZEL_ADMIN_EMAILS = 'boss-import@exemple.dz';
      try {
        const rapport = await importVolontaires(
          sessionAdmin(orgId),
          { bytes: csvVolontaires(['Boss;boss-import@exemple.dz;']), filename: 'v.csv' },
          { store: missionsStore },
        );
        expect(rapport.lignes[0]).toMatchObject({
          statut: 'rejeté',
          raison: "adresse réservée à l'organisation",
        });
        const comptes = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM account WHERE email = 'boss-import@exemple.dz'
        `;
        expect(comptes[0]?.count).toBe(0);
      } finally {
        if (precedent === undefined) {
          delete process.env.AZZEL_ADMIN_EMAILS;
        } else {
          process.env.AZZEL_ADMIN_EMAILS = precedent;
        }
      }
    });

    it('liste admin : statut d’invitation dérivé de activated_at + outbox (en file, envoyée, activé)', async () => {
      const session = sessionAdmin(orgId);
      const etat = await getVolontairesAdminState(session, { store: missionsStore });
      const parEmail = new Map(etat.volontaires.map((v) => [v.email, v]));

      // Importés plus haut : activation@ activé (connexion par code), kahina@ en file.
      expect(parEmail.get('activation@exemple.dz')?.statutInvitation).toBe('active');
      expect(parEmail.get('activation@exemple.dz')?.statutInvitationLabel).toBe('Activé');
      expect(parEmail.get('kahina@exemple.dz')?.statutInvitation).toBe('en_file');
      expect(parEmail.get('kahina@exemple.dz')).not.toHaveProperty('expireLe');

      // Envoi réel par le worker (store réel, transport stubbé) : kahina passe
      // « envoyée » ; l'email pointe vers /connexion, sans jeton.
      const outboxStore = createOutboxStore(app);
      const envoyes: { to: string; subject: string; text: string }[] = [];
      const resume = await processOutbox(50, {
        store: outboxStore,
        send: async (to, subject, text) => {
          envoyes.push({ to, subject, text });
        },
      });
      expect(resume.sent).toBeGreaterThan(0);
      const invitationEnvoyee = envoyes.find((e) => e.to === 'kahina@exemple.dz');
      expect(invitationEnvoyee?.subject).toBe('Azzel — ton accès volontaire');
      expect(invitationEnvoyee?.text).toContain('/connexion');
      expect(invitationEnvoyee?.text).not.toContain('jeton');
      expect(invitationEnvoyee?.text).not.toContain('choisis ton mot de passe');
      expect(invitationEnvoyee?.text).toContain('la veille');
      // L'email annulé au renvoi n'est jamais parti.
      expect(envoyes.filter((e) => e.to === 'renvoi@exemple.dz')).toHaveLength(1);

      const etatApres = await getVolontairesAdminState(session, { store: missionsStore });
      const apres = new Map(etatApres.volontaires.map((v) => [v.email, v]));
      expect(apres.get('kahina@exemple.dz')?.statutInvitation).toBe('envoyee');
      expect(apres.get('renvoi@exemple.dz')?.statutInvitation).toBe('active');
    });

    it('SMTP indisponible : l’import réussit, les invitations restent en file (rejeu emails:send)', async () => {
      const session = sessionAdmin(orgId);
      const rapport = await importVolontaires(
        session,
        { bytes: csvVolontaires(['Panne SMTP;panne@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      expect(rapport.resume.crees).toBe(1);

      // Worker avec envoi en échec : la ligne est marquée failed + rejeuable,
      // l'import lui-même a déjà réussi (best effort, jamais bloquant).
      const resume = await processOutbox(50, {
        store: createOutboxStore(app),
        send: async () => {
          throw new Error('connect ECONNREFUSED');
        },
      });
      expect(resume.failed).toBeGreaterThan(0);
      const lignes = await sql<{ statut: string; attempts: number; next_attempt_at: Date | null }[]>`
        SELECT statut, attempts, next_attempt_at FROM email_outbox
        WHERE destinataire = 'panne@exemple.dz' AND type = 'invitation_volontaire'
      `;
      expect(lignes[0]).toMatchObject({ statut: 'failed' });
      expect(lignes[0]?.attempts).toBeGreaterThan(0);
      expect(lignes[0]?.next_attempt_at).not.toBeNull();

      // Le statut admin reflète l'échec.
      const etat = await getVolontairesAdminState(session, { store: missionsStore });
      expect(
        etat.volontaires.find((v) => v.email === 'panne@exemple.dz')?.statutInvitation,
      ).toBe('echec');

      // Renvoi après échec : l'ancienne ligne 'failed' passe 'cancelled', la
      // nouvelle part en file ; le worker n'envoie qu'UN email à ce volontaire.
      const volontaireId = await volontaireIdPar('panne@exemple.dz');
      await renvoyerInvitation(session, volontaireId, { store: missionsStore });
      const apresRenvoi = await sql<{ statut: string }[]>`
        SELECT statut FROM email_outbox
        WHERE destinataire = 'panne@exemple.dz' AND type = 'invitation_volontaire'
        ORDER BY created_at ASC
      `;
      expect(apresRenvoi.map((l) => l.statut)).toEqual(['cancelled', 'pending']);
      const envoyes: string[] = [];
      await processOutbox(50, {
        store: createOutboxStore(app),
        send: async (to) => {
          envoyes.push(to);
        },
      });
      expect(envoyes.filter((to) => to === 'panne@exemple.dz')).toHaveLength(1);
    });

    // -------------------------------------------------------------------
    // Story 3.5 — correction et suppression d'un volontaire.
    // -------------------------------------------------------------------

    /** Importe un volontaire isolé et rend son id (fixtures 3.5 indépendantes). */
    async function armer(nom: string, email: string, telephone = ''): Promise<string> {
      const rapport = await importVolontaires(
        sessionAdmin(orgId),
        {
          bytes: await xlsxVolontaires([[nom, email, telephone]]),
          filename: 'un.xlsx',
        },
        { store: missionsStore },
      );
      expect(rapport.resume.crees).toBe(1);
      return volontaireIdPar(email);
    }

    async function statutsOutbox(email: string): Promise<string[]> {
      const lignes = await sql<{ statut: string }[]>`
        SELECT statut FROM email_outbox
        WHERE destinataire = ${email} AND type = 'invitation_volontaire'
        ORDER BY created_at ASC
      `;
      return lignes.map((ligne) => ligne.statut);
    }

    it('adresse mal saisie corrigée : compte à jour, invitation repartie sur la bonne adresse', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Kahina Ait', 'kahina35@exmeple.dz', '+213 555 010 111');

      const resultat = await updateVolontaire(
        session,
        id,
        { nom: 'Kahina Ait', email: 'kahina35@exemple.dz', telephone: '+213 555 010 222' },
        { store: missionsStore },
      );

      expect(resultat.invitationRenvoyee).toBe(true);
      expect(resultat.volontaire).toMatchObject({
        email: 'kahina35@exemple.dz',
        telephone: '+213 555 010 222',
        statutInvitation: 'en_file',
      });
      // L'adresse fautive ne porte plus aucun compte : elle est libre.
      const fautif = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM account
        WHERE organisation_id = ${orgId} AND email = 'kahina35@exmeple.dz'
      `;
      expect(fautif[0]?.count).toBe(0);
      // L'invitation partie dans le vide est annulée, la nouvelle est en file.
      expect(await statutsOutbox('kahina35@exmeple.dz')).toEqual(['cancelled']);
      expect(await statutsOutbox('kahina35@exemple.dz')).toEqual(['pending']);
      // Une seule fiche : pas de second compte créé au passage.
      const fiches = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM volontaire v
        JOIN account a ON a.id = v.account_id
        WHERE v.organisation_id = ${orgId} AND a.email = 'kahina35@exemple.dz'
      `;
      expect(fiches[0]?.count).toBe(1);
    });

    it('nom/téléphone seuls modifiés : aucune invitation remise en file', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Sfia', 'sfia35@exemple.dz');
      const avant = await statutsOutbox('sfia35@exemple.dz');

      const resultat = await updateVolontaire(
        session,
        id,
        { nom: 'Sfia Bouzid', email: 'sfia35@exemple.dz', telephone: '0555 010 300' },
        { store: missionsStore },
      );

      expect(resultat.invitationRenvoyee).toBe(false);
      expect(resultat.volontaire).toMatchObject({
        nom: 'Sfia Bouzid',
        telephone: '0555 010 300',
      });
      expect(await statutsOutbox('sfia35@exemple.dz')).toEqual(avant);
    });

    it('adresse déjà portée par un autre compte : 409, aucune écriture (ni nom ni email)', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Amine', 'amine35@exemple.dz');
      await armer('Dahbia', 'dahbia35@exemple.dz');

      await expect(
        updateVolontaire(
          session,
          id,
          { nom: 'Amine Renommé', email: 'dahbia35@exemple.dz', telephone: null },
          { store: missionsStore },
        ),
      ).rejects.toBeInstanceOf(VolontaireEmailPrisError);

      // Transaction annulée : le nom non plus n'a pas bougé.
      const fiches = await sql<{ nom: string; email: string }[]>`
        SELECT v.nom, a.email FROM volontaire v
        JOIN account a ON a.id = v.account_id
        WHERE v.id = ${id} AND v.organisation_id = ${orgId}
      `;
      expect(fiches[0]).toMatchObject({ nom: 'Amine', email: 'amine35@exemple.dz' });
    });

    it('volontaire déjà activé : email modifiable, mais AUCUNE invitation en file (statut Activé)', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Massi', 'massi35@exemple.dz');
      await connecterParCode('massi35@exemple.dz');
      expect(await activatedAt('massi35@exemple.dz')).not.toBeNull();

      const resultat = await updateVolontaire(
        session,
        id,
        { nom: 'Massi', email: 'massi35.pro@exemple.dz', telephone: null },
        { store: missionsStore },
      );

      expect(resultat.invitationRenvoyee).toBe(false);
      expect(resultat.volontaire.statutInvitation).toBe('active');
      expect(await statutsOutbox('massi35.pro@exemple.dz')).toEqual([]);
      expect(await activatedAt('massi35.pro@exemple.dz')).not.toBeNull();
    });

    it('adresse changée : les codes en vol de l’ANCIENNE adresse sont invalidés, pas ceux de la nouvelle', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Tinhinane', 'tini35@exmeple.dz');
      // Un code est demandé sur chaque adresse (l'ancienne par erreur de frappe,
      // la nouvelle par la vraie personne) : seul celui de l'ancienne tombe.
      await requestLoginCode('tini35@exmeple.dz', { store: iamStore, sendCode: async () => {} });
      await requestLoginCode('tini35.vrai@exemple.dz', { store: iamStore, sendCode: async () => {} });

      await updateVolontaire(
        session,
        id,
        { nom: 'Tinhinane', email: 'tini35.vrai@exemple.dz', telephone: null },
        { store: missionsStore },
      );

      const codes = await sql<{ email: string; invalidated_at: Date | null }[]>`
        SELECT email, invalidated_at FROM login_code
        WHERE organisation_id = ${orgId} AND email IN ('tini35@exmeple.dz', 'tini35.vrai@exemple.dz')
      `;
      const ancien = codes.find((code) => code.email === 'tini35@exmeple.dz');
      const nouveau = codes.find((code) => code.email === 'tini35.vrai@exemple.dz');
      expect(ancien?.invalidated_at).not.toBeNull();
      expect(nouveau?.invalidated_at).toBeNull();
    });

    it('suppression : fiche et compte partis, sessions coupées, invitation annulée, adresse réutilisable', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Ferhat', 'ferhat35@exemple.dz');
      await connecterParCode('ferhat35@exemple.dz');
      const sessionsAvant = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM session s
        JOIN account a ON a.id = s.account_id
        WHERE a.organisation_id = ${orgId} AND a.email = 'ferhat35@exemple.dz'
      `;
      expect(sessionsAvant[0]?.count).toBe(1);

      await expect(deleteVolontaire(session, id, { store: missionsStore })).resolves.toEqual({
        ok: true,
      });

      const restes = await sql<{ comptes: number; fiches: number; sessions: number }[]>`
        SELECT
          (SELECT count(*)::int FROM account WHERE organisation_id = ${orgId} AND email = 'ferhat35@exemple.dz') AS comptes,
          (SELECT count(*)::int FROM volontaire WHERE id = ${id}) AS fiches,
          (SELECT count(*)::int FROM session WHERE account_id NOT IN (SELECT id FROM account)) AS sessions
      `;
      expect(restes[0]).toEqual({ comptes: 0, fiches: 0, sessions: 0 });
      // Aucun email ne part après coup.
      expect(await statutsOutbox('ferhat35@exemple.dz')).not.toContain('pending');

      // L'adresse est libre : un import ultérieur la recrée (« créé », pas « ignoré »).
      const rapport = await importVolontaires(
        session,
        { bytes: await xlsxVolontaires([['Ferhat Nouveau', 'ferhat35@exemple.dz', '']]), filename: 'r.xlsx' },
        { store: missionsStore },
      );
      expect(rapport.lignes[0]).toMatchObject({ statut: 'créé' });
    });

    it('suppression d’un volontaire affecté : 409 chiffré, rien n’est supprimé', async () => {
      const session = sessionAdmin(orgId);
      const id = await armer('Nadir', 'nadir35@exemple.dz');
      const secteur = await createSecteur(
        session,
        { nom: 'Secteur 3.5', lieu: 'Carrefour haut', contact: null },
        { store: missionsStore },
      );
      const mission = await createMission(
        session,
        {
          secteurId: secteur.id,
          type: 'accueil',
          titre: 'Accueil 3.5',
          debutLe: '2027-05-01T05:00:00.000Z',
          finLe: '2027-05-01T09:00:00.000Z',
          consignes: null,
          estArrivee: false,
          barriereLe: null,
        },
        { store: missionsStore },
      );
      await affecterVolontaire(
        session,
        { missionId: mission.id, volontaireId: id },
        { store: missionsStore },
      );

      const erreur = await deleteVolontaire(session, id, { store: missionsStore }).catch(
        (error: unknown) => error,
      );
      expect(erreur).toBeInstanceOf(VolontaireAffecteError);
      expect((erreur as VolontaireAffecteError).nombreAffectations).toBe(1);

      const restes = await sql<{ fiches: number; affectations: number }[]>`
        SELECT
          (SELECT count(*)::int FROM volontaire WHERE id = ${id}) AS fiches,
          (SELECT count(*)::int FROM affectation WHERE volontaire_id = ${id}) AS affectations
      `;
      expect(restes[0]).toEqual({ fiches: 1, affectations: 1 });
    });

    it('isolation : un volontaire d’une AUTRE organisation est introuvable (ni lu, ni modifié, ni supprimé)', async () => {
      const id = await armer('Katia', 'katia35@exemple.dz');
      const autre = sessionAdmin(randomUUID());

      await expect(
        updateVolontaire(
          autre,
          id,
          { nom: 'Pirate', email: 'pirate35@exemple.dz', telephone: null },
          { store: missionsStore },
        ),
      ).rejects.toBeInstanceOf(VolontaireNotFoundError);
      await expect(deleteVolontaire(autre, id, { store: missionsStore })).rejects.toBeInstanceOf(
        VolontaireNotFoundError,
      );

      const fiches = await sql<{ nom: string; email: string }[]>`
        SELECT v.nom, a.email FROM volontaire v
        JOIN account a ON a.id = v.account_id
        WHERE v.id = ${id}
      `;
      expect(fiches[0]).toMatchObject({ nom: 'Katia', email: 'katia35@exemple.dz' });
    });
  },
);
