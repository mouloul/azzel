import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 5.1 — rendu serveur de la page PC course : cartes de synthèse,
// boards UX-DR-12 (dossard mono + heure locale, séparateurs pointillés via
// CSS), fraîcheur TOUJOURS présente (NFR-5), note « aucun checkpoint
// d’arrivée défini », branches d'erreur. Isolée par mocks (pattern
// page.test.tsx) : session iam + service chrono.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const chronoServiceMock = vi.hoisted(() => ({
  getEtatCourse: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

import { DbUnavailableError } from '@/modules/iam/errors';
import AdminCoursePage, { dynamic as COURSE_DYNAMIC } from './page';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const ETAT = {
  edition: { id: 'edition-1', nom: 'Édition 2027' },
  partants: [
    { epreuveId: 'ep-1', epreuveNom: 'La Longue — 35 km', total: 12 },
    { epreuveId: 'ep-2', epreuveNom: 'La Moyenne — 12 km', total: 30 },
  ],
  retraits: 42,
  arrives: 7,
  enCourse: 35,
  abandones: 0,
  arriveeDefinie: true,
  checkpoints: [
    {
      id: 'cp-km12',
      titre: 'Scan km 12',
      estArrivee: false,
      passages: [
        { dossard: 102, horodatageReception: '2027-05-16T07:05:09.000Z' },
        { dossard: 101, horodatageReception: '2027-05-16T07:01:44.000Z' },
      ],
    },
    {
      id: 'cp-arrivee',
      titre: 'Scan arrivée',
      estArrivee: true,
      passages: [{ dossard: 104, horodatageReception: '2027-05-16T09:40:00.000Z' }],
    },
  ],
  fraicheur: '2027-05-16T07:05:09.000Z',
  genereA: '2027-05-16T07:05:12.000Z',
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<AdminCoursePage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  chronoServiceMock.getEtatCourse.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_ORGANISATEUR,
  });
});

describe('page /admin/course — rendu serveur PC course (story 5.1)', () => {
  it('dynamique : force-dynamic (jamais de cache sur une page live)', () => {
    expect(COURSE_DYNAMIC).toBe('force-dynamic');
  });

  it('cartes de synthèse : retraits, partants par épreuve, en course, arrivés, abandonnés', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('PC course');
    expect(html).toContain('Édition 2027');
    expect(html).toContain('Retraits');
    expect(html).toContain('42');
    expect(html).toContain('Partants');
    expect(html).toContain('La Longue — 35 km');
    expect(html).toContain('La Moyenne — 12 km');
    expect(html).toContain('En course');
    expect(html).toContain('Arrivés');
    expect(html).toContain('Abandonnés');
  });

  it('board UX-DR-12 : dossards par passage arbitré, checkpoint d’arrivée marqué, attente si vide', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('Scan km 12');
    // React insère un commentaire entre segments : les DEUX morceaux du titre
    // du board d'arrivée (« Scan arrivée » + « — arrivée »).
    expect(html).toContain('Scan arrivée');
    expect(html).toContain('— arrivée');
    // Dossards des passages arbitrés (badge mono via CSS course-dossard).
    expect(html).toContain('course-dossard');
    expect(html).toContain('101');
    expect(html).toContain('102');
    expect(html).toContain('104');
    // Les lignes du board ne sont PAS cliquables (aucun lien dans la liste).
    expect(html).not.toContain('href="/admin/course/101');
  });

  it('fraîcheur TOUJOURS affichée, accolée aux chiffres (NFR-5)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('synchronisé il y a');
    expect(html).toContain('course-fraicheur');
  });

  it('édition sans événement : cartes à 0, board en attente, « aucune donnée reçue »', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue({
      ...ETAT,
      retraits: 0,
      arrives: 0,
      enCourse: 0,
      fraicheur: null,
      checkpoints: [
        { id: 'cp-km12', titre: 'Scan km 12', estArrivee: false, passages: [] },
      ],
    });
    const html = await rendu();
    expect(html).toContain('aucune donnée reçue');
    expect(html).toContain('En attente du premier passage');
  });

  it('sans checkpoint d’arrivée : arrivés 0 + note « aucun checkpoint d’arrivée défini »', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue({
      ...ETAT,
      arrives: 0,
      arriveeDefinie: false,
    });
    const html = await rendu();
    expect(html).toContain('aucun checkpoint d’arrivée défini');
  });

  it('garde db-unavailable : écran dédié, jamais le tableau de bord', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('PC course');
  });

  it('service en échec à l’ouverture : enveloppe admin.course affichée', async () => {
    chronoServiceMock.getEtatCourse.mockRejectedValue(new DbUnavailableError());
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).toContain('Tableau de bord indisponible');
  });
});
