import type { ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Cycle de vie du dossier (PO, 11/11/2026) — la page /inscription selon le
// statut : figée (validé, en validation) avec un titre qui dit POURQUOI, ou
// ouverte à la reprise (refusé, expirée) avec le motif et ce que
// l'enregistrement va faire. Le formulaire lui-même est un composant client :
// remplacé par un rendu de ses enfants (les encarts posés par la page).

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const serviceMock = vi.hoisted(() => ({
  getInscriptionState: vi.fn(),
  getPlacesState: vi.fn(),
  getHebergementState: vi.fn(),
  PLACES_MUETTES: { capacite: 0, restantes: 0, afficher: false, complet: false },
  HEBERGEMENT_INDISPONIBLE: { restantes: 0, capacite: 0, complet: true, prixDa: 0 },
}));

vi.mock(
  '@/modules/inscriptions/service',
  () => serviceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

vi.mock('./inscription-form', () => ({
  InscriptionForm: ({ children }: { children: ReactNode }) => (
    <form>
      FORMULAIRE-INSCRIPTION
      {children}
    </form>
  ),
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

function etat(status: string, extra: Record<string, unknown> = {}) {
  return {
    edition: EDITION,
    epreuves: [],
    coureur: {
      id: 'coureur-1',
      status,
      preuveDueAt: '2026-10-23T22:59:59.999Z',
      refusalReason: null,
      dechargeAccepte: null,
      reglementAccepte: null,
      ...extra,
    },
  };
}

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(await InscriptionPage());
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset().mockResolvedValue({
    status: 'authenticated',
    session: SESSION_COUREUR,
  });
  serviceMock.getInscriptionState.mockReset();
  serviceMock.getPlacesState.mockReset().mockResolvedValue(serviceMock.PLACES_MUETTES);
  serviceMock.getHebergementState
    .mockReset()
    .mockResolvedValue(serviceMock.HEBERGEMENT_INDISPONIBLE);
});

describe('/inscription — cycle de vie du dossier', () => {
  it('validé : « Dossier déjà validé », pas de formulaire', async () => {
    serviceMock.getInscriptionState.mockResolvedValue(etat('validé'));
    const html = await rendu();
    expect(html).toContain('Dossier déjà validé');
    expect(html).not.toContain('FORMULAIRE-INSCRIPTION');
  });

  it('en validation : figé, « en cours de validation », aucun remplacement de preuve, assistance proposée', async () => {
    serviceMock.getInscriptionState.mockResolvedValue(etat('en validation'));
    const html = await rendu();
    expect(html).toContain('Dossier en cours de validation');
    expect(html).not.toContain('Dossier déjà validé');
    expect(html).not.toContain('FORMULAIRE-INSCRIPTION');
    // Décision PO du 11/11/2026 : plus aucun dépôt pendant l'examen.
    expect(html).not.toContain('href="/preuve"');
    expect(html).not.toContain('Remplacer');
    expect(html).toContain('href="tel:');
    expect(html).toContain('Appeler l’équipe');
  });

  it('refusé : formulaire ouvert, motif affiché, reprise expliquée, aucune échéance périmée', async () => {
    serviceMock.getInscriptionState.mockResolvedValue(
      etat('refusé', { refusalReason: 'Montant incomplet' }),
    );
    const html = await rendu();
    expect(html).not.toContain('Dossier déjà validé');
    expect(html).toContain('FORMULAIRE-INSCRIPTION');
    expect(html).toContain('Ton dossier a été refusé.');
    expect(html).toMatch(/Motif : (<!-- -->)?Montant incomplet/);
    expect(html).toContain('liste d’attente');
    expect(html).not.toContain('Ta place est réservée');
  });

  it('expirée : formulaire ouvert, reprise expliquée, aucune échéance périmée', async () => {
    serviceMock.getInscriptionState.mockResolvedValue(etat('expirée'));
    const html = await rendu();
    expect(html).not.toContain('Dossier déjà validé');
    expect(html).toContain('FORMULAIRE-INSCRIPTION');
    expect(html).toContain('expiré');
    expect(html).not.toContain('Ta place est réservée');
  });

  it('en constitution : formulaire ouvert, échéance annoncée', async () => {
    serviceMock.getInscriptionState.mockResolvedValue(etat('en constitution'));
    const html = await rendu();
    expect(html).toContain('FORMULAIRE-INSCRIPTION');
    expect(html).toContain('Ta place est réservée');
  });
});
