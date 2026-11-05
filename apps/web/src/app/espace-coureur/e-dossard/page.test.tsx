import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 4.1 — rendu serveur de la page e-dossard : QR SVG (généré par la vraie
// lib qrcode — le contrat « zéro lib client » n'est pas testable ici, le SVG
// serveur si), numéro 74 px / « Numéro à venir », badge HORS-LIGNE PRÊT,
// conseil raccourci, et la branche non validé (AUCUN QR, lien checklist).
// Isolée par mocks (pattern volontaires/page.test.tsx) : session, service
// inscriptions, assistance (env) et navigation.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  obtenirEdossard: vi.fn(),
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

import { DbUnavailableError } from '@/modules/iam/errors';
import { NoEditionError } from '@/modules/inscriptions/errors';
import EdossardPage from './page';

const SESSION_COUREUR = {
  accountId: 'account-coureur',
  organisationId: 'org-1',
  email: 'yani@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const EDOSSARD_VALIDE_NUMEROTE = {
  jeton: 'AbCdEf0123456789-_XyZa',
  dossard: 12,
  prenom: 'Yani',
  nom: 'Ulahianne',
  epreuveNom: 'La Longue — 35 km',
  editionNom: 'Édition 2027',
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<EdossardPage />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  inscriptionsServiceMock.obtenirEdossard.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_COUREUR,
  });
  inscriptionsServiceMock.obtenirEdossard.mockResolvedValue(EDOSSARD_VALIDE_NUMEROTE);
});

describe('page /espace-coureur/e-dossard — coureur validé numéroté', () => {
  it('QR SVG serveur présent, accessible, et payload JAMAIS en clair dans le HTML', async () => {
    const html = await rendu();
    expect(html).toContain('<svg');
    // Accessibilité : le wrapper porte role="img" + aria-label
    // « QR e-dossard de {prénom} {nom} ».
    expect(html).toContain('role="img"');
    expect(html).toContain('QR e-dossard de Yani Ulahianne');
    // Le QR encode azzel-e1:<jeton> — mais ni le payload ni le jeton ne
    // saignent dans le HTML textuel (uniquement en modules de points).
    expect(html).not.toContain('azzel-e1:');
    expect(html).not.toContain(EDOSSARD_VALIDE_NUMEROTE.jeton);
  });

  it('marker data-edossard="pret" présent sur la carte (lu par le SW)', async () => {
    const html = await rendu();
    expect(html).toContain('data-edossard="pret"');
  });

  it('panneau dossard : identité, épreuve, numéro de dossard, badge HORS-LIGNE PRÊT', async () => {
    const html = await rendu();
    expect(html).toContain('E-dossard —');
    expect(html).toContain('Édition 2027');
    expect(html).toContain('Yani');
    expect(html).toContain('Ulahianne');
    expect(html).toContain('La Longue — 35 km');
    expect(html).toContain('edossard-numero"');
    expect(html).toContain('>12</p>');
    expect(html).toContain('HORS-LIGNE PRÊT');
    expect(html).toContain('role="status"');
  });

  it('fil d’étapes : les quatre étapes sont franchies', async () => {
    const html = await rendu();
    expect(html).toContain('Ton e-dossard est prêt');
    expect(html).toContain('Validation');
    expect(html).not.toContain('en cours');
    expect(html).toContain('href="/preuve"');
  });

  it('conseil raccourci système (écran d’accueil) + assistance + déconnexion', async () => {
    const html = await rendu();
    expect(html).toContain('écran d’accueil');
    expect(html).toContain('Présente ce QR code au guichet');
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).toContain('Se déconnecter');
  });
});

describe('page /espace-coureur/e-dossard — coureur validé non numéroté', () => {
  it('QR présent + « Numéro à venir » : le jeton existe dès consultation', async () => {
    inscriptionsServiceMock.obtenirEdossard.mockResolvedValue({
      ...EDOSSARD_VALIDE_NUMEROTE,
      dossard: null,
    });
    const html = await rendu();
    expect(html).toContain('<svg');
    expect(html).toContain('Numéro à venir');
    expect(html).not.toContain('>12</p>');
  });
});

describe('page /espace-coureur/e-dossard — dossier non validé', () => {
  it('message d’attente + lien checklist, AUCUN QR ni marker hors-ligne', async () => {
    inscriptionsServiceMock.obtenirEdossard.mockResolvedValue(null);
    const html = await rendu();
    expect(html).toContain('Ton e-dossard arrive');
    expect(html).toContain('href="/espace-coureur"');
    expect(html).toContain('Revoir ma checklist');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('HORS-LIGNE PRÊT');
    // La page d'attente ne doit JAMAIS survivre en cache SW (guichet).
    expect(html).not.toContain('data-edossard="pret"');
  });
});

describe('page /espace-coureur/e-dossard — jeton corrompu (défense en profondeur)', () => {
  it('l’encodage du QR échoue proprement : enveloppe + assistance, jamais un 500 brut', async () => {
    inscriptionsServiceMock.obtenirEdossard.mockResolvedValue({
      ...EDOSSARD_VALIDE_NUMEROTE,
      // 21 caractères : le contrat shared (et le CHECK SQL 0024) refusent.
      jeton: 'JetonInvalideDe21Char',
    });
    const html = await rendu();
    expect(html).toContain('E-dossard indisponible');
    expect(html).toContain('Une erreur inattendue est survenue.');
    expect(html).toContain('Appeler l’équipe');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('data-edossard="pret"');
  });
});

describe('page /espace-coureur/e-dossard — états dégradés', () => {
  it('garde db-unavailable : message dédié, jamais le QR', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('<svg');
  });

  it('aucune édition : carte dédiée sans QR', async () => {
    inscriptionsServiceMock.obtenirEdossard.mockRejectedValue(new NoEditionError());
    const html = await rendu();
    expect(html).toContain('Aucune édition disponible');
    expect(html).not.toContain('<svg');
  });

  it('service en échec : enveloppe affichée + assistance conservée', async () => {
    inscriptionsServiceMock.obtenirEdossard.mockRejectedValue(new DbUnavailableError());
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).toContain('Réessaie dans un instant.');
    expect(html).toContain('Appeler l’équipe');
    expect(html).not.toContain('<svg');
  });
});
