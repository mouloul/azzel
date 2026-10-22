import { randomUUID } from 'node:crypto';

import { Workbook } from 'exceljs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  InvalidCredentialsError,
  InvitationExpiredError,
  InvitationInvalidError,
  VolunteerCodeLoginRefusedError,
} from '@/modules/iam/errors';
import {
  activerVolontaire,
  connecterVolontaire,
  getSession,
  requestLoginCode,
  sha256Hex,
} from '@/modules/iam/service';
import { createIamStore, type IamStore, type SessionRecord } from '@/modules/iam/store';
import {
  closeAzzelTestDb,
  recreateAzzelTestDb,
  resolveTestDatabaseUrls,
  type AzzelTestConnections,
} from '@/test/integration-db';

import {
  importVolontaires,
  renvoyerInvitation,
  getVolontairesAdminState,
} from './service';
import { VolontaireDejaActifError } from './errors';
import { createMissionsStore, type MissionsStore } from './store';
import { processOutbox } from '@/modules/notifications/worker';
import { createOutboxStore } from '@/modules/notifications/outbox-store';

// Story 3.1 — intégration volontaires (base azzel_test, rôle azzel_app) :
// import atomique + rapport, invitations (consommation, expiration, renvoi,
// rejeu outbox), connexion mot de passe + session unique + gating rôle.

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

    /** Jeton brut de la dernière invitation en file pour un email donné. */
    async function jetonEnFile(email: string): Promise<string> {
      const rows = await sql<{ payload: { jeton?: string } }[]>`
        SELECT payload FROM email_outbox
        WHERE destinataire = ${email} AND type = 'invitation_volontaire'
        ORDER BY created_at DESC LIMIT 1
      `;
      const jeton = rows[0]?.payload?.jeton;
      if (!jeton) {
        throw new Error(`aucune invitation en file pour ${email}`);
      }
      return jeton;
    }

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

      const comptes = await sql<{ role: string; password_set_at: Date | null }[]>`
        SELECT role, password_set_at FROM account
        WHERE organisation_id = ${orgId} AND email = 'kahina@exemple.dz'
      `;
      expect(comptes[0]).toMatchObject({ role: 'volontaire', password_set_at: null });

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

    it('invitation : définition du mot de passe consomme le jeton et ouvre la session /volontaires', async () => {
      const session = sessionAdmin(orgId);
      await importVolontaires(
        session,
        { bytes: csvVolontaires(['Activation;activation@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      const jeton = await jetonEnFile('activation@exemple.dz');

      const activation = await activerVolontaire(jeton, 'motdepasse-2026', { store: iamStore });
      expect(activation.email).toBe('activation@exemple.dz');

      const record = await getSession(activation.token, { store: iamStore });
      expect(record).toMatchObject({ role: 'volontaire', email: 'activation@exemple.dz' });

      // Jeton consommé : réutilisation refusée, aucun second compte ouvert.
      await expect(
        activerVolontaire(jeton, 'autre-motdepasse-1', { store: iamStore }),
      ).rejects.toBeInstanceOf(InvitationInvalidError);

      // Gating rôle (couverture unitaire du routeur dans session.test.ts) :
      // la session ouverte porte bien le rôle volontaire — refusée pour
      // l'organisateur, admise pour volontaire.
      expect(record?.role).toBe('volontaire');
      expect(record?.role).not.toBe('organisateur');
    });

    it('invitation expirée (> 14 jours) : 410, aucun mot de passe défini', async () => {
      const session = sessionAdmin(orgId);
      await importVolontaires(
        session,
        { bytes: csvVolontaires(['Expirée;expiree@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      const jeton = await jetonEnFile('expiree@exemple.dz');
      await sql`UPDATE invitation SET expire_le = now() - interval '1 hour' WHERE jeton_hash = ${sha256Hex(jeton)}`;

      await expect(
        activerVolontaire(jeton, 'motdepasse-2026', { store: iamStore }),
      ).rejects.toBeInstanceOf(InvitationExpiredError);
      const comptes = await sql<{ password_hash: string | null }[]>`
        SELECT password_hash FROM account WHERE email = 'expiree@exemple.dz'
      `;
      expect(comptes[0]?.password_hash).toBeNull();
    });

    it('renvoi manuel : nouvelle invitation, ancienne révoquée, renvoi à un activé refusé', async () => {
      const session = sessionAdmin(orgId);
      const rapport = await importVolontaires(
        session,
        { bytes: csvVolontaires(['Renvoi;renvoi@exemple.dz;']), filename: 'v.csv' },
        { store: missionsStore },
      );
      const cree = rapport.lignes.find((l) => l.statut === 'créé');
      expect(cree).toBeTruthy();
      const rows = await sql<{ id: string }[]>`
        SELECT v.id FROM volontaire v JOIN account a ON a.id = v.account_id
        WHERE a.email = 'renvoi@exemple.dz' AND v.organisation_id = ${orgId}
      `;
      const volontaireId = rows[0]?.id as string;

      const avant = await jetonEnFile('renvoi@exemple.dz');
      await renvoyerInvitation(session, volontaireId, { store: missionsStore });
      const apres = await jetonEnFile('renvoi@exemple.dz');
      expect(apres).not.toBe(avant);

      // L'email de l'invitation révoquée est ANNULÉ en file (0019) : le worker
      // ne doit jamais envoyer un lien au jeton mort. Seule la nouvelle ligne
      // reste pending.
      const statuts = await sql<{ statut: string; count: number }[]>`
        SELECT statut, count(*)::int AS count FROM email_outbox
        WHERE destinataire = 'renvoi@exemple.dz' AND type = 'invitation_volontaire'
        GROUP BY statut
      `;
      expect(statuts).toEqual(expect.arrayContaining([{ statut: 'cancelled', count: 1 }, { statut: 'pending', count: 1 }]));

      // L'ancien jeton est révoqué (invitation supprimée) : refus net.
      await expect(
        activerVolontaire(avant, 'motdepasse-2026', { store: iamStore }),
      ).rejects.toBeInstanceOf(InvitationInvalidError);
      // Le nouveau fonctionne.
      const activation = await activerVolontaire(apres, 'motdepasse-2026', { store: iamStore });
      expect(activation.email).toBe('renvoi@exemple.dz');

      // Compte activé : plus de renvoi.
      await expect(
        renvoyerInvitation(session, volontaireId, { store: missionsStore }),
      ).rejects.toBeInstanceOf(VolontaireDejaActifError);
    });

    it('liste admin : statut d’invitation dérivé de l’outbox (en file, envoyée, activé)', async () => {
      const session = sessionAdmin(orgId);
      const etat = await getVolontairesAdminState(session, { store: missionsStore });
      const parEmail = new Map(etat.volontaires.map((v) => [v.email, v]));

      // Importés plus haut : activation@ activé, kahina@ en file,
      // expiree@ a vu son expire_le passé en base → expirée.
      expect(parEmail.get('activation@exemple.dz')?.statutInvitation).toBe('active');
      expect(parEmail.get('kahina@exemple.dz')?.statutInvitation).toBe('en_file');
      expect(parEmail.get('expiree@exemple.dz')?.statutInvitation).toBe('expiree');

      // Envoi réel par le worker (store réel, transport stubbé) : kahina passe
      // « envoyée », et le texte de l'email porte le lien d'invitation.
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
      expect(invitationEnvoyee?.text).toContain('/invitation?jeton=');
      expect(invitationEnvoyee?.text).toContain('14 jours');

      const etatApres = await getVolontairesAdminState(session, { store: missionsStore });
      const apres = new Map(etatApres.volontaires.map((v) => [v.email, v]));
      expect(apres.get('kahina@exemple.dz')?.statutInvitation).toBe('envoyee');
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
    });

    it('connexion volontaire : mot de passe scrypt, session unique, erreurs génériques', async () => {
      const premiere = await connecterVolontaire('activation@exemple.dz', 'motdepasse-2026', {
        store: iamStore,
      });
      expect(await getSession(premiere.token, { store: iamStore })).not.toBeNull();

      const seconde = await connecterVolontaire('Activation@Exemple.DZ ', 'motdepasse-2026', {
        store: iamStore,
      });
      expect(await getSession(premiere.token, { store: iamStore })).toBeNull();
      expect(await getSession(seconde.token, { store: iamStore })).toMatchObject({
        role: 'volontaire',
      });

      await expect(
        connecterVolontaire('activation@exemple.dz', 'mauvais-mot-de-passe', { store: iamStore }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
      // Email sans compte : même refus générique (pas d'énumération).
      await expect(
        connecterVolontaire('inconnu@exemple.dz', 'motdepasse-2026', { store: iamStore }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('connexion par code refusée pour un volontaire : orientation, aucun code créé ni envoyé', async () => {
      const codesAvant = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM login_code WHERE email = 'kahina@exemple.dz'
      `;
      await expect(
        requestLoginCode('kahina@exemple.dz', {
          store: iamStore,
          sendCode: async () => {
            throw new Error('aucun email ne doit partir');
          },
        }),
      ).rejects.toBeInstanceOf(VolunteerCodeLoginRefusedError);
      const codesApres = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM login_code WHERE email = 'kahina@exemple.dz'
      `;
      expect(codesApres[0]?.count).toBe(codesAvant[0]?.count);
    });
  },
);
