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

const serviceMock = vi.hoisted(() => ({
  getMontantDu: vi.fn(),
  getComptesPaiement: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () => serviceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

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
  serviceMock.getMontantDu.mockReset().mockResolvedValue(null);
  serviceMock.getComptesPaiement.mockReset().mockResolvedValue(null);
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
      documentsAcceptes: true,
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

  it('dossier refusé : aucun dépôt direct, seule action « Modifier mon inscription »', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'refusé',
      refusalReason: 'Reçu de paiement illisible',
      preuve: null,
      documentsAcceptes: true,
    });
    const html = await rendu();
    expect(html).toContain('Dossier refusé');
    expect(html).not.toContain('Dossier déjà validé');
    expect(html).toContain('href="/inscription"');
    expect(html).toContain('Modifier mon inscription');
    expect(html).not.toContain('type="file"');
  });

  it('inscription expirée : « Inscription expirée », reprise par « Modifier mon inscription »', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'expirée',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    });
    const html = await rendu();
    expect(html).toContain('Inscription expirée');
    expect(html).not.toContain('Dossier déjà validé');
    expect(html).toContain('href="/inscription"');
    expect(html).not.toContain('type="file"');
  });

  it('en validation : dépôt ouvert (remplacement), encart « en cours de validation »', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en validation',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: true,
    });
    const html = await rendu();
    expect(html).toContain('en cours de validation');
    expect(html).toContain('type="file"');
  });

  it('acceptations manquantes : renvoi vers /acceptations au lieu du formulaire', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    });
    const html = await rendu();
    expect(html).toContain('Accepte d’abord la décharge et le règlement');
    expect(html).toContain('href="/acceptations"');
    expect(html).not.toContain('type="file"');
  });

  it('liste d’attente : titre dédié, jamais « Dossier déjà validé », aucun dépôt', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'liste d’attente',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: false,
    });
    const html = await rendu();
    expect(html).toContain('Inscription en liste d’attente');
    expect(html).not.toContain('Dossier déjà validé');
    expect(html).not.toContain('type="file"');
  });

  it('validé : « Dossier déjà validé » réservé à ce statut', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'validé',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: true,
    });
    const html = await rendu();
    expect(html).toContain('Dossier déjà validé');
    expect(html).not.toContain('type="file"');
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

  it('rappelle les comptes CCP et Baridimob de l’édition, rien sinon', async () => {
    proofServiceMock.getPreuveState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      refusalReason: null,
      preuve: null,
      documentsAcceptes: true,
    });
    expect(await rendu()).not.toContain('Rappel des comptes de l’événement');

    serviceMock.getComptesPaiement.mockResolvedValue({
      ccp: '0000000/00',
      titulaireCcp: 'TITULAIRE CCP TEST',
      baridimob: '00799999000000000000',
      titulaireBaridimob: 'TITULAIRE BARIDI TEST',
    });
    const html = await rendu();
    expect(html).toContain('Rappel des comptes de l’événement');
    expect(html).toContain('0000000/00');
    expect(html).toContain('00799999000000000000');
    expect(html).toContain('Un versement par personne');
    expect(html).toContain('Ce numéro est unique');
    expect(html).toContain('TITULAIRE CCP TEST');
    expect(html).toContain('TITULAIRE BARIDI TEST');
  });
});
