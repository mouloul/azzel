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
// Story 4.4 — le mode checkpoints (défaut) devient gated par la mission scan
// (le checkpoint identifie le passage) : sans mission → redirection douce
// avec message dédié ; échec d'état → silencieuse (pattern 4.3).

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
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  redirect: navigationMock.redirect,
}));

import ScanPage, { NOTICE_SCAN_PASSAGE, NOTICE_SCAN_RETRAIT } from './page';
import {
  DUREE_CLIGNOTEMENT_MS,
  NOTE_NON_ENREGISTRE,
  TEXTES_SCAN,
  EcranAnnuaireAbsent,
  EcranCameraRefusee,
} from './scan-client';

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

/** rendu interrompu par redirect() — retourne l'erreur interceptée pour vérifier que c'est bien la redirection. */
async function renduRedirige(searchParams?: Promise<{ mode?: string | string[] }>): Promise<unknown> {
  try {
    const flux = await renderToReadableStream(<ScanPage searchParams={searchParams} />);
    await new Response(flux).text();
    return null;
  } catch (erreur) {
    return erreur;
  }
}

async function renduComposant(element: React.ReactElement): Promise<string> {
  const flux = await renderToReadableStream(element);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  missionsServiceMock.getMissionsVolontaireState.mockReset();
  navigationMock.redirect.mockReset();
  // Le vrai redirect() de Next JETTE (NEXT_REDIRECT) : le mock doit interrompre
  // le rendu pareillement, sinon la page continue sur une mission absente.
  navigationMock.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
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

  it('session volontaire avec mission scan : scanner rendu, aucun appel réseau dans la page', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN],
      missions: [MISSION_SCAN],
    });
    const html = await rendu();
    expect(html).toContain('Scan des e-dossards');
    // Écran initial : lecture de l'annuaire local (IndexedDB), pas de fetch.
    expect(html).toContain('Lecture de l’annuaire enregistré');
    // Story 10.1 — écrans d'état sur la carte du socle.
    expect(html).toContain('socle-carte scan-cadre');
  });

  it('état missions en échec : redirection SILENCIEUSE (l’indisponibilité n’est pas l’absence, pattern 4.3)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockRejectedValue(new Error('db down'));
    const erreur = await renduRedirige();
    expect((erreur as Error | null)?.message).toMatch(/NEXT_REDIRECT/);
    // Fiche sans message « réservé » : la cause réelle (indisponibilité) ne
    // doit pas être maquillée en absence de mission.
    expect(navigationMock.redirect).toHaveBeenCalledWith('/volontaires');
    expect(navigationMock.redirect.mock.calls.join(' ')).not.toContain('scan=');
  });
});

// ---------------------------------------------------------------------------
// Story 4.4 — mode checkpoints (défaut) : gating par la mission scan.
// ---------------------------------------------------------------------------

describe('page /volontaires/scan — gating du mode checkpoints (story 4.4)', () => {
  it('mission scan_checkpoint affectée : scanner rendu, PAS de redirection', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN],
      missions: [MISSION_SCAN],
    });
    const html = await rendu();
    expect(html).toContain('Scan des e-dossards');
    expect(html).toContain('Lecture de l’annuaire enregistré');
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });

  it('URL directe sans mission scan (guichet uniquement) : redirection douce AVEC message dédié', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_GUICHET],
      missions: [MISSION_GUICHET],
    });
    const erreur = await renduRedirige();
    expect((erreur as Error | null)?.message).toMatch(/NEXT_REDIRECT/);
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      `/volontaires?scan=${NOTICE_SCAN_PASSAGE}`,
    );
  });

  it('sans AUCUNE mission : redirection douce avec le même message dédié', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [],
      missions: [],
    });
    const erreur = await renduRedirige();
    expect((erreur as Error | null)?.message).toMatch(/NEXT_REDIRECT/);
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      `/volontaires?scan=${NOTICE_SCAN_PASSAGE}`,
    );
  });

  it('?mode=checkpoint explicite : même gating que le mode par défaut', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_GUICHET],
      missions: [MISSION_GUICHET],
    });
    const erreur = await renduRedirige(Promise.resolve({ mode: 'checkpoint' }));
    expect((erreur as Error | null)?.message).toMatch(/NEXT_REDIRECT/);
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      `/volontaires?scan=${NOTICE_SCAN_PASSAGE}`,
    );
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
    // Story 10.1 — actions en pilule du socle sur les écrans d'état.
    expect(html).toContain('socle-action');
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

  it('cible d’appel PC du voyant inconnu ≥ 44 px DANS la règle .scan-voyant-action', () => {
    expect(regleCss('.scan-voyant-action')).toMatch(/min-height: (4[4-9]|[5-9][0-9])px/);
  });

  it('stop ≥ 64 dp DANS la règle .scan-stop', () => {
    expect(regleCss('.scan-stop')).toContain('min-height: 64px');
  });
});

