import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_EMAIL_FROM, sendEmail } from '@/modules/iam/email';

// Mock nodemailer au niveau module : assert le mapping EXACT { from, to, subject, text }
// passé à sendMail (une permutation sujet/texte rend ces tests rouges).
const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn((_url: string) => undefined),
  sendMailMock: vi.fn(),
}));

vi.mock('nodemailer', () => {
  const mocked = {
    createTransport: (url: string) => {
      createTransportMock(url);
      return { sendMail: sendMailMock };
    },
  };
  return { ...mocked, default: mocked };
});

import {
  DEFAULT_APP_URL,
  DOSSIER_REFUSE_SUBJECT,
  DOSSIER_VALIDE_SUBJECT,
  INSCRIPTION_EXPIREE_SUBJECT,
  INSCRIPTION_RECUE_SUBJECT,
  INVITATION_VOLONTAIRE_SUBJECT,
  RAPPEL_J7_SUBJECT,
  buildNotificationEmail,
  normalizeNotificationPayload,
  readConnexionUrl,
  readEspaceCoureurUrl,
  readRunnersAppUrl,
  type NotificationPayload,
} from './email-contents';
import type { OutboxRow, OutboxStore } from './outbox-store';
import { clampOutboxLimit, processOutbox } from './worker';

const ASSISTANCE_PHONE = '+213 555 010 200';

const OPTIONS = {
  assistancePhone: ASSISTANCE_PHONE,
  espaceCoureurUrl: `${DEFAULT_APP_URL}/espace-coureur`,
  connexionUrl: `${DEFAULT_APP_URL}/connexion`,
  runnersAppUrl: 'https://runners.azzel.dz',
};

