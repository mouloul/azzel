import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signaler = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observabilite', () => ({ signalerErreurInattendue: signaler }));

import { GET as getEcheances } from './route';

import { AppRoleMisconfiguredError, DbUnavailableError } from '@/modules/iam/errors';
import type { OutboxRow } from '@/modules/notifications/outbox-store';

// GET /api/cron/echeances — balayage des échéances déclenché par le cron
// Vercel (quotidien) et le workflow GitHub Actions (horaire), recette seule.
// Matrice de la spec : appel autorisé, rejoué aussitôt (idempotent), mauvais
// secret, secret non configuré, base injoignable. La vraie logique de
// balayage tourne ; seuls les stores et le transport SMTP sont doublés.

/** 64 caractères, comme `openssl rand -hex 32`. */
const SECRET = '0123456789abcdef'.repeat(4);
const URL_CRON = 'http://localhost:3000/api/cron/echeances';

interface Dossier {
  id: string;
  prenom: string;
  /** L'avis d'expiration existe déjà : l'index unique partiel absorbe le doublon. */
  avisDejaEnfile?: boolean;
}

/** Base factice : des dossiers à rappeler et à expirer, consommés au premier passage. */
const base = vi.hoisted(() => ({
  aRappeler: [] as Dossier[],
  echus: [] as Dossier[],
  file: [] as OutboxRow[],
  organisations: ['org-1'],
}));

const stores = vi.hoisted(() => ({
  inscriptions: {
    enfilerRappelsPreuve: vi.fn(),
    expirerInscriptionsEchues: vi.fn(),
  },
  outbox: {
    listOrganisationIds: vi.fn(),
    listOutstanding: vi.fn(),
    claimOutboxRow: vi.fn(),
    markOutboxSent: vi.fn(),
    markOutboxFailed: vi.fn(),
    countDeadLetters: vi.fn(),
    insertRappelJ7: vi.fn(),
  },
  getInscriptionsStore: vi.fn(),
  getOutboxStore: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/modules/inscriptions/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/inscriptions/store')>()),
  getInscriptionsStore: stores.getInscriptionsStore,
}));

vi.mock('@/modules/notifications/outbox-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/notifications/outbox-store')>()),
  getOutboxStore: stores.getOutboxStore,
}));

vi.mock('@/modules/iam/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/iam/email')>()),
  sendEmail: stores.sendEmail,
}));

function rangee(
  id: string,
  type: 'rappel_preuve' | 'inscription_expiree',
  prenom: string,
): OutboxRow {
  const echeance = '2027-02-10T05:00:00.000Z';
  return {
    id: `outbox-${id}`,
    organisationId: 'org-1',
    destinataire: `${id}@exemple.dz`,
    type,
    payload:
      type === 'rappel_preuve'
        ? { coureurId: id, prenom, limite: echeance, echeance }
        : { coureurId: id, prenom, edition: 'Trail Azzel 2027', echeance },
    statut: 'pending',
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    sentAt: null,
    createdAt: new Date('2027-02-10T05:30:00.000Z'),
  };
}

function cablerBase(): void {
  stores.inscriptions.enfilerRappelsPreuve.mockImplementation(async () => {
    const lignes = base.aRappeler.splice(0);
    base.file.push(...lignes.map((l) => rangee(l.id, 'rappel_preuve', l.prenom)));
    return lignes.length;
  });
  stores.inscriptions.expirerInscriptionsEchues.mockImplementation(async () => {
    const lignes = base.echus.splice(0);
    const avis = lignes.filter((l) => !l.avisDejaEnfile);
    base.file.push(...avis.map((l) => rangee(l.id, 'inscription_expiree', l.prenom)));
    return { expirees: lignes.length, emailsEnfiles: avis.length };
  });
  stores.outbox.listOrganisationIds.mockImplementation(async () => base.organisations);
  stores.outbox.listOutstanding.mockImplementation(async (org: string, limite: number) =>
    base.file.filter((r) => r.organisationId === org && r.statut === 'pending').slice(0, limite),
  );
  stores.outbox.claimOutboxRow.mockImplementation(async (_org: string, id: string) => {
    const r = base.file.find((x) => x.id === id);
    if (!r || r.statut !== 'pending') {
      return false;
    }
    r.statut = 'sending';
    return true;
  });
  stores.outbox.markOutboxSent.mockImplementation(async (_org: string, id: string) => {
    const r = base.file.find((x) => x.id === id);
    if (r) {
      r.statut = 'sent';
    }
  });
  // Ligne en échec : en backoff, donc hors des candidats du passage suivant.
  stores.outbox.markOutboxFailed.mockImplementation(async (_org: string, id: string) => {
    const r = base.file.find((x) => x.id === id);
    if (r) {
      r.statut = 'failed';
    }
  });
  stores.outbox.countDeadLetters.mockResolvedValue(0);
  stores.getInscriptionsStore.mockReturnValue(stores.inscriptions);
  stores.getOutboxStore.mockReturnValue(stores.outbox);
  stores.sendEmail.mockResolvedValue(undefined);
}

