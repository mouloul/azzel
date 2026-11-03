import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 9.4 — rendu serveur de /inscription refondue : fil d'étapes (étape
// courante par la forme et le texte, pas de promesse vers l'avant), champs
// au gabarit du socle avec « (obligatoire) » EN TEXTE, aides associées par
// aria-describedby, récapitulatif APRÈS le formulaire (téléphone : une
// colonne, il passe dessous). Clôture J-10 verbatim. Isolée par mocks
// (calque espace-coureur/page.test.tsx) : session, service, navigation.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getInscriptionState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () =>
    inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  redirect: () => undefined,
}));

import InscriptionPage from './page';

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

const EPREUVES = [
  { id: 'ep-1', slug: 'longue', nom: 'La Longue — 35 km', distanceKm: 35 },
  { id: 'ep-2', slug: 'moyenne', nom: 'La Moyenne — 12 km', distanceKm: 12 },
];

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<InscriptionPage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  inscriptionsServiceMock.getInscriptionState.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_COUREUR,
  });
});

describe('/inscription — formulaire refondu (story 9.4)', () => {
  it('fil d’étapes : « Étape 1 sur 4 — en cours » avec aria-current, au-dessus du formulaire', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: EDITION,
      epreuves: EPREUVES,
      coureur: null,
    });
    const html = await rendu();
    expect(html).toContain('Étape 1 sur 4 — en cours');
    expect(html).toContain('aria-current="step"');
    expect(html.indexOf('Étapes du dossier')).toBeLessThan(html.indexOf('<form'));
  });

  it('aucune promesse vers l’avant : ni lien ni mention d’état sur Documents/Paiement/Validation', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: EDITION,
      epreuves: EPREUVES,
      coureur: null,
    });
    const html = await rendu();
    expect(html).not.toContain('href="/acceptations"');
    expect(html).not.toContain('href="/preuve"');
    expect(html).not.toContain('À venir');
  });

  it('champs obligatoires annoncés EN TEXTE : huit mentions « (obligatoire) », zéro astérisque', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: EDITION,
      epreuves: EPREUVES,
      coureur: null,
    });
    const html = await rendu();
    expect((html.match(/\(obligatoire\)/g) ?? []).length).toBe(8);
    expect(html).not.toContain('*');
  });

  it('gabarit du socle : étiquettes associées par htmlFor/id, aides liées par aria-describedby', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: EDITION,
      epreuves: EPREUVES,
      coureur: null,
    });
    const html = await rendu();
    expect(html).toContain('class="socle-etiquette" for="inscription-prenom"');
    expect(html).toContain('id="inscription-prenom"');
    expect(html).toContain('for="inscription-tailleTshirt"');
    expect(html).toContain('id="inscription-tailleTshirt"');
    expect(html).toContain('id="inscription-aide-dateNaissance"');
    expect(html).toContain('aria-describedby="inscription-aide-dateNaissance"');
    expect(html).toContain('socle-champ-aide');
  });

  it('une colonne téléphone : le récapitulatif est rendu APRÈS le formulaire', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: EDITION,
      epreuves: EPREUVES,
      coureur: null,
    });
    const html = await rendu();
    const finFormulaire = html.indexOf('</form>');
    const recap = html.indexOf('dossier-recap');
    expect(finFormulaire).toBeGreaterThan(-1);
    expect(recap).toBeGreaterThan(finFormulaire);
  });

  it('clôture J-10 : écran dédié avec la date, SANS fil d’étapes ni formulaire', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: { ...EDITION, registrationOpen: false },
      epreuves: EPREUVES,
      coureur: null,
    });
    const html = await rendu();
    expect(html).toContain('Les inscriptions sont fermées');
    expect(html).toContain('16 mars 2027');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Étapes du dossier');
  });

  it('dossier déjà validé : écran dédié, aucune modification proposée', async () => {
    inscriptionsServiceMock.getInscriptionState.mockResolvedValue({
      edition: EDITION,
      epreuves: EPREUVES,
      coureur: {
        status: 'validé',
        dechargeAccepte: null,
        reglementAccepte: null,
      },
    });
    const html = await rendu();
    expect(html).toContain('Dossier déjà validé');
    expect(html).not.toContain('<form');
  });
});
