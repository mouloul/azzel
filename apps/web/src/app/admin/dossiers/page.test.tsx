import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 7.4 — SSR minimal de /admin/dossiers : la page porte la passerelle
// vers /admin/rapports (processus J-10 — la commande part des validés que
// cette page sert). Isolée par mocks (pattern page.test.tsx) : session iam +
// service inscriptions.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getDossiersState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () => inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

// Le bouton d'attribution des dossards est un composant client Next (router) :
// hors de propos ici — la page est testée pour ses LIENS (story 7.4).
vi.mock('./attribution-dossards', () => ({
  AttributionDossards: () => null,
}));

import AdminDossiersPage, { dynamic as DOSSIERS_DYNAMIC } from './page';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(
    <AdminDossiersPage searchParams={Promise.resolve({})} />,
  );
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_ORGANISATEUR,
  });
  inscriptionsServiceMock.getDossiersState.mockReset();
  inscriptionsServiceMock.getDossiersState.mockResolvedValue({
    edition: {
      id: 'edition-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: '2027-03-26',
      registrationClosesAt: '2027-03-16T22:59:59.000Z',
      registrationOpen: false,
    },
    dossiers: [],
    hasMore: false,
  });
});

describe('page /admin/dossiers — rendu serveur', () => {
  it('dynamique : force-dynamic', () => {
    expect(DOSSIERS_DYNAMIC).toBe('force-dynamic');
  });

  it('liste vide : message dédié + lien J-10 vers /admin/rapports (story 7.4)', async () => {
    const html = await rendu();
    expect(html).toContain('Aucun coureur inscrit pour le moment.');
    expect(html).toContain('href="/admin/rapports"');
    expect(html).toContain('prépare la commande t-shirts et médailles depuis les rapports');
  });

  it('lien historique vers le PC course conservé, la page ne casse pas', async () => {
    const html = await rendu();
    expect(html).toContain('href="/admin/course"');
    // React insère un commentaire entre segments du titre composé.
    expect(html).toMatch(/Dossiers<!-- --> — Édition 2027/);
  });

  it('base KO : écran AdminIndisponible', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('/admin/rapports');
  });
});
