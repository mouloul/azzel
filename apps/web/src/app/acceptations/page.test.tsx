import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 9.4 — rendu serveur de /acceptations refondue : fil d'étapes (étape
// 2 courante, retour possible vers l'inscription), légende portant
// « obligatoire » en texte, horodatage des versions déjà acceptées.
// Isolée par mocks (calque espace-coureur/page.test.tsx).

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getAcceptancesState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined, refresh: () => undefined }),
  redirect: () => undefined,
}));

import AcceptancesPage from './page';

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

const DOCUMENTS = [
  {
    slug: 'decharge',
    titre: 'Décharge de bonne santé',
    version: 'v1',
    content: '[TEXTE PROVISOIRE — à remplacer par l’organisateur.]',
  },
  {
    slug: 'reglement',
    titre: 'Règlement intérieur',
    version: 'v1',
    content: '[TEXTE PROVISOIRE — à remplacer par l’organisateur.]',
  },
];

const ACCEPTANCES_VIERGES = { decharge: null, reglement: null };

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<AcceptancesPage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  inscriptionsServiceMock.getAcceptancesState.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_COUREUR,
  });
});

describe('/acceptations — formulaire refondu (story 9.4)', () => {
  it('fil d’étapes : étape 2 courante, Inscription « Fait » avec lien de retour, rien vers l’avant', async () => {
    inscriptionsServiceMock.getAcceptancesState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      documents: DOCUMENTS,
      acceptances: ACCEPTANCES_VIERGES,
    });
    const html = await rendu();
    expect(html).toContain('Étape 2 sur 4 — en cours');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('href="/inscription"');
    expect(html).toContain('Fait');
    expect(html).not.toContain('href="/preuve"');
    expect(html).not.toContain('À venir');
  });

  it('légende et libellés : les deux cases obligatoires annoncées en texte', async () => {
    inscriptionsServiceMock.getAcceptancesState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      documents: DOCUMENTS,
      acceptances: ACCEPTANCES_VIERGES,
    });
    const html = await rendu();
    expect(html).toContain('Acceptations — les deux cases sont obligatoires');
    // Le titre vient de la base : le citer entre guillemets reste correct quel
    // que soit son libellé, là où « j’accepte décharge de bonne santé »
    // manquait son article.
    expect(html).toContain('J’ai lu et j’accepte « Décharge de bonne santé »');
    expect(html).toContain('J’ai lu et j’accepte « Règlement intérieur »');
  });

  it('horodatage des versions : déjà acceptées → date + versions décharge/règlement affichées', async () => {
    inscriptionsServiceMock.getAcceptancesState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: 'en constitution',
      documents: DOCUMENTS,
      acceptances: {
        decharge: { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' },
        reglement: { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v2' },
      },
    });
    const html = (await rendu()).replaceAll('<!-- -->', '');
    expect(html).toContain('Déjà acceptés le');
    // Le rappel porte les versions ACCEPTÉES (v2 côté règlement ci-dessous),
    // les documents publiés affichent eux leur version courante.
    expect(html).toContain('décharge v1 · règlement v2');
    expect((html.match(/Version v1/g) ?? []).length).toBe(2);
  });

  it('pas encore inscrit : « Inscris-toi d’abord », sans fil ni cases', async () => {
    inscriptionsServiceMock.getAcceptancesState.mockResolvedValue({
      edition: EDITION,
      coureurStatus: null,
      documents: DOCUMENTS,
      acceptances: ACCEPTANCES_VIERGES,
    });
    const html = await rendu();
    expect(html).toContain('Inscris-toi d’abord');
    expect(html).not.toContain('Étapes du dossier');
    expect(html).not.toContain('type="checkbox"');
  });

  it('inscriptions fermées : écran dédié avec la date de clôture', async () => {
    inscriptionsServiceMock.getAcceptancesState.mockResolvedValue({
      edition: { ...EDITION, registrationOpen: false },
      coureurStatus: 'en constitution',
      documents: DOCUMENTS,
      acceptances: ACCEPTANCES_VIERGES,
    });
    const html = await rendu();
    expect(html).toContain('Les inscriptions sont fermées');
    expect(html).not.toContain('type="checkbox"');
  });
});