describe('scan-client.tsx — voyant annoncé au lecteur d’écran (UX-DR-7, story 10.1)', () => {
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'scan-client.tsx'),
    'utf8',
  );

  it('les DEUX voyants (succès/doublon ET inconnu) portent role="status" + aria-live="assertive" et la classe scan-voyant', () => {
    // Chaque voyant est un conteneur role="status" aria-live="assertive" dont
    // la className commence par scan-voyant (l'écran actif ne se rend qu'après
    // le geste caméra : le garde lit le source, même principe que scan.css).
    const voyantsAssertifs = source.match(
      /role="status"\s+aria-live="assertive"\s+className=\{`scan-voyant/g,
    );
    expect(voyantsAssertifs).toHaveLength(2);
    // Aucun autre aria-live assertif caché ailleurs dans l'écran actif.
    expect(source.split('aria-live="assertive"').length - 1).toBe(2);
  });
});

describe('clignotement borné dans le temps', () => {
  it('le voyant clignote 6 s puis reste statique (constante du client)', () => {
    expect(DUREE_CLIGNOTEMENT_MS).toBe(6000);
  });
});

describe('scan-client.tsx — émission immédiate, append arrière-plan (NFR-1, story 10.4)', () => {
  const sourceClient = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'scan-client.tsx'),
    'utf8',
  );

  it('voyant + bip partent AVANT l’attente de l’append outbox dans surPayload (les DEUX modes)', () => {
    // Le contrat « le bip et le voyant SONT la confirmation (< 1 s) » tient
    // au câblage : setVoyant + emettreRetourAudio précèdent void termine.then.
    // Les orchestrateurs purs sont couverts dans etats-scan.test.ts ; ce garde
    // empêche de déplacer l’émission derrière l’écriture IndexedDB.
    for (const mode of ['traiterScanRetrait', 'traiterScanPassage']) {
      const bloc = sourceClient.slice(sourceClient.indexOf(mode));
      const emission = bloc.indexOf('emettreRetourAudio');
      const append = bloc.indexOf('termine.then');
      expect(emission).toBeGreaterThan(-1);
      expect(append).toBeGreaterThan(emission);
    }
  });
});

// ---------------------------------------------------------------------------
// Story 4.3 — mode retrait (?mode=retrait) : débloqué par une mission
// distribution_dossards « en cours », libellés dédiés, redirection douce.
// ---------------------------------------------------------------------------

describe('page /volontaires/scan?mode=retrait — gating par mission guichet', () => {
  it('mission distribution_dossards en cours : scanner rendu en mode retrait, mission en badge', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_GUICHET],
      missions: [MISSION_GUICHET],
    });
    const html = await rendu(Promise.resolve({ mode: 'retrait' }));
    expect(html).toContain('Retrait des dossards');
    expect(html).toContain('Lecture de l’annuaire enregistré');
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });

  it('URL directe sans mission guichet : redirection douce vers la fiche AVEC message', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN],
      missions: [MISSION_SCAN],
    });
    const erreur = await renduRedirige(Promise.resolve({ mode: 'retrait' }));
    // L'interruption vient bien de la redirection (NEXT_REDIRECT), pas d'un crash.
    expect((erreur as Error | null)?.message).toMatch(/NEXT_REDIRECT/);
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      `/volontaires?scan=${NOTICE_SCAN_RETRAIT}`,
    );
  });

  it('état missions en échec : redirection SILENCIEUSE (pas de message « réservé »)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockRejectedValue(new Error('db down'));
    const erreur = await renduRedirige(Promise.resolve({ mode: 'retrait' }));
    expect((erreur as Error | null)?.message).toMatch(/NEXT_REDIRECT/);
    // L'indisponibilité n'est pas l'absence de mission : fiche sans message.
    expect(navigationMock.redirect).toHaveBeenCalledWith('/volontaires');
    expect(navigationMock.redirect.mock.calls.join(' ')).not.toContain('scan=');
  });

  it('mode répété (?mode=retrait&mode=retrait) : seul le PREMIER élément compte', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_GUICHET],
      missions: [MISSION_GUICHET],
    });
    const html = await rendu(Promise.resolve({ mode: ['retrait', 'checkpoint'] }));
    expect(html).toContain('Retrait des dossards');
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });

  it('sans paramètre de mode : scanner checkpoints (gating 4.4 satisfait par la mission scan mockée)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      editionNom: 'Édition 2027',
      mesMissions: [MISSION_SCAN],
      missions: [MISSION_SCAN],
    });
    const html = await rendu(Promise.resolve({}));
    expect(html).toContain('Scan des e-dossards');
    expect(html).not.toContain('Retrait des dossards');
    expect(navigationMock.redirect).not.toHaveBeenCalled();
  });
});

describe('libellés dédiés du mode retrait (mêmes écrans, textes distincts)', () => {
  it('TEXTES_SCAN.retrait : surtitre, écran prêt et zone aria dédiés', () => {
    expect(TEXTES_SCAN.retrait.surtitre).toBe('Retrait des dossards');
    expect(TEXTES_SCAN.retrait.titrePret).toBe('Retirer les dossards');
    expect(TEXTES_SCAN.retrait.hintPret).toContain('DÉJÀ PASSÉ');
    expect(TEXTES_SCAN.checkpoint.surtitre).toBe('Scan des e-dossards');
  });

  it('TEXTES_SCAN.checkpoint (4.4) : parlent passages enregistrés + hint doublon', () => {
    expect(TEXTES_SCAN.checkpoint.leadPret(2)).toContain('passage');
    expect(TEXTES_SCAN.checkpoint.hintPret).toContain('passage');
    // Hint doublon : même après reconnexion (outbox persistant).
    expect(TEXTES_SCAN.checkpoint.hintPret).toContain('DÉJÀ PASSÉ');
    expect(TEXTES_SCAN.checkpoint.hintPret).toContain('reconnexion');
  });

  it('note d’honnêteté exacte quand l’outbox refuse l’écriture', () => {
    expect(NOTE_NON_ENREGISTRE).toBe('NON enregistré sur cet appareil');
  });

  it('écran annuaire absent en mode retrait : surtitre dédié', async () => {
    const html = await renduComposant(<EcranAnnuaireAbsent mode="retrait" />);
    expect(html).toContain('Retrait des dossards');
    expect(html).toContain('Annuaire non chargé');
  });
});
