import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 4.1 (revue) — rendu serveur de la page checklist : le lien
// « Ton e-dossard » n'apparaît QUE sur un dossier complet (validé) — sinon
// la destination afficherait la page d'attente. Isolée par mocks (pattern
// volontaires/page.test.tsx) : session, service inscriptions, assistance.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getChecklistState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

const assistanceMock = vi.hoisted(() => ({
  readAssistancePhone: vi.fn(() => '+213 555 010 200'),
}));

vi.mock(
  '@/lib/assistance-phone',
  () => assistanceMock as unknown as typeof import('@/lib/assistance-phone'),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  redirect: () => undefined,
}));

import type { ChecklistPiece } from '@/modules/inscriptions/service';
import EspaceCoureurPage from './page';

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

function piece(id: string, fait: boolean): ChecklistPiece {
  return { id: id as ChecklistPiece['id'], libelle: `Pièce ${id}`, fait };
}

function checklistState(faites: number) {
  const ids = ['email', 'epreuve', 'decharge', 'reglement', 'preuve', 'validation'];
  return {
    edition: EDITION,
    pieces: ids.map((id, index) => piece(id, index < faites)),
    recap: null,
  };
}

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<EspaceCoureurPage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  inscriptionsServiceMock.getChecklistState.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_COUREUR,
  });
});

describe('page /espace-coureur — lien e-dossard (story 4.1)', () => {
  it('checklist complète (dossier validé) : lien « Ton e-dossard » vers la page QR', async () => {
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(checklistState(6));
    const html = await rendu();
    expect(html).toContain('href="/espace-coureur/e-dossard"');
    expect(html).toContain('Ton e-dossard — QR à présenter au guichet');
    // Le bandeau validé accompagne le lien (même condition).
    expect(html).toContain('Dossier validé — dossard prêt');
  });

  it('checklist incomplète : aucun lien e-dossard (la cible afficherait l’attente)', async () => {
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(checklistState(5));
    const html = await rendu();
    expect(html).not.toContain('href="/espace-coureur/e-dossard"');
    expect(html).not.toContain('Ton e-dossard');
  });
});
