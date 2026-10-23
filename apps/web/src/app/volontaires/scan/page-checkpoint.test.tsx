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

async function rendu(searchParams?: Promise<{ mode?: string | string[] }>): Promise<void> {
  const flux = await renderToReadableStream(<ScanPage searchParams={searchParams} />);
  await new Response(flux).text();
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

  it('plusieurs missions scan hors fenêtre : la PREMIÈRE fournit le checkpoint (repli missionTypeEnCours)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN_KM30, MISSION_SCAN],
      missions: [MISSION_SCAN_KM30, MISSION_SCAN],
    });
    await rendu();
    expect(scanClientMock.ScanClient.mock.calls[0]?.[0]).toMatchObject({
      checkpointId: 'mission-scan-km30',
      missionLabel: 'Scan km 30',
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
