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

function checklistState(faites: number, statut: string | null = null) {
  const ids = ['email', 'epreuve', 'decharge', 'reglement', 'preuve', 'validation'];
  return {
    edition: EDITION,
    pieces: ids.map((id, index) => piece(id, index < faites)),
    recap: null,
    statut,
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

describe('page /espace-coureur — statut du dossier', () => {
  it('place tenue, preuve absente : « en attente de justificatif de paiement »', async () => {
    // 4 pièces faites : la preuve (5ᵉ) ne l'est pas encore.
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(
      checklistState(4, 'en constitution'),
    );
    const html = await rendu();
    expect(html).toContain('En attente de justificatif de paiement');
    expect(html).not.toContain('En attente de validation par l’organisation</span>');
  });

  it('preuve déposée : « en attente de validation par l’organisation »', async () => {
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(
      checklistState(5, 'en constitution'),
    );
    const html = await rendu();
    expect(html).toMatch(/socle-pastille[^"]*"[^>]*>\s*<span[^>]*><\/span>En attente de validation par l’organisation/);
    expect(html).not.toContain('En attente de justificatif de paiement');
  });

  it('liste d’attente : jamais « justificatif » — aucun versement n’est à faire', async () => {
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(
      checklistState(4, 'liste d’attente'),
    );
    const html = await rendu();
    expect(html).toContain('Liste d’attente');
    expect(html).not.toContain('En attente de justificatif de paiement');
  });

  it('aucune inscription (statut null) : pas de ligne « Statut »', async () => {
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(checklistState(1, null));
    const html = await rendu();
    expect(html).not.toContain('espace-statut');
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

  // Story 9.4 — le bouton d’assistance « Appeler l’équipe » reste visible
  // sur la checklist, dossier complet ou non (SM-C1, UX-DR-11, story 1.7).
  it('checklist rendue : « Appeler l’équipe » toujours visible avec le numéro', async () => {
    inscriptionsServiceMock.getChecklistState.mockResolvedValue(checklistState(2));
    const html = await rendu();
    expect(html).toContain('Appeler l’équipe');
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).toContain('2 pièces sur 6');
  });
});
