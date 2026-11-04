import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// I9 (revue épopée 10) — la page détail affiche le statut en pastille du
// socle, comme la liste : un seul langage visuel par statut. SSR minimal,
// pattern dossiers/page.test.tsx (session iam + service inscriptions mockés).

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getDossierDetail: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () => inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

// Le formulaire de décision est un composant client (router) : hors propos
// ici — la page est testée pour sa pastille de statut.
vi.mock('./decision-form', () => ({
  DecisionForm: () => null,
}));

import AdminDossierDetailPage from './page';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function coureur(partial: Record<string, unknown> = {}) {
  return {
    id: 'coureur-1',
    epreuve: 'la-longue',
    epreuveNom: 'La Longue',
    distanceKm: 42,
    prenom: 'Amina',
    nom: 'Belkacem',
    telephone: '+213 555 010 203',
    contactUrgenceNom: 'Yacine Belkacem',
    contactUrgenceTelephone: '+213 555 010 204',
    dateNaissance: '1995-04-12',
    tailleTshirt: 'M',
    age: 31,
    categorie: 'Senior',
    status: 'validé',
    dossard: 101,
    refusalReason: null,
    dechargeAccepte: { acceptedAt: '2027-02-20T10:00:00.000Z', version: '2027-01' },
    reglementAccepte: { acceptedAt: '2027-02-20T10:00:00.000Z', version: '2027-01' },
    createdAt: '2027-02-20T10:00:00.000Z',
    updatedAt: '2027-02-21T10:00:00.000Z',
    ...partial,
  };
}

function detail(status: string, extraCoureur: Record<string, unknown> = {}) {
  return {
    coureur: coureur({ status, ...extraCoureur }),
    email: 'amina@exemple.dz',
    preuveActive: null,
    decidePar: null,
  };
}

async function rendu(id = 'coureur-1'): Promise<string> {
  const flux = await renderToReadableStream(
    <AdminDossierDetailPage params={Promise.resolve({ id })} />,
  );
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_ORGANISATEUR,
  });
  inscriptionsServiceMock.getDossierDetail.mockReset();
});

describe('page /admin/dossiers/[id] — pastille de statut du socle (I9)', () => {
  it('statut en pastille socle : point + LIBELLÉ, jamais la couleur seule', async () => {
    inscriptionsServiceMock.getDossierDetail.mockResolvedValue(detail('validé'));
    const html = await rendu();
    expect(html).toContain('socle-pastille socle-pastille--succes');
    expect(html).toContain('socle-pastille-point');
    expect(html).toContain('Validé');
  });

  it('les trois statuts mènent à leur variante — refusé → danger avec motif', async () => {
    for (const [status, variante, libelle] of [
      ['en constitution', 'socle-pastille--attention', 'En constitution'],
      ['refusé', 'socle-pastille--danger', 'Refusé'],
    ] as const) {
      inscriptionsServiceMock.getDossierDetail.mockResolvedValue(
        detail(status, { refusalReason: 'Preuve illisible' }),
      );
      const html = await rendu();
      expect(html).toContain(variante);
      expect(html).toContain(libelle);
      expect(html).toContain('socle-pastille-point');
    }
  });

  it('plus aucun vestige de l’ancien vocabulaire aa-chip sur cette page', async () => {
    inscriptionsServiceMock.getDossierDetail.mockResolvedValue(detail('validé'));
    const html = await rendu();
    expect(html).not.toContain('aa-chip');
  });

  it('dossier introuvable : notFound (404) plutôt qu’un écran vide', async () => {
    inscriptionsServiceMock.getDossierDetail.mockResolvedValue(null);
    await expect(rendu('coureur-x')).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  });
});
