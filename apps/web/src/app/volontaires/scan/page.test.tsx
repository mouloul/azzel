import { renderToReadableStream } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 4.2 — page /volontaires/scan : garde volontaire (serveur), mission
// scan transmise, écrans dédiés (permission UX-DR-18 complet iOS/Android +
// assistance, annuaire absent bloquant) et garde-fous CSS du voyant
// (clignotement ≤ 1/s, reduced-motion statique, stop ≥ 64 px). Isolée par
// mocks (pattern page.test.tsx volontaires).

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

import ScanPage from './page';
import { DUREE_CLIGNOTEMENT_MS, EcranAnnuaireAbsent, EcranCameraRefusee } from './scan-client';

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const MISSION_SCAN = {
  id: 'mission-scan-1',
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

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<ScanPage />);
  return await new Response(flux).text();
}

async function renduComposant(element: React.ReactElement): Promise<string> {
  const flux = await renderToReadableStream(element);
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

describe('page /volontaires/scan — garde serveur et mission', () => {
  it('garde db-unavailable : message dédié, jamais le scanner', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('Préparation du scanner');
    expect(html).not.toContain('Lecture de l’annuaire');
  });

  it('session volontaire : scanner rendu, aucun appel réseau dans la page', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN],
      missions: [MISSION_SCAN],
    });
    const html = await rendu();
    expect(html).toContain('Scan des e-dossards');
    // Écran initial : lecture de l'annuaire local (IndexedDB), pas de fetch.
    expect(html).toContain('Lecture de l’annuaire enregistré');
  });

  it('état missions en échec : le scanner reste rendu (validation 100 % locale)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockRejectedValue(new Error('db down'));
    const html = await rendu();
    expect(html).toContain('Scan des e-dossards');
    expect(html).toContain('Lecture de l’annuaire enregistré');
  });
});

describe('écran caméra refusée (UX-DR-18)', () => {
  it('permission refusée : titre, chemins Réglages iOS ET Android complets, assistance PC', async () => {
    const html = await renduComposant(
      <EcranCameraRefusee variante="permission" assistancePhone="+213 555 010 200" />,
    );
    expect(html).toContain('Autoriser la caméra');
    // Chemin iOS complet.
    expect(html).toContain('Réglages');
    expect(html).toContain('Safari');
    expect(html).toContain('Caméra');
    // Chemin Android complet.
    expect(html).toContain('Autorisations');
    expect(html).toContain('Android');
    // Bouton assistance PC — numéro formaté tel:.
    expect(html).toContain('Appeler le PC');
    expect(html).toContain('href="tel:+213555010200"');
  });

  it('variante caméra indisponible : titre dédié + assistance', async () => {
    const html = await renduComposant(
      <EcranCameraRefusee variante="indisponible" assistancePhone="+213 555 010 200" />,
    );
    expect(html).toContain('Caméra indisponible');
    expect(html).toContain('Appeler le PC');
    expect(html).not.toContain('Réglages');
  });
});

describe('écran annuaire absent — bloquant, pas de scan à l’aveugle', () => {
  it('message « Annuaire non chargé » + invitation à se connecter + retour fiche', async () => {
    const html = await renduComposant(<EcranAnnuaireAbsent />);
    expect(html).toContain('Annuaire non chargé');
    expect(html).toContain('Connecte-toi une fois en ligne');
    expect(html).toContain('Revenir à ma fiche');
    expect(html).toContain('href="/volontaires"');
  });
});

describe('scan.css — garde-fous UX-DR-6/7, SCOPÉS au sélecteur concerné', () => {
  const css = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'scan.css'),
    'utf8',
  );

  /** Corps de la règle portant exactement ce sélecteur (pas un autre bloc). */
  function regleCss(selecteur: string): string {
    const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const correspondance = css.match(new RegExp(`${echappe}\\s*\\{([^}]*)\\}`));
    return correspondance?.[1] ?? '';
  }

  it('voyant : pill ≥ 96 px DANS la règle .scan-voyant', () => {
    expect(regleCss('.scan-voyant')).toContain('min-height: 96px');
  });

  it('texte du voyant ≥ 24 px graisse 800 DANS la règle .scan-voyant-texte', () => {
    const regle = regleCss('.scan-voyant-texte');
    expect(regle).toContain('font-size: 24px');
    expect(regle).toContain('font-weight: 800');
  });

  it('heure mono ≥ 16 px DANS la règle .scan-voyant-heure', () => {
    expect(regleCss('.scan-voyant-heure')).toContain('font-size: 16px');
  });

  it('clignotement ≤ 1 flash/s : animation 1s UNIQUEMENT sur le modificateur --vif', () => {
    const regle = regleCss('.scan-voyant--vif');
    expect(regle).toContain('animation: scan-clignote 1s');
    expect(regle).not.toMatch(/0\.[0-9]+s/);
    // Les états eux-mêmes ne clignotent pas sans --vif (clignotement borné
    // côté client par DUREE_CLIGNOTEMENT_MS).
    for (const etat of ['.scan-voyant--succes', '.scan-voyant--doublon', '.scan-voyant--inconnu']) {
      expect(regleCss(etat)).not.toContain('animation:');
    }
  });

  it('prefers-reduced-motion : --vif statique DANS le bloc média', () => {
    const media = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
    const bloc = media?.[1] ?? '';
    expect(bloc).toContain('.scan-voyant--vif');
    expect(bloc).toContain('animation: none');
  });

  it('voile quasi opaque ≥ 96 % DANS la règle .scan-voile', () => {
    expect(regleCss('.scan-voile')).toMatch(/rgba\([^)]*,\s*0\.9[6-9]\)/);
  });

  it('stop ≥ 64 dp DANS la règle .scan-stop', () => {
    expect(regleCss('.scan-stop')).toContain('min-height: 64px');
  });
});

describe('clignotement borné dans le temps', () => {
  it('le voyant clignote 6 s puis reste statique (constante du client)', () => {
    expect(DUREE_CLIGNOTEMENT_MS).toBe(6000);
  });
});
