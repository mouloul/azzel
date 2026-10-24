import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 7.4 — rendu serveur de /admin/rapports : deux cartes descriptives
// avec boutons de téléchargement (liens GET vers les routes CSV, ouverts dans
// un ONGLET NEUF : un 503 n'écrase pas la page), note de processus J-10
// DÉRIVÉE de la date de course de l'édition courante (− 10 jours, fr),
// tutoiement organisateur, dégradations AdminIndisponible. Isolée par mocks
// (pattern page.test.tsx).

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const rapportsServiceMock = vi.hoisted(() => ({
  getEtatRapports: vi.fn(),
}));

vi.mock(
  '@/modules/rapports/service',
  () => rapportsServiceMock as unknown as typeof import('@/modules/rapports/service'),
);

import { DbUnavailableError } from '@/modules/iam/errors';
import AdminRapportsPage, { dynamic as RAPPORTS_DYNAMIC } from './page';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<AdminRapportsPage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_ORGANISATEUR,
  });
  rapportsServiceMock.getEtatRapports.mockReset();
  rapportsServiceMock.getEtatRapports.mockResolvedValue({
    edition: { nom: 'Édition 2027', slug: '2027', raceDate: '2027-03-26T00:00:00.000Z' },
  });
});

describe('page /admin/rapports — rendu serveur (story 7.4)', () => {
  it('dynamique : force-dynamic (jamais de cache sur une page admin)', () => {
    expect(RAPPORTS_DYNAMIC).toBe('force-dynamic');
  });

  it('deux cartes descriptives : rapport post-course et commande, chacune avec son bouton de téléchargement', async () => {
    const html = await rendu();
    expect(html).toContain('Rapports');
    expect(html).toContain('Édition 2027');
    expect(html).toContain('Rapport post-course');
    expect(html).toContain('Commande t-shirts et médailles');
    // Descriptions honnêtes : contenu couvert, anonymat, zéro stock.
    expect(html).toContain('inscrits par statut');
    expect(html).toContain('portée des partages');
    expect(html).toContain('Zéro stock : commandé = validé');
    expect(html).toContain('aucun nom ni contact de coureur');
  });

  it('boutons = LIENS GET vers les routes CSV (téléchargement direct, aucun état client)', async () => {
    const html = await rendu();
    expect(html).toContain('href="/api/admin/rapports/post-course"');
    expect(html).toContain('href="/api/admin/rapports/commande"');
    expect(html).toContain('Télécharger le rapport post-course (CSV)');
    expect(html).toContain('Télécharger la commande (CSV)');
    expect(html).toContain('btn-contour');
  });

  it('téléchargements dans un ONGLET NEUF : target=_blank rel=noopener (un 503 n’écrase pas la page)', async () => {
    const html = await rendu();
    expect(html.match(/target="_blank"/g)?.length).toBe(2);
    expect(html.match(/rel="noopener"/g)?.length).toBe(2);
  });

  it('note J-10 DÉRIVÉE de race_date (− 10 jours, formatée fr) : 16 mars 2027 pour la course du 26/03/2027', async () => {
    const html = await rendu();
    expect(html).toContain('Processus J-10 (16 mars 2027)');
    expect(html).not.toContain('16/03/2027');
  });

  it('sans édition courante : note J-10 générique (aucune date inventée)', async () => {
    rapportsServiceMock.getEtatRapports.mockResolvedValue({ edition: null });
    const html = await rendu();
    expect(html).toContain('Processus J-10 (dix jours avant la course)');
    expect(html).not.toContain('Processus J-10 (16');
  });

  it('tutoiement organisateur (registre admin, pas de vouvoiement vitrine)', async () => {
    const html = await rendu();
    expect(html).toContain('télécharge la commande');
    expect(html).not.toContain('Téléchargez');
  });

  it('base KO : écran AdminIndisponible, jamais les cartes', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('Rapport post-course');
  });

  it('lecture de l’édition en échec : écran dédié (enveloppe rapports), jamais les cartes', async () => {
    rapportsServiceMock.getEtatRapports.mockRejectedValue(new DbUnavailableError());
    const html = await rendu();
    expect(html).toContain('Rapports indisponibles');
    expect(html).toContain('Réessaie dans un instant');
    expect(html).not.toContain('Télécharger le rapport');
  });

  it('non organisateur : requireRolePage REDIRIGE — la page ne rend jamais', async () => {
    sessionMock.requireRolePage.mockRejectedValue(new Error('NEXT_REDIRECT'));
    await expect(rendu()).rejects.toThrow('NEXT_REDIRECT');
    expect(rapportsServiceMock.getEtatRapports).not.toHaveBeenCalled();
  });
});