function appel(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set('authorization', authorization);
  }
  return new NextRequest(URL_CRON, { headers });
}

interface Corps {
  ok?: boolean;
  bilan?: Record<string, number>;
  version?: number;
  error?: { code: string; message: string; action: string };
}

const journaux: unknown[][] = [];

function journalise(...args: unknown[]): void {
  journaux.push(args);
}

beforeEach(() => {
  vi.clearAllMocks();
  // 1 rappel ; 4 dossiers échus dont 2 déjà avisés (2 avis enfilés) ;
  // 2 emails déjà en attente dans la file. Toutes les valeurs du bilan
  // diffèrent : une inversion de champs ne passerait pas.
  base.aRappeler = [{ id: 'c-rappel', prenom: 'Amel' }];
  base.echus = [
    { id: 'c-echu-1', prenom: 'Yanis' },
    { id: 'c-echu-2', prenom: 'Lina' },
    { id: 'c-echu-3', prenom: 'Sami', avisDejaEnfile: true },
    { id: 'c-echu-4', prenom: 'Nora', avisDejaEnfile: true },
  ];
  base.file = [rangee('c-attente-1', 'rappel_preuve', 'Rym'), rangee('c-attente-2', 'rappel_preuve', 'Idir')];
  base.organisations = ['org-1'];
  cablerBase();
  vi.stubEnv('CRON_SECRET', SECRET);
  // Les stores sont doublés : l'URL ne sert qu'à dire « base configurée ».
  vi.stubEnv('DATABASE_URL', 'postgres://azzel_app:x@127.0.0.1:1/azzel');
  journaux.length = 0;
  vi.spyOn(console, 'info').mockImplementation(journalise);
  vi.spyOn(console, 'warn').mockImplementation(journalise);
  vi.spyOn(console, 'error').mockImplementation(journalise);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function rienNEstFait(): void {
  expect(stores.getInscriptionsStore).not.toHaveBeenCalled();
  expect(stores.getOutboxStore).not.toHaveBeenCalled();
  expect(stores.inscriptions.enfilerRappelsPreuve).not.toHaveBeenCalled();
  expect(stores.inscriptions.expirerInscriptionsEchues).not.toHaveBeenCalled();
  expect(stores.sendEmail).not.toHaveBeenCalled();
}

function aucuneTraceDuSecret(corps: unknown): void {
  expect(JSON.stringify(corps)).not.toContain(SECRET);
  expect(JSON.stringify(journaux.map((args) => args.map(String)))).not.toContain(SECRET);
}

describe('GET /api/cron/echeances — appel autorisé', () => {
  it('200 : bilan complet, dossiers expirés, emails partis (file déjà en attente comprise)', async () => {
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const corps = (await response.json()) as Corps;
    expect(corps).toEqual({
      ok: true,
      bilan: { rappels: 1, expirees: 4, emailsEnfiles: 3, emailsEnvoyes: 5, emailsEnEchec: 0 },
    });
    expect(stores.sendEmail.mock.calls.map(([input]) => (input as { to: string }).to)).toEqual([
      'c-attente-1@exemple.dz',
      'c-attente-2@exemple.dz',
      'c-rappel@exemple.dz',
      'c-echu-1@exemple.dz',
      'c-echu-2@exemple.dz',
    ]);
    expect(base.file.every((r) => r.statut === 'sent')).toBe(true);
    aucuneTraceDuSecret(corps);
  });

  it('rappels AVANT expirations, à la même date de référence', async () => {
    await getEcheances(appel(`Bearer ${SECRET}`));
    const [rappel] = stores.inscriptions.enfilerRappelsPreuve.mock.invocationCallOrder;
    const [expiration] = stores.inscriptions.expirerInscriptionsEchues.mock.invocationCallOrder;
    expect(rappel).toBeLessThan(expiration ?? 0);
    const [dateRappel] = stores.inscriptions.enfilerRappelsPreuve.mock.calls[0] as [Date];
    const [dateExpiration] = stores.inscriptions.expirerInscriptionsEchues.mock.calls[0] as [Date];
    expect(dateRappel).toBe(dateExpiration);
  });

  it('rejoué aussitôt : 200, bilan à zéro (idempotent), aucun email de plus', async () => {
    await getEcheances(appel(`Bearer ${SECRET}`));
    stores.sendEmail.mockClear();
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const corps = (await response.json()) as Corps;
    expect(corps).toEqual({
      ok: true,
      bilan: { rappels: 0, expirees: 0, emailsEnfiles: 0, emailsEnvoyes: 0, emailsEnEchec: 0 },
    });
    expect(stores.sendEmail).not.toHaveBeenCalled();
  });

  it('file plafonnée à 30 par appel : le reste part au passage suivant', async () => {
    base.aRappeler = [];
    base.file = [];
    base.echus = Array.from({ length: 40 }, (_, i) => ({ id: `c-vague-${i}`, prenom: 'Coureur' }));
    const premier = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(premier.status).toBe(200);
    expect(stores.outbox.listOutstanding).toHaveBeenCalledWith('org-1', 30);
    expect(((await premier.json()) as Corps).bilan).toEqual({
      rappels: 0,
      expirees: 40,
      emailsEnfiles: 40,
      emailsEnvoyes: 30,
      emailsEnEchec: 0,
    });
    const second = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(((await second.json()) as Corps).bilan).toEqual({
      rappels: 0,
      expirees: 0,
      emailsEnfiles: 0,
      emailsEnvoyes: 10,
      emailsEnEchec: 0,
    });
    expect(base.file.every((r) => r.statut === 'sent')).toBe(true);
  });
});

describe('GET /api/cron/echeances — emails en échec : 502, le workflow passe au rouge', () => {
  it('SMTP en échec sur un email → 502 cron.emails_failed, bilan joint, ligne laissée en file', async () => {
    stores.sendEmail.mockRejectedValueOnce(new Error('SMTP 421'));
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const corps = (await response.json()) as Corps;
    expect(corps.error?.code).toBe('cron.emails_failed');
    expect(corps.bilan).toEqual({
      rappels: 1,
      expirees: 4,
      emailsEnfiles: 3,
      emailsEnvoyes: 4,
      emailsEnEchec: 1,
    });
    expect(JSON.stringify(corps)).not.toContain('SMTP 421');
    expect(stores.outbox.markOutboxFailed).toHaveBeenCalledTimes(1);
    aucuneTraceDuSecret(corps);
  });
});

describe('GET /api/cron/echeances — mauvais secret : 401, rien n’est fait', () => {
  it.each([
    ['en-tête absent', undefined],
    ['secret faux', 'Bearer pas-le-bon-secret'],
    ['secret tronqué', `Bearer ${SECRET.slice(0, -1)}`],
    ['secret prolongé', `Bearer ${SECRET}x`],
    ['secret sans schéma Bearer', SECRET],
    ['Bearer vide', 'Bearer '],
    ['Bearer collé au secret', `Bearer${SECRET}`],
    ['autre schéma', `Basic ${SECRET}`],
  ])('%s → 401', async (_cas, authorization) => {
    const response = await getEcheances(appel(authorization));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    const corps = (await response.json()) as Corps;
    expect(corps.version).toBe(1);
    expect(corps.error?.code).toBe('cron.unauthorized');
    rienNEstFait();
    aucuneTraceDuSecret(corps);
  });
});

describe('GET /api/cron/echeances — tolérance de saisie du secret', () => {
  it.each([
    ['schéma en minuscules', `bearer ${SECRET}`],
    ['schéma en capitales', `BEARER ${SECRET}`],
    ['blancs autour du jeton', `Bearer    ${SECRET}   `],
  ])('%s → 200', async (_cas, authorization) => {
    const response = await getEcheances(appel(authorization));
    expect(response.status).toBe(200);
  });

  it('secret serveur collé avec blancs et retour à la ligne → 200', async () => {
    vi.stubEnv('CRON_SECRET', `  ${SECRET}\n`);
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
  });
});

describe('GET /api/cron/echeances — secret non configuré : 503, jamais d’accès ouvert', () => {
  it.each([
    ['vide', ''],
    ['blanc', '   '],
    ['trop court (31 caractères)', SECRET.slice(0, 31)],
    ['court une fois rogné', `  ${SECRET.slice(0, 31)}  `],
  ])('CRON_SECRET %s → 503, même avec un en-tête « Bearer » assorti', async (_cas, valeur) => {
    vi.stubEnv('CRON_SECRET', valeur);
    for (const authorization of [undefined, 'Bearer ', `Bearer ${valeur}`, `Bearer ${valeur.trim()}`]) {
      const response = await getEcheances(appel(authorization));
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const corps = (await response.json()) as Corps;
      expect(corps.error?.code).toBe('cron.not_configured');
      expect(corps.error?.action).toMatch(/CRON_SECRET/);
    }
    rienNEstFait();
  });

  it('32 caractères : le minimum est accepté', async () => {
    vi.stubEnv('CRON_SECRET', SECRET.slice(0, 32));
    const response = await getEcheances(appel(`Bearer ${SECRET.slice(0, 32)}`));
    expect(response.status).toBe(200);
  });
});

describe('GET /api/cron/echeances — base : configuration et disponibilité', () => {
  it('DATABASE_URL absente → 503 cron.db_not_configured (pas « réessayez »), rien n’est fait', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    const corps = (await response.json()) as Corps;
    expect(corps.error?.code).toBe('cron.db_not_configured');
    expect(corps.error?.action).toMatch(/DATABASE_URL/);
    expect(corps.error?.action).not.toMatch(/Réessayez/);
    rienNEstFait();
  });

  it('DATABASE_URL absente mais appel non autorisé → 401 (la configuration ne fuit pas)', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const response = await getEcheances(appel('Bearer faux'));
    expect(response.status).toBe(401);
  });

  const erreurBrute = (code: string, message: string) =>
    Object.assign(new Error(message), { code });

  it.each([
    ['DbUnavailableError (store)', () => new DbUnavailableError(new Error('ECONNREFUSED'))],
    ['ECONNREFUSED brute (garde de rôle)', () => erreurBrute('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:5432')],
    ['CONNECT_TIMEOUT (client postgres)', () => erreurBrute('CONNECT_TIMEOUT', 'write CONNECT_TIMEOUT db:5432')],
    ['CONNECTION_CLOSED (client postgres)', () => erreurBrute('CONNECTION_CLOSED', 'write CONNECTION_CLOSED db:5432')],
    ['CONNECTION_ENDED (client postgres)', () => erreurBrute('CONNECTION_ENDED', 'write CONNECTION_ENDED db:5432')],
    [
      'CONNECTION_DESTROYED (client postgres)',
      () => erreurBrute('CONNECTION_DESTROYED', 'write CONNECTION_DESTROYED db:5432'),
    ],
  ])('%s → 503 cron.db_unavailable', async (_cas, fabrique) => {
    stores.inscriptions.enfilerRappelsPreuve.mockRejectedValueOnce(fabrique());
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const corps = (await response.json()) as Corps;
    expect(corps.version).toBe(1);
    expect(corps.error?.code).toBe('cron.db_unavailable');
    expect(JSON.stringify(corps)).not.toMatch(/ECONN|CONNECT|5432/);
    expect(stores.inscriptions.expirerInscriptionsEchues).not.toHaveBeenCalled();
    expect(stores.sendEmail).not.toHaveBeenCalled();
    aucuneTraceDuSecret(corps);
  });

  it('rôle applicatif mal configuré → 503 cron.db_misconfigured', async () => {
    stores.inscriptions.enfilerRappelsPreuve.mockRejectedValueOnce(
      new AppRoleMisconfiguredError('postgres'),
    );
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    const corps = (await response.json()) as Corps;
    expect(corps.error?.code).toBe('cron.db_misconfigured');
  });

  it('file d’envoi injoignable → 503 cron.outbox_unavailable « aucun email », bilan joint', async () => {
    stores.outbox.listOrganisationIds.mockRejectedValueOnce(new Error('connexion perdue'));
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    const corps = (await response.json()) as Corps;
    expect(corps.error?.code).toBe('cron.outbox_unavailable');
    expect(corps.error?.message).toMatch(/aucun email/);
    expect(corps.bilan).toEqual({
      rappels: 1,
      expirees: 4,
      emailsEnfiles: 3,
      emailsEnvoyes: 0,
      emailsEnEchec: 0,
    });
    expect(JSON.stringify(corps)).not.toContain('connexion perdue');
    aucuneTraceDuSecret(corps);
  });

  it('file d’envoi partiellement injoignable → 503 « partiellement », emails partis comptés', async () => {
    base.organisations = ['org-1', 'org-2'];
    stores.outbox.listOutstanding.mockImplementation(async (org: string, limite: number) => {
      if (org === 'org-2') {
        throw new Error('connexion perdue');
      }
      return base.file.filter((r) => r.statut === 'pending').slice(0, limite);
    });
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    const corps = (await response.json()) as Corps;
    expect(corps.error?.code).toBe('cron.outbox_unavailable');
    expect(corps.error?.message).toMatch(/partiellement/);
    expect(corps.bilan).toEqual({
      rappels: 1,
      expirees: 4,
      emailsEnfiles: 3,
      emailsEnvoyes: 5,
      emailsEnEchec: 0,
    });
  });

  it('erreur inattendue → 500 cron.internal_error, sans détail technique', async () => {
    stores.inscriptions.expirerInscriptionsEchues.mockRejectedValueOnce(new Error('stack interne'));
    const response = await getEcheances(appel(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    const corps = (await response.json()) as Corps;
    expect(corps.error?.code).toBe('cron.internal_error');
    expect(signaler).toHaveBeenCalledWith('cron', expect.any(Error));
    expect(JSON.stringify(corps)).not.toContain('stack interne');
    aucuneTraceDuSecret(corps);
  });
});
