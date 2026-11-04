import { renderToReadableStream } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Story 9.4 — rendu serveur de /preuve refondue : fil d'étapes (étape 3
// courante, étapes 1-2 marquées depuis l'état connu, honnêteté portée par
// documentsAcceptes), formats acceptés et cible 300 Ko en toutes lettres,
// bandeau de refus avec motif et bouton d'assistance. Le dépôt lui-même
// (compression client, brouillon, réessai) est du JavaScript de navigation :
// non exécuté en rendu serveur — couvert par construction, voir
// preuve.test.ts pour le service.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const proofServiceMock = vi.hoisted(() => ({
  getPreuveState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/proof-service',
  () => proofServiceMock as unknown as typeof import('@/modules/inscriptions/proof-service'),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined, refresh: () => undefined }),
  redirect: () => undefined,
}));

import PreuvePage from './page';

const SESSION_COUREUR = {
  accountId: 'account-coureur',
  organisationId: 'org-1',
  email: 'yani@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const EDITION = {
  id: 'edition-1',
  slug: '2027',
  nom: 'Édition 2027',
  dateCourse: '2027-03-26',
  registrationClosesAt: '2027-03-16T22:59:59.000Z',
  registrationOpen: true,
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<PreuvePage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  proofServiceMock.getPreuveState.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_COUREUR,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/preuve — dépôt refondu (story 9.4)', () => {
  it('fil d’étapes : étape 3 courante, documents acceptés → deux « Fait » avec liens de retour', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 200');
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: true,
    });
    const html = await rendu();
    expect(html).toContain('Étape 3 sur 4 — en cours');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('href="/inscription"');
    expect(html).toContain('href="/acceptations"');
    expect((html.match(/>Fait</g) ?? []).length).toBe(2);
    // Validation (organisation) : ni mention d'état ni lien.
    expect(html).not.toContain('À venir');
  });

  it('documents manquants : étape Documents « À faire », exacte, toujours retournable', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 200');
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    });
    const html = await rendu();
    expect(html).toContain('À faire');
    expect(html).toContain('href="/acceptations"');
  });

  it('gabarit du socle : étiquette associée, obligatoire en texte, formats et 300 Ko en toutes lettres', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 200');
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    });
    const html = await rendu();
    expect(html).toContain('for="preuve-fichier"');
    expect(html).toContain('(obligatoire)');
    // React insère un commentaire entre segments interpolés.
    expect(html).toMatch(
      /Formats acceptés : (<!-- -->)?JPEG, PNG, WebP ou PDF(<!-- -->)?\. Aucun autre format n’est accepté\./,
    );
    // Le plafond est annoncé UNE FOIS, dans l’intro (revue 9, M3) : l’aide du
    // champ ne le répète plus (formats seuls).
    expect(html).toContain('300 Ko');
    const aide = html.slice(html.indexOf('preuve-aide-formats'), html.indexOf('</p>', html.indexOf('preuve-aide-formats')));
    expect(aide).not.toContain('300 Ko');
    expect(html).toContain('aria-describedby="preuve-aide-formats"');
  });

  it('preuve refusée : motif en toutes lettres + bouton « Appeler l’équipe »', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 200');
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'refusé',
      refusalReason: 'Reçu de paiement illisible',
      preuve: null,
      documentsAcceptes: true,
    });
    const html = await rendu();
    expect(html).toContain('Ta preuve a été refusée.');
    expect(html).toMatch(/Motif : (<!-- -->)?Reçu de paiement illisible/);
    expect(html).toContain('Appeler l’équipe');
    expect(html).toContain('href="tel:+213555010200"');
  });

  it('pas encore inscrit : « Inscris-toi d’abord », sans fil ni champ fichier', async () => {
    vi.stubEnv('ASSISTANCE_PHONE', '+213 555 010 200');
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: null,
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    });
    const html = await rendu();
    expect(html).toContain('Inscris-toi d’abord');
    expect(html).not.toContain('Étapes du dossier');
    expect(html).not.toContain('type="file"');
  });
});
