import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 3.3 — rendu serveur de la page PWA volontaires : fiche complète
// (titre, lieu terrain, gros bouton tel:, assistance transmise, email du
// compte) et branche d'erreur avec enveloppe + déconnexion. Isolée par
// mocks (pattern page.test.tsx / routes admin) : session, service missions,
// assistance (env) et navigation.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const missionsServiceMock = vi.hoisted(() => ({
  getMissionsVolontaireState: vi.fn(),
}));

vi.mock(
  '@/modules/missions/service',
  () =>
    missionsServiceMock as unknown as typeof import('@/modules/missions/service'),
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

import { DbUnavailableError } from '@/modules/iam/errors';
import VolontairesPage from './page';

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const MISSION = {
  id: 'mission-1',
  secteurNom: 'Village',
  secteurLieu: 'Place du village',
  secteurContact: '+213 555 010 203',
  type: 'accueil',
  typeLabel: 'Accueil',
  titre: 'Accueil village',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
  consignes: 'Arrive 15 min avant.\nTiens le stand.',
  couverture: 'couverte',
  couvertureLabel: 'Couverte',
};

const ETAT = {
  editionNom: 'Édition 2027',
  mesMissions: [MISSION],
  missions: [MISSION],
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<VolontairesPage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  missionsServiceMock.getMissionsVolontaireState.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_VOLONTAIRE,
  });
});

describe('page /volontaires — rendu serveur PWA (story 3.3)', () => {
  it('fiche complète : titre, lieu terrain, gros bouton tel: du PC, consignes', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('Accueil village');
    expect(html).toContain('Place du village');
    expect(html).toContain('Secteur');
    expect(html).toContain('href="tel:+213555010203"');
    expect(html).toContain('Appeler le PC du secteur');
    expect(html).toContain('Arrive 15 min avant.');
  });

  it('en-tête : email du compte, édition, assistance transmise, badge synchronisé', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('karim@exemple.dz');
    expect(html).toContain('Édition 2027');
    // Assistance (props → Appeler l'équipe) : numéro formaté tel:.
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).toContain('synchronisé à');
    expect(html).toContain('role="status"');
  });

  it('mission sans contact PC : aucun lien tel: du secteur, pas de lien mort', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [{ ...MISSION, secteurContact: null }],
      missions: [{ ...MISSION, secteurContact: null }],
    });
    const html = await rendu();
    expect(html).not.toContain('Appeler le PC du secteur');
    // L'assistance générale reste le seul numéro tel: de la page.
    const tels = html.match(/href="tel:[^"]+"/g) ?? [];
    expect(tels.length).toBeGreaterThan(0);
    expect(new Set(tels)).toEqual(new Set(['href="tel:+213555010200"']));
  });

  it('service en échec : enveloppe affichée + déconnexion + assistance conservées', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockRejectedValue(new DbUnavailableError());
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).toContain('Réessaie dans un instant.');
    expect(html).toContain('Se déconnecter');
    expect(html).toContain('Appeler l’équipe');
  });

  it('garde db-unavailable : message dédié, jamais la fiche', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('Ton espace mission');
  });
});
