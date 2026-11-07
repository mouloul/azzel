import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 4.4 — câblage du mode checkpoints : le checkpoint EST la mission
// scan_checkpoint en cours (son id référence chaque passage, son titre badge
// le cadre caméra). ScanClient est moqué pour CAPTURER les props transmises
// par la page serveur — le rendu initial du vrai client ne les expose pas
// dans le HTML. Isolée par mocks (pattern page.test.tsx).

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

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn(() => undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  redirect: navigationMock.redirect,
}));

interface PropsScanClient {
  assistancePhone?: string;
  missionLabel?: string;
  mode?: string;
  checkpointId?: string | null;
}

const scanClientMock = vi.hoisted(() => ({
  ScanClient: vi.fn((_props: PropsScanClient) => null),
}));

vi.mock('./scan-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('./scan-client')>();
  return { ...original, ScanClient: scanClientMock.ScanClient };
});

import ScanPage from './page';

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const MISSION_SCAN = {
  id: 'mission-scan-km12',
  secteurNom: 'Km 12',
  secteurLieu: 'Zone blanche',
  secteurContact: null,
  type: 'scan_checkpoint',
  typeLabel: 'Scan checkpoint',
  titre: 'Scan km 12',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
  consignes: null,
  couverture: 'couverte',
  couvertureLabel: 'Couverte',
};

const MISSION_SCAN_KM30 = {
  ...MISSION_SCAN,
  id: 'mission-scan-km30',
  titre: 'Scan km 30',
};

const MISSION_GUICHET = {
  ...MISSION_SCAN,
  id: 'mission-guichet-1',
  type: 'distribution_dossards',
  typeLabel: 'Distribution des dossards',
  titre: 'Guichet dossards',
};

async function rendu(searchParams?: Promise<{ mode?: string | string[] }>): Promise<string> {
  const flux = await renderToReadableStream(<ScanPage searchParams={searchParams} />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  missionsServiceMock.getMissionsVolontaireState.mockReset();
  navigationMock.redirect.mockReset();
  scanClientMock.ScanClient.mockClear();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_VOLONTAIRE,
  });
});

describe('page /volontaires/scan — checkpoint = mission scan en cours (story 4.4)', () => {
  it('mode checkpoint : checkpointId = id de la mission scan, badge = son titre', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN, MISSION_GUICHET],
      missions: [MISSION_SCAN],
    });
    await rendu();
    expect(scanClientMock.ScanClient).toHaveBeenCalledTimes(1);
    expect(scanClientMock.ScanClient.mock.calls[0]?.[0]).toMatchObject({
      checkpointId: 'mission-scan-km12',
      missionLabel: 'Scan km 12',
    });
    // Mode par défaut : la page ne passe PAS mode="retrait".
    expect(scanClientMock.ScanClient.mock.calls[0]?.[0]?.mode).toBeUndefined();
  });

  // Story 4.6 — ce test attendait l'inverse : « la PREMIÈRE fournit le
  // checkpoint ». C'était le défaut — deux checkpoints, aucun créneau courant,
  // et les passages partaient sur celui qui ouvrait la liste.
  it('plusieurs missions scan hors créneau : AUCUN scanner, écran de blocage', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN_KM30, MISSION_SCAN],
      missions: [MISSION_SCAN_KM30, MISSION_SCAN],
    });
    const html = await rendu();
    expect(scanClientMock.ScanClient).not.toHaveBeenCalled();
    expect(html).toContain('Aucune mission de scan en cours');
    // Les deux missions sont nommées : le volontaire sait quand revenir.
    expect(html).toContain('Scan km 30');
    expect(html).toContain('Scan km 12');
    // Jamais une impasse sans porte de sortie.
    expect(html).toContain('Appeler le PC');
    expect(html).toContain('Revenir à ma fiche');
  });

  it('plusieurs missions scan au MÊME créneau : écran de chevauchement, PC appelé', async () => {
    const maintenant = new Date();
    const enCours = (id: string, titre: string) => ({
      ...MISSION_SCAN,
      id,
      titre,
      debutLe: new Date(maintenant.getTime() - 60 * 60 * 1000).toISOString(),
      finLe: new Date(maintenant.getTime() + 60 * 60 * 1000).toISOString(),
    });
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [enCours('cp-a', 'Scan km 12'), enCours('cp-b', 'Scan km 30')],
      missions: [],
    });
    const html = await rendu();
    expect(scanClientMock.ScanClient).not.toHaveBeenCalled();
    expect(html).toContain('Deux missions se chevauchent sur ce créneau');
  });

  it('une seule mission scan, même hors créneau : le scanner s’ouvre (non-régression)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN],
      missions: [MISSION_SCAN],
    });
    await rendu();
    expect(scanClientMock.ScanClient.mock.calls[0]?.[0]).toMatchObject({
      checkpointId: 'mission-scan-km12',
      missionLabel: 'Scan km 12',
    });
  });

  it('mode retrait : AUCUN checkpointId transmis (le checkpoint est propre au mode passages)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_GUICHET],
      missions: [MISSION_GUICHET],
    });
    await rendu(Promise.resolve({ mode: 'retrait' }));
    expect(scanClientMock.ScanClient.mock.calls[0]?.[0]).toMatchObject({
      mode: 'retrait',
      missionLabel: 'Guichet dossards',
    });
    expect(scanClientMock.ScanClient.mock.calls[0]?.[0]?.checkpointId).toBeUndefined();
  });
});