describe('buildNotificationEmail — contenus français sobres (tutoiement)', () => {
  it('inscription reçue : objet exact, prénom, épreuve, pièces restantes, lien espace coureur', () => {
    const email = buildNotificationEmail(
      'inscription_recue',
      { prenom: 'Yani', epreuve: 'La Grande Boucle — 35 km' },
      OPTIONS,
    );
    expect(email.subject).toBe(INSCRIPTION_RECUE_SUBJECT);
    expect(email.text).toContain('Salut Yani');
    expect(email.text).toContain('« La Grande Boucle — 35 km »');
    expect(email.text).toContain('décharge et le règlement');
    expect(email.text).toContain('preuve de paiement CCP');
    expect(email.text).toContain(OPTIONS.espaceCoureurUrl);
  });

  it('dossier validé : objet exact, prénom et épreuve, pas de motif', () => {
    const email = buildNotificationEmail(
      'dossier_valide',
      { prenom: 'Yani', epreuve: 'La Grande Boucle — 35 km' },
      OPTIONS,
    );
    expect(email.subject).toBe(DOSSIER_VALIDE_SUBJECT);
    expect(email.text).toContain('Salut Yani');
    expect(email.text).toContain('« La Grande Boucle — 35 km »');
    expect(email.text).toContain('validé');
    expect(email.text).not.toContain('Motif');
  });

  it('dossier refusé : objet exact, motif, « Appeler l’équipe » et numéro d’assistance', () => {
    const email = buildNotificationEmail(
      'dossier_refuse',
      { prenom: 'Yani', epreuve: 'La Grande Boucle — 35 km', motif: 'Reçu de paiement illisible' },
      OPTIONS,
    );
    expect(email.subject).toBe(DOSSIER_REFUSE_SUBJECT);
    expect(email.text).toContain('Salut Yani');
    expect(email.text).toContain('Motif : Reçu de paiement illisible');
    expect(email.text).toContain('Appeler l’équipe');
    expect(email.text).toContain(ASSISTANCE_PHONE);
    expect(email.text).toContain(OPTIONS.espaceCoureurUrl);
    // Cycle de vie (PO, 11/11/2026) : la reprise passe par « Modifier mon
    // inscription », plus par un simple redépôt de preuve.
    expect(email.text).toContain('« Modifier mon inscription »');
    expect(email.text).toContain('nouvelle preuve');
  });

  it('inscription expirée : place rendue, reprise par « Modifier mon inscription » depuis l’espace', () => {
    const email = buildNotificationEmail(
      'inscription_expiree',
      { coureurId: 'c1', prenom: 'Yani', edition: 'Édition 2027' },
      OPTIONS,
    );
    expect(email.subject).toBe(INSCRIPTION_EXPIREE_SUBJECT);
    expect(email.text).toContain('Salut Yani');
    expect(email.text).toContain('ta place a été rendue');
    expect(email.text).toContain('« Modifier mon inscription »');
    expect(email.text).toContain('liste d’attente');
    expect(email.text).toContain(OPTIONS.espaceCoureurUrl);
    expect(email.text).toContain(ASSISTANCE_PHONE);
  });

  it('readEspaceCoureurUrl : APP_URL lue, slash final retiré', () => {
    vi.stubEnv('APP_URL', 'https://azzel.dz/');
    try {
      expect(readEspaceCoureurUrl()).toBe('https://azzel.dz/espace-coureur');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('readEspaceCoureurUrl : APP_URL malformée ou schéma non http(s) → repli valeur par défaut', () => {
    for (const malformed of ['azzel.dz/', 'not a url', 'ftp://azzel.dz']) {
      vi.stubEnv('APP_URL', malformed);
      expect(readEspaceCoureurUrl(), malformed).toBe(
        `${DEFAULT_APP_URL}/espace-coureur`,
      );
    }
    vi.unstubAllEnvs();
  });

  it('dossier refusé avec motif blank : aucune ligne « Motif : » vide', () => {
    const email = buildNotificationEmail(
      'dossier_refuse',
      { prenom: 'Yani', epreuve: 'La Grande Boucle — 35 km', motif: '   ' },
      OPTIONS,
    );
    expect(email.subject).toBe(DOSSIER_REFUSE_SUBJECT);
    expect(email.text).not.toContain('Motif :');
    expect(email.text).toContain('Appeler l’équipe');
  });

  it('story 3.1 — invitation volontaire : objet exact, lien /connexion sans jeton, code, « la veille », assistance', () => {
    const email = buildNotificationEmail(
      'invitation_volontaire',
      { nom: 'Kahina' },
      { ...OPTIONS, connexionUrl: 'https://azzel.dz/connexion' },
    );
    expect(email.subject).toBe(INVITATION_VOLONTAIRE_SUBJECT);
    expect(email.text).toContain('Salut Kahina');
    expect(email.text).toContain('https://azzel.dz/connexion');
    expect(email.text).not.toContain('jeton');
    expect(email.text).not.toContain('/invitation');
    expect(email.text).not.toMatch(/choisis ton mot de passe|valable \d+ jours/);
    expect(email.text).toContain('connecte-toi');
    expect(email.text).toContain('un code');
    expect(email.text).toContain('la veille du jour J');
    expect(email.text).toContain('sur le téléphone que tu utiliseras le jour J');
    expect(email.text).toContain('Appelle l’équipe');
    expect(email.text).toContain(ASSISTANCE_PHONE);
  });

  it('story 3.1 — readConnexionUrl : APP_URL lue, repli défaut', () => {
    vi.stubEnv('APP_URL', 'https://azzel.dz/');
    try {
      expect(readConnexionUrl()).toBe('https://azzel.dz/connexion');
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv('APP_URL', 'pas-une-url');
    try {
      expect(readConnexionUrl()).toBe(`${DEFAULT_APP_URL}/connexion`);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // Story 6.4 — rappel batterie J-7 : date fr lisible, 3 conseils courts,
  // lien app en évidence, assistance, signature — JAMAIS la citation.
  it('story 6.4 — rappel J-7 : objet exact, date fr, 3 conseils, lien app, assistance, signature, pas de citation', () => {
    const email = buildNotificationEmail(
      'rappel_j7',
      { prenom: 'Yani', dateCourse: '2027-03-26' },
      OPTIONS,
    );
    expect(email.subject).toBe(RAPPEL_J7_SUBJECT);
    expect(email.text).toContain('Salut Yani');
    expect(email.text).toContain('26 mars 2027');
    expect(email.text).toContain('100 %');
    expect(email.text).toContain('Ne tue pas l’application Azzel');
    expect(email.text).toContain('powerbank');
    expect(email.text).toContain(OPTIONS.runnersAppUrl);
    expect(email.text).toContain(ASSISTANCE_PHONE);
    expect(email.text).toContain('L’équipe Azzel');
    // Never : la citation kabyle ne quitte jamais la rubrique batterie de l'app.
    expect(email.text).not.toContain('Un point après l’autre');
    expect(email.text).not.toContain('Sagesse kabyle');
  });

  it('story 6.4 — readRunnersAppUrl : RUNNERS_APP_URL prioritaire, repli APP_URL, slash final retiré', () => {
    vi.stubEnv('RUNNERS_APP_URL', 'https://runners.azzel.dz/');
    vi.stubEnv('APP_URL', 'https://azzel.dz/');
    try {
      expect(readRunnersAppUrl()).toBe('https://runners.azzel.dz');
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv('APP_URL', 'https://azzel.dz/');
    try {
      expect(readRunnersAppUrl()).toBe('https://azzel.dz');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('story 6.4 — readRunnersAppUrl : absentes/malformées/schéma non http(s) → repli valeur par défaut', () => {
    for (const malformed of ['runners.azzel.dz/', 'not a url', 'ftp://azzel.dz']) {
      vi.stubEnv('RUNNERS_APP_URL', malformed);
      expect(readRunnersAppUrl(), malformed).toBe(DEFAULT_APP_URL);
    }
    vi.unstubAllEnvs();
  });

  // Story 6.4 (revue) — date dégradée : invalide/vide/inexistante → phrase
  // de repli, jamais « Ta course est le  — » à motif vide.
  it('story 6.4 — date de course invalide ou vide : phrase de repli « Ta course arrive bientôt »', () => {
    for (const dateCourse of ['', '   ', 'pas-une-date', '2027-02-31']) {
      const email = buildNotificationEmail(
        'rappel_j7',
        { prenom: 'Yani', dateCourse },
        OPTIONS,
      );
      expect(email.subject, dateCourse).toBe(RAPPEL_J7_SUBJECT);
      expect(email.text, dateCourse).toContain('Ta course arrive bientôt');
      expect(email.text, dateCourse).not.toContain('est le  —');
      expect(email.text, dateCourse).not.toMatch(/est le \S* — c’est bientôt/);
    }
  });
});

describe('normalizeNotificationPayload — payload jsonb relu de base', () => {
  it('champs chaînes conservés, non-chaînes remplacés par vide', () => {
    const payload = normalizeNotificationPayload('inscription_recue', {
      prenom: 'Yani',
      epreuve: 42,
    });
    expect(payload).toEqual({ prenom: 'Yani', epreuve: '' });
  });

  it('story 3.1 — invitation_volontaire : nom seul extrait (un ancien jeton est ignoré), non-chaînes vidées', () => {
    expect(normalizeNotificationPayload('invitation_volontaire', { nom: ' Kahina ', jeton: 'j1' })).toEqual(
      { nom: 'Kahina' },
    );
    expect(normalizeNotificationPayload('invitation_volontaire', { nom: 42 })).toEqual({ nom: '' });
  });

  it('story 6.4 — rappel_j7 : prenom et dateCourse extraits, valeurs non-chaînes vidées', () => {
    expect(normalizeNotificationPayload('rappel_j7', { prenom: ' Yani ', dateCourse: '2027-03-26' })).toEqual(
      { prenom: 'Yani', dateCourse: '2027-03-26' },
    );
    expect(normalizeNotificationPayload('rappel_j7', { prenom: 42, dateCourse: null })).toEqual({
      prenom: '',
      dateCourse: '',
    });
    expect(normalizeNotificationPayload('rappel_j7', 'pas un objet')).toEqual({
      prenom: '',
      dateCourse: '',
    });
  });

  it('dossier_refuse exige le motif ; valeurs non objets tolérées', () => {
    expect(normalizeNotificationPayload('dossier_refuse', { motif: 'flou' })).toEqual({
      prenom: '',
      epreuve: '',
      motif: 'flou',
    });
    expect(normalizeNotificationPayload('dossier_valide', null)).toEqual({
      prenom: '',
      epreuve: '',
    });
    expect(normalizeNotificationPayload('inscription_recue', 'pas un objet')).toEqual({
      prenom: '',
      epreuve: '',
    });
  });
});

function outboxRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 'outbox-1',
    organisationId: 'org-1',
    destinataire: 'coureur@exemple.dz',
    type: 'inscription_recue',
    payload: { prenom: 'Yani', epreuve: 'La Grande Boucle — 35 km' },
    statut: 'pending',
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    sentAt: null,
    createdAt: new Date('2026-10-21T08:00:00.000Z'),
    ...overrides,
  };
}

function buildStore(
  rows: OutboxRow[],
  organisationIds: string[] = ['org-1'],
): OutboxStore & {
  listOrganisationIds: ReturnType<typeof vi.fn>;
  listOutstanding: ReturnType<typeof vi.fn>;
  claimOutboxRow: ReturnType<typeof vi.fn>;
  markOutboxSent: ReturnType<typeof vi.fn>;
  markOutboxFailed: ReturnType<typeof vi.fn>;
} {
  const store = {
    listOrganisationIds: vi.fn(async () => organisationIds),
    listOutstanding: vi.fn(
      async (organisationId: string, limit: number) =>
        rows
          .filter((row) => row.organisationId === organisationId)
          .slice(0, limit),
    ),
    claimOutboxRow: vi.fn(async () => true),
    markOutboxSent: vi.fn(async () => {}),
    markOutboxFailed: vi.fn(async () => {}),
  };
  return store as unknown as OutboxStore & {
    listOrganisationIds: ReturnType<typeof vi.fn>;
    listOutstanding: ReturnType<typeof vi.fn>;
    claimOutboxRow: ReturnType<typeof vi.fn>;
    markOutboxSent: ReturnType<typeof vi.fn>;
    markOutboxFailed: ReturnType<typeof vi.fn>;
  };
}

describe('processOutbox — worker avec transport et store stubbés', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pending envoyés dans l’ordre, marqués sent, résumé exact', async () => {
    const rows = [
      outboxRow({ id: 'outbox-1' }),
      outboxRow({
        id: 'outbox-2',
        type: 'dossier_refuse',
        payload: { prenom: 'Iness', epreuve: 'La Boucle Moyenne — 12 km', motif: 'reçu flou' },
        createdAt: new Date('2026-10-21T08:00:01.000Z'),
      }),
    ];
    const store = buildStore(rows);
    const sent: { to: string; subject: string; text: string }[] = [];
    const summary = await processOutbox(10, {
      store,
      send: async (to, subject, text) => {
        sent.push({ to, subject, text });
      },
    });

    expect(summary).toEqual({ processed: 2, sent: 2, failed: 0, storeError: null });
    expect(store.listOutstanding).toHaveBeenCalledWith('org-1', 10);
    expect(store.markOutboxSent).toHaveBeenCalledWith('org-1', 'outbox-1');
    expect(store.markOutboxSent).toHaveBeenCalledWith('org-1', 'outbox-2');
    expect(sent.map((entry) => entry.to)).toEqual(['coureur@exemple.dz', 'coureur@exemple.dz']);
    expect(sent[0]?.subject).toBe(INSCRIPTION_RECUE_SUBJECT);
    expect(sent[1]?.subject).toBe(DOSSIER_REFUSE_SUBJECT);
    expect(sent[1]?.text).toContain('Motif : reçu flou');
  });

  it('story 6.4 — ligne rappel_j7 : envoyée par le worker avec objet et contenu J-7', async () => {
    const row = outboxRow({
      id: 'outbox-j7',
      type: 'rappel_j7',
      payload: { prenom: 'Yani', dateCourse: '2027-03-26' },
    });
    const store = buildStore([row]);
    const sent: { to: string; subject: string; text: string }[] = [];
    const summary = await processOutbox(10, {
      store,
      send: async (to, subject, text) => {
        sent.push({ to, subject, text });
      },
    });
    expect(summary).toEqual({ processed: 1, sent: 1, failed: 0, storeError: null });
    expect(sent[0]?.subject).toBe(RAPPEL_J7_SUBJECT);
    expect(sent[0]?.text).toContain('26 mars 2027');
    expect(sent[0]?.text).toContain('100 %');
    expect(sent[0]?.text).toContain('powerbank');
  });

  it('revendication refusée (ligne déjà prise par un worker concurrent) : sautée sans envoi ni marquage', async () => {
    const store = buildStore([outboxRow()]);
    store.claimOutboxRow.mockResolvedValue(false);
    const summary = await processOutbox(10, {
      store,
      send: async () => {
        throw new Error('ne doit pas être appelé');
      },
    });
    expect(summary).toEqual({ processed: 1, sent: 0, failed: 0, storeError: null });
    expect(store.markOutboxSent).not.toHaveBeenCalled();
    expect(store.markOutboxFailed).not.toHaveBeenCalled();
  });

  it('envoi par défaut du worker : sendMail appelé avec exactement { from, to, subject, text, html }', async () => {
    vi.stubEnv('SMTP_URL', 'smtp://azzel:azzel@localhost:2525');
    vi.stubEnv('ASSISTANCE_PHONE', ASSISTANCE_PHONE);
    vi.stubEnv('APP_URL', 'https://azzel.dz');
    try {
      const row = outboxRow();
      const store = buildStore([row]);
      const summary = await processOutbox(10, { store });
      expect(summary).toEqual({ processed: 1, sent: 1, failed: 0, storeError: null });
      expect(store.claimOutboxRow).toHaveBeenCalledWith('org-1', 'outbox-1');
      const expected = buildNotificationEmail(
        'inscription_recue',
        normalizeNotificationPayload('inscription_recue', row.payload),
        {
          assistancePhone: ASSISTANCE_PHONE,
          espaceCoureurUrl: 'https://azzel.dz/espace-coureur',
          connexionUrl: 'https://azzel.dz/connexion',
          runnersAppUrl: 'https://azzel.dz',
        },
      );
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith({
        from: APP_EMAIL_FROM,
        to: row.destinataire,
        subject: expected.subject,
        text: expected.text,
        html: expected.html,
      });
    } finally {
      sendMailMock.mockClear();
      vi.unstubAllEnvs();
    }
  });

  it('worker : inscription expirée et rappel de preuve gardent l’édition et l’échéance du payload', async () => {
    vi.stubEnv('APP_URL', 'https://azzel.dz');
    try {
      const envoyes: { subject: string; text: string; html: string }[] = [];
      const store = buildStore([
        outboxRow({
          id: 'outbox-expiree',
          type: 'inscription_expiree',
          payload: { coureurId: 'c1', prenom: 'Yani', edition: 'Édition 2027', echeance: 'x' },
        }),
        outboxRow({
          id: 'outbox-rappel',
          type: 'rappel_preuve',
          payload: { coureurId: 'c1', prenom: 'Yani', limite: '2027-03-20T22:59:00.000Z' },
        }),
      ]);
      const summary = await processOutbox(10, {
        store,
        send: async (_to, subject, text, html) => {
          envoyes.push({ subject, text, html });
        },
      });
      expect(summary.sent).toBe(2);
      const expiree = envoyes.find((e) => e.subject === INSCRIPTION_EXPIREE_SUBJECT);
      expect(expiree?.text).toContain('ton inscription à Édition 2027 a expiré');
      expect(expiree?.html).toContain('ton inscription à Édition 2027 a expiré');
      const rappel = envoyes.find((e) => e.subject !== INSCRIPTION_EXPIREE_SUBJECT);
      // 22h59 UTC = 23h59 à Alger : l'échéance du payload est bien rendue.
      expect(rappel?.text).toContain('23:59');
      for (const envoye of envoyes) {
        expect(envoye.text).not.toContain('undefined');
        expect(envoye.html).not.toContain('undefined');
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('story 3.1 — worker : invitation volontaire envoyée avec le lien /connexion, jamais de jeton', async () => {
    vi.stubEnv('APP_URL', 'https://azzel.dz');
    try {
      const envoyes: { to: string; subject: string; text: string }[] = [];
      const store = buildStore([
        outboxRow({
          type: 'invitation_volontaire',
          destinataire: 'kahina@exemple.dz',
          // Payload hérité (avant 0035) : le jeton éventuel n'est jamais relu.
          payload: { nom: 'Kahina', jeton: 'ancien-jeton' },
        }),
      ]);
      const summary = await processOutbox(10, {
        store,
        send: async (to, subject, text) => {
          envoyes.push({ to, subject, text });
        },
      });
      expect(summary.sent).toBe(1);
      expect(envoyes[0]?.subject).toBe(INVITATION_VOLONTAIRE_SUBJECT);
      expect(envoyes[0]?.text).toContain('https://azzel.dz/connexion');
      expect(envoyes[0]?.text).not.toContain('ancien-jeton');
      expect(envoyes[0]?.text).not.toContain('jeton');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('SMTP en panne : lignes marquées failed avec last_error, aucune exception', async () => {
    const store = buildStore([outboxRow()]);
    const summary = await processOutbox(10, {
      store,
      send: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });

    expect(summary).toEqual({ processed: 1, sent: 0, failed: 1, storeError: null });
    expect(store.markOutboxSent).not.toHaveBeenCalled();
    expect(store.markOutboxFailed).toHaveBeenCalledWith('org-1', 'outbox-1', 'connect ECONNREFUSED');
  });

  it('store injoignable : résumé à zéro avec storeError, aucune exception', async () => {
    const store = buildStore([]);
    store.listOrganisationIds.mockRejectedValue(new Error('database unavailable'));
    const summary = await processOutbox(10, {
      store,
      send: async () => {
        throw new Error('ne doit pas être appelé');
      },
    });
    expect(summary).toEqual({ processed: 0, sent: 0, failed: 0, storeError: 'database unavailable' });
  });

  it('marquage sent en échec après envoi réussi : compté failed, marquage failed tenté', async () => {
    const store = buildStore([outboxRow()]);
    store.markOutboxSent.mockRejectedValue(new Error('update impossible'));
    const summary = await processOutbox(10, {
      store,
      send: async () => {},
    });
    expect(summary.sent).toBe(0);
    expect(summary.failed).toBe(1);
    expect(store.markOutboxFailed).toHaveBeenCalledWith('org-1', 'outbox-1', 'update impossible');
  });

  it('deux organisations : file fusionnée par created_at, envois dans l’ordre global, chaque ligne dans SON organisation', async () => {
    // B porte la ligne la plus ANCIENNE : l'ordre d'envoi doit être global
    // (b1 → b2 → a1 → a2), pas organisation par organisation.
    const rows = [
      outboxRow({ id: 'outbox-a1', createdAt: new Date('2026-10-21T08:00:05.000Z'), destinataire: 'a1@exemple.dz' }),
      outboxRow({
        id: 'outbox-b1',
        organisationId: 'org-b',
        destinataire: 'b1@exemple.dz',
        createdAt: new Date('2026-10-21T08:00:01.000Z'),
      }),
      outboxRow({
        id: 'outbox-b2',
        organisationId: 'org-b',
        destinataire: 'b2@exemple.dz',
        createdAt: new Date('2026-10-21T08:00:03.000Z'),
      }),
      outboxRow({ id: 'outbox-a2', createdAt: new Date('2026-10-21T08:00:07.000Z'), destinataire: 'a2@exemple.dz' }),
    ];
    const store = buildStore(rows, ['org-1', 'org-b']);
    const sent: { to: string }[] = [];
    const summary = await processOutbox(10, {
      store,
      send: async (to) => {
        sent.push({ to });
      },
    });

    expect(summary).toEqual({ processed: 4, sent: 4, failed: 0, storeError: null });
    expect(sent.map((entry) => entry.to)).toEqual([
      'b1@exemple.dz',
      'b2@exemple.dz',
      'a1@exemple.dz',
      'a2@exemple.dz',
    ]);
    expect(store.listOutstanding).toHaveBeenCalledWith('org-1', 10);
    expect(store.listOutstanding).toHaveBeenCalledWith('org-b', 10);
    expect(store.markOutboxSent).toHaveBeenCalledWith('org-b', 'outbox-b1');
    expect(store.markOutboxSent).toHaveBeenCalledWith('org-1', 'outbox-a1');
  });

  it('deux organisations, total combiné > limite : summary.processed borné à la limite (les plus anciennes)', async () => {
    const rows = [
      outboxRow({ id: 'outbox-a1', createdAt: new Date('2026-10-21T08:00:05.000Z'), destinataire: 'a1@exemple.dz' }),
      outboxRow({
        id: 'outbox-b1',
        organisationId: 'org-b',
        destinataire: 'b1@exemple.dz',
        createdAt: new Date('2026-10-21T08:00:01.000Z'),
      }),
      outboxRow({
        id: 'outbox-b2',
        organisationId: 'org-b',
        destinataire: 'b2@exemple.dz',
        createdAt: new Date('2026-10-21T08:00:03.000Z'),
      }),
    ];
    const store = buildStore(rows, ['org-1', 'org-b']);
    const sent: { to: string }[] = [];
    const summary = await processOutbox(2, {
      store,
      send: async (to) => {
        sent.push({ to });
      },
    });

    expect(summary.processed).toBe(2);
    expect(summary.sent).toBe(2);
    expect(sent.map((entry) => entry.to)).toEqual(['b1@exemple.dz', 'b2@exemple.dz']);
    expect(store.markOutboxSent).toHaveBeenCalledTimes(2);
  });

  it('une organisation malade n’arrête pas la boucle : storeError accumulé, lignes des autres traitées', async () => {
    const rows = [outboxRow({ id: 'outbox-a1' })];
    const store = buildStore(rows, ['org-1', 'org-b']);
    store.listOutstanding.mockImplementation(
      async (organisationId: string, limit: number) => {
        if (organisationId === 'org-b') {
          throw new Error('org b injoignable');
        }
        return rows
          .filter((row) => row.organisationId === organisationId)
          .slice(0, limit);
      },
    );
    const summary = await processOutbox(10, { store, send: async () => {} });

    expect(summary).toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
      storeError: 'org-b: org b injoignable',
    });
  });

  it('limite bornée : minimum 1, maximum 500', () => {
    expect(clampOutboxLimit(0)).toBe(1);
    expect(clampOutboxLimit(-3)).toBe(1);
    expect(clampOutboxLimit(2.9)).toBe(2);
    expect(clampOutboxLimit(1000)).toBe(500);
  });
});

describe('sendEmail — transport SMTP (nodemailer moqué)', () => {
  it('sendMail appelé avec exactement { from, to, subject, text } — permutation sujet/texte = rouge', async () => {
    vi.stubEnv('SMTP_URL', 'smtp://azzel:azzel@localhost:2525');
    try {
      await sendEmail({
        to: 'coureur@exemple.dz',
        subject: INSCRIPTION_RECUE_SUBJECT,
        text: 'corps du message',
      });
      expect(createTransportMock).toHaveBeenCalledWith('smtp://azzel:azzel@localhost:2525');
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledWith({
        from: APP_EMAIL_FROM,
        to: 'coureur@exemple.dz',
        subject: INSCRIPTION_RECUE_SUBJECT,
        text: 'corps du message',
      });
    } finally {
      sendMailMock.mockClear();
      createTransportMock.mockClear();
      vi.unstubAllEnvs();
    }
  });

  it('html fourni : envoi multipart, le texte reste joint en repli', async () => {
    vi.stubEnv('SMTP_URL', 'smtp://azzel:azzel@localhost:2525');
    try {
      await sendEmail({
        to: 'coureur@exemple.dz',
        subject: INSCRIPTION_RECUE_SUBJECT,
        text: 'corps du message',
        html: '<p>corps du message</p>',
      });
      expect(sendMailMock).toHaveBeenCalledWith({
        from: APP_EMAIL_FROM,
        to: 'coureur@exemple.dz',
        subject: INSCRIPTION_RECUE_SUBJECT,
        text: 'corps du message',
        html: '<p>corps du message</p>',
      });
    } finally {
      sendMailMock.mockClear();
      createTransportMock.mockClear();
      vi.unstubAllEnvs();
    }
  });

  it('sans SMTP_URL : console log puis résout (la ligne sera marquée sent côté worker)', async () => {
    vi.stubEnv('SMTP_URL', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      await expect(
        sendEmail({
          to: 'coureur@exemple.dz',
          subject: INSCRIPTION_RECUE_SUBJECT,
          text: 'corps',
        }),
      ).resolves.toBeUndefined();
      expect(info).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('sans SMTP_URL en production : EmailSendError (ligne failed rejeuable), pas de repli console', async () => {
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      await expect(
        sendEmail({
          to: 'coureur@exemple.dz',
          subject: INSCRIPTION_RECUE_SUBJECT,
          text: 'corps',
        }),
      ).rejects.toMatchObject({ name: 'EmailSendError' });
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe('payload typé — cohérence des types de notification', () => {
  it('les trois types partagent prenom/epreuve, seul le refus porte le motif', () => {
    const inscription: NotificationPayload = { prenom: 'A', epreuve: 'B' };
    const valide: NotificationPayload = { prenom: 'A', epreuve: 'B' };
    const refuse: NotificationPayload = { prenom: 'A', epreuve: 'B', motif: 'C' };
    expect(buildNotificationEmail('inscription_recue', inscription, OPTIONS).subject).toBe(
      INSCRIPTION_RECUE_SUBJECT,
    );
    expect(buildNotificationEmail('dossier_valide', valide, OPTIONS).subject).toBe(
      DOSSIER_VALIDE_SUBJECT,
    );
    expect(buildNotificationEmail('dossier_refuse', refuse, OPTIONS).subject).toBe(
      DOSSIER_REFUSE_SUBJECT,
    );
  });
});
