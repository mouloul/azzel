import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 3.3 — rendu serveur de la page PWA volontaires : fiche complète
// (titre, lieu terrain, gros bouton tel:, assistance transmise, email du
// compte) et branche d'erreur avec enveloppe + déconnexion. Isolée par
// mocks (pattern page.test.tsx / routes admin) : session, service missions,
// assistance (env) et navigation.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const missionsServiceMock = vi.hoisted(() => ({
  getMissionsVolontaireState: vi.fn(),
  getAnnuaireEdition: vi.fn(),
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

import { DbUnavailableError } from '@/modules/iam/errors';
import VolontairesPage, { MESSAGE_SCAN_PASSAGE, MESSAGE_SCAN_RETRAIT } from './page';
import { BandeauReconnexion } from './volontaires-pwa';

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const MISSION = {
  id: 'mission-1',
  secteurNom: 'Village',
  secteurLieu: 'Place du village',
  secteurContact: '+213 555 010 203',
  type: 'accueil',
  typeLabel: 'Accueil',
  titre: 'Accueil village',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
  consignes: 'Arrive 15 min avant.\nTiens le stand.',
  couverture: 'couverte',
  couvertureLabel: 'Couverte',
};

const MISSION_GUICHET = {
  ...MISSION,
  id: 'mission-guichet-1',
  type: 'distribution_dossards',
  typeLabel: 'Distribution des dossards',
  titre: 'Guichet dossards',
};

const ETAT = {
  editionNom: 'Édition 2027',
  mesMissions: [MISSION],
  missions: [MISSION],
};

const ANNUAIRE = {
  version: 2,
  editionId: 'edition-1',
  genereA: '2026-10-22T08:00:00.000Z',
  coureurs: [
    // Contrat v2 (story 4.1) : jeton base64url 22 caractères par coureur.
    { dossard: 1, nom: 'Ulahianne', prenom: 'Yani', jeton: 'jeton-coureur-1-aaaaaa' },
    { dossard: 12, nom: 'Cherchée', prenom: 'Iness', jeton: 'jeton-coureur-12-aaaaa' },
  ],
};

async function rendu(
  searchParams?: Promise<Record<string, string | string[]>>,
): Promise<string> {
  const flux = await renderToReadableStream(<VolontairesPage searchParams={searchParams} />);
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  missionsServiceMock.getMissionsVolontaireState.mockReset();
  missionsServiceMock.getAnnuaireEdition.mockReset();
  // Annuaire par défaut pour les tests 3.3 : les tests 3.4 surchargent.
  missionsServiceMock.getAnnuaireEdition.mockResolvedValue(ANNUAIRE);
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_VOLONTAIRE,
  });
});

describe('page /volontaires — rendu serveur PWA (story 3.3)', () => {
  it('fiche complète : titre, lieu terrain, gros bouton tel: du PC, consignes', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('Accueil village');
    expect(html).toContain('Place du village');
    expect(html).toContain('Secteur');
    expect(html).toContain('href="tel:+213555010203"');
    expect(html).toContain('Appeler le PC du secteur');
    expect(html).toContain('Arrive 15 min avant.');
  });

  it('couverture visible côté volontaire (story 3.2) : chaque mission de l’édition porte SON état, horaires à l’heure d’Alger', async () => {
    const vacante = {
      ...MISSION,
      id: 'mission-vacante',
      titre: 'Barrière PK 10',
      couverture: 'vacante',
      couvertureLabel: 'Vacante',
    };
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      missions: [MISSION, vacante],
    });
    const html = await rendu();
    const items = html.match(/<li[^>]*class="volontaires-mission-courte"[^>]*>[\s\S]*?<\/li>/g) ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Accueil village');
    expect(items[0]).toContain('couverture assurée');
    expect(items[0]).not.toContain('vacante');
    expect(items[1]).toContain('Barrière PK 10');
    expect(items[1]).toContain('vacante — besoins volontaires');
    expect(items[1]).not.toContain('couverture assurée');
    // 06:00 Z → 07:00 à Alger (fuseau produit D1), quel que soit le serveur.
    expect(items[0]).toContain('16 mai 2027 à 07:00');
  });

  it('bandeau sync (story 4.5, UX-DR-8) : TOUJOURS dans le rendu nominal — état initial et journal', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('Sync de la file…');
    expect(html).toMatch(/Journal sync \((?:<!-- -->)?0/);
    expect(html).toContain('Envoyer maintenant');
  });

  it('bandeau « session expirée » (composant pur, revue 3.3) : alerte + lien /connexion, la fiche reste en dessous', async () => {
    const flux = await renderToReadableStream(<BandeauReconnexion />);
    const html = await new Response(flux).text();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Ta session a expiré ou a été fermée.');
    expect(html).toContain('Reconnecte-toi');
    // Story 3.1 — reconnexion sur la page UNIQUE /connexion (code par email).
    expect(html).toContain('href="/connexion"');
    expect(html).not.toMatch(/href="\/connexion-/);
    // Plus d'écran plein « Tu es déconnecté » : la fiche n'est jamais remplacée.
    expect(html).not.toContain('Tu es déconnecté');
  });

  it('revue 3.3 — rendu nominal marqué data-az-shell="fiche" (seul shell cacheable par le SW)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('data-az-shell="fiche"');
  });

  it('en-tête : email du compte, édition, assistance transmise, badge synchronisé', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('karim@exemple.dz');
    expect(html).toContain('Édition 2027');
    // Assistance (props → Appeler l'équipe) : numéro formaté tel:.
    expect(html).toContain('href="tel:+213555010200"');
    expect(html).toContain('synchronisé à');
    expect(html).toContain('role="status"');
  });

  it('mission sans contact PC : aucun lien tel: du secteur, pas de lien mort', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [{ ...MISSION, secteurContact: null }],
      missions: [{ ...MISSION, secteurContact: null }],
    });
    const html = await rendu();
    expect(html).not.toContain('Appeler le PC du secteur');
    // L'assistance générale reste le seul numéro tel: de la page.
    const tels = html.match(/href="tel:[^"]+"/g) ?? [];
    expect(tels.length).toBeGreaterThan(0);
    expect(new Set(tels)).toEqual(new Set(['href="tel:+213555010200"']));
  });

  it('service en échec : enveloppe affichée + déconnexion + assistance conservées', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockRejectedValue(new DbUnavailableError());
    const html = await rendu();
    // Enveloppe terrain volontaires.* (revue 3.3), jamais le texte admin.*.
    expect(html).toContain('Connexion indisponible.');
    expect(html).toContain('ta fiche reste lisible hors-ligne');
    expect(html).toContain('Se déconnecter');
    expect(html).toContain('Appeler l’équipe');
    // Page d'erreur : jamais marquée comme shell fiche (anti-empoisonnement SW).
    expect(html).not.toContain('data-az-shell');
  });

  it('garde db-unavailable : message dédié, jamais la fiche', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('Ton espace mission');
    expect(html).not.toContain('data-az-shell');
  });
});

describe('page /volontaires — consommation du socle et hiérarchie (story 10.1)', () => {
  it('fiches mission, annuaire : chrome de carte du socle (.socle-carte)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('socle-carte volontaires-fiche');
    expect(html).toContain('socle-carte volontaires-annuaire');
  });

  it('CTA terrain (tel PC, Démarrer le scan) : actions en pilule du socle (.socle-action)', async () => {
    const missionScan = { ...MISSION, type: 'scan_checkpoint', typeLabel: 'Scan checkpoint', titre: 'Scan km 12' };
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [missionScan],
      missions: [missionScan],
    });
    const html = await rendu();
    expect(html).toContain('socle-action volontaires-tel');
    expect(html).toContain('socle-action volontaires-scan-lien');
  });

  it('chip de couverture : celle du socle (.socle-chip), plus de chip locale', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('class="socle-chip"');
    expect(html).not.toContain('volontaires-chip');
  });

  it('hiérarchie (AC2) : « Ta fiche mission » titre principal, « Toutes les missions » secondaire', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    // La section dominante porte le modificateur principal (24 px / 800).
    expect(html).toMatch(
      /<h2 class="volontaires-titre volontaires-titre--principal">Ta fiche mission<\/h2>/,
    );
    // Les sections secondaires gardent le poids eyebrow, sans le modificateur.
    expect(html).toMatch(/<h2 class="volontaires-titre">Toutes les missions de l’édition<\/h2>/);
    expect(html).not.toMatch(
      /volontaires-titre--principal">Toutes les missions/,
    );
  });

  it('bandeau sync : textes exacts de la story 10.1 verbatim dans le rendu', async () => {
    // « ✓ envoyés — file : 0 » est couvert par bandeau-sync.test.tsx ; ici on
    // verrouille que le bandeau reste dans la page (état initial SSR compris).
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('volontaires-sync');
    expect(html).toContain('Journal sync');
  });
});

describe('page /volontaires — section « Annuaire des coureurs » (story 3.4)', () => {
  it('annuaire initial : badge role=status aria-live=polite « Annuaire prêt — N coureurs »', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    missionsServiceMock.getAnnuaireEdition.mockResolvedValue(ANNUAIRE);
    const html = await rendu();
    expect(html).toContain('Annuaire des coureurs');
    expect(html).toContain('Annuaire prêt — 2 coureurs');
    // Badge annuaire ÉPINGLÉ (pas juste un aria-live quelque part) : la balise
    // ouvrante qui porte « Annuaire prêt » est bien le status poli.
    const position = html.indexOf('Annuaire prêt');
    const ouverture = html.lastIndexOf('<p', position);
    const badge = html.slice(ouverture, position);
    expect(badge).toContain('role="status"');
    expect(badge).toContain('aria-live="polite"');
  });

  it('aucun coureur à dossard : badge « aucun coureur à dossard — rien à précharger »', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    missionsServiceMock.getAnnuaireEdition.mockResolvedValue({ ...ANNUAIRE, coureurs: [] });
    const html = await rendu();
    expect(html).toContain('aucun coureur à dossard — rien à précharger');
  });

  it('annuaire en échec côté serveur : la fiche mission reste rendue, préchargement client tranche', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    missionsServiceMock.getAnnuaireEdition.mockRejectedValue(new Error('sans édition'));
    const html = await rendu();
    expect(html).toContain('Ton espace mission');
    expect(html).toContain('Annuaire des coureurs');
    expect(html).toContain('Annuaire en cours de préchargement');
  });

  it('pas de liste de coureurs affichée : noms jamais rendus, seul l’état est visible', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    missionsServiceMock.getAnnuaireEdition.mockResolvedValue(ANNUAIRE);
    const html = await rendu();
    expect(html).toContain('Annuaire prêt — 2 coureurs');
    expect(html).not.toContain('Ulahianne');
    expect(html).not.toContain('Cherchée');
  });
});

describe('page /volontaires — entrée « Démarrer le scan » (story 4.2)', () => {
  it('mission scan_checkpoint affectée : gros CTA vers /volontaires/scan avec le titre de la mission', async () => {
    const missionScan = { ...MISSION, type: 'scan_checkpoint', typeLabel: 'Scan checkpoint', titre: 'Scan km 12' };
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [missionScan],
      missions: [missionScan],
    });
    const html = await rendu();
    expect(html).toContain('Démarrer le scan');
    expect(html).toContain('href="/volontaires/scan"');
    expect(html).toContain('Scan km 12');
  });

  it('aucune mission scan dans mesMissions : PAS d’entrée scan (le scan reste une mission parmi d’autres)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).not.toContain('Démarrer le scan');
    expect(html).not.toContain('href="/volontaires/scan"');
  });

  it('mission scan publiée mais affectée à un autre : PAS d’entrée scan (mesMissions seul juge)', async () => {
    const missionScan = { ...MISSION, id: 'mission-scan', type: 'scan_checkpoint', titre: 'Scan km 12' };
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [MISSION],
      missions: [MISSION, missionScan],
    });
    const html = await rendu();
    expect(html).not.toContain('href="/volontaires/scan"');
  });
});

describe('page /volontaires — entrée « Scan retrait » (story 4.3)', () => {
  it('mission distribution_dossards affectée : CTA « Scan retrait » vers ?mode=retrait avec le titre de la mission', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [MISSION_GUICHET],
      missions: [MISSION_GUICHET],
    });
    const html = await rendu();
    expect(html).toContain('Scan retrait');
    expect(html).toContain('href="/volontaires/scan?mode=retrait"');
    expect(html).toContain('Guichet dossards');
    // Pas de mission scan_checkpoint : le CTA passages n’apparaît pas.
    expect(html).not.toContain('Démarrer le scan');
    // Guichet pur : intitulé de section dédié, pas le générique checkpoints.
    expect(html).toContain('Retrait des dossards');
    expect(html).not.toContain('Scan des e-dossards');
  });

  it('sans mission distribution_dossards : PAS de CTA retrait (le mode est débloqué par la mission)', async () => {
    const missionScan = { ...MISSION, id: 'mission-scan', type: 'scan_checkpoint', typeLabel: 'Scan checkpoint', titre: 'Scan km 12' };
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [missionScan],
      missions: [missionScan],
    });
    const html = await rendu();
    expect(html).not.toContain('Scan retrait');
    expect(html).not.toContain('mode=retrait');
    // Le CTA passages reste, à côté.
    expect(html).toContain('Démarrer le scan');
  });

  it('volontaire guichet ET scan : les DEUX CTA côte à côte, intitulé générique', async () => {
    const missionScan = { ...MISSION, id: 'mission-scan', type: 'scan_checkpoint', typeLabel: 'Scan checkpoint', titre: 'Scan km 12' };
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [missionScan, MISSION_GUICHET],
      missions: [missionScan, MISSION_GUICHET],
    });
    const html = await rendu();
    expect(html).toContain('Démarrer le scan');
    expect(html).toContain('href="/volontaires/scan"');
    expect(html).toContain('Scan retrait');
    expect(html).toContain('href="/volontaires/scan?mode=retrait"');
    // Les deux modes ensemble : l’intitulé générique couvre les deux.
    expect(html).toContain('Scan des e-dossards');
  });

  it('mission guichet publiée mais affectée à un autre : PAS de CTA retrait', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue({
      ...ETAT,
      mesMissions: [MISSION],
      missions: [MISSION, MISSION_GUICHET],
    });
    const html = await rendu();
    expect(html).not.toContain('mode=retrait');
  });
});

describe('page /volontaires — message du mode retrait refusé (story 4.3)', () => {
  it('?scan=retrait-sans-mission : message affiché UNE SEULE fois, annoncé au lecteur d’écran', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu(Promise.resolve({ scan: 'retrait-sans-mission' }));
    // Unicité : le texte intégral apparaît exactement une fois.
    expect(html.split(MESSAGE_SCAN_RETRAIT).length - 1).toBe(1);
    const position = html.indexOf(MESSAGE_SCAN_RETRAIT);
    const ouverture = html.lastIndexOf('<p', position);
    expect(html.slice(ouverture, position)).toContain('role="status"');
  });

  it('paramètre répété (scan[]=…) : seul le PREMIER élément compte', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu(Promise.resolve({ scan: ['retrait-sans-mission', 'autre'] }));
    expect(html.split(MESSAGE_SCAN_RETRAIT).length - 1).toBe(1);
  });

  it('miroir : le message passages n’est PAS affiché pour la clé retrait', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu(Promise.resolve({ scan: 'retrait-sans-mission' }));
    expect(html).not.toContain(MESSAGE_SCAN_PASSAGE);
  });

  it('sans paramètre : aucun message (fiche ordinaire)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).not.toContain(MESSAGE_SCAN_RETRAIT);
  });
});

describe('page /volontaires — message du mode passages refusé (story 4.4)', () => {
  it('?scan=passage-sans-mission : message affiché UNE SEULE fois, annoncé au lecteur d’écran', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu(Promise.resolve({ scan: 'passage-sans-mission' }));
    expect(html.split(MESSAGE_SCAN_PASSAGE).length - 1).toBe(1);
    const position = html.indexOf(MESSAGE_SCAN_PASSAGE);
    const ouverture = html.lastIndexOf('<p', position);
    expect(html.slice(ouverture, position)).toContain('role="status"');
  });

  it('les DEUX messages restent distincts (jamais d’affichage croisé)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu(Promise.resolve({ scan: 'passage-sans-mission' }));
    expect(html).not.toContain(MESSAGE_SCAN_RETRAIT);
  });

  it('paramètre répété (scan[]=…) : seul le PREMIER élément compte', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu(Promise.resolve({ scan: ['passage-sans-mission', 'autre'] }));
    expect(html.split(MESSAGE_SCAN_PASSAGE).length - 1).toBe(1);
  });

  it('sans paramètre : aucun message (fiche ordinaire)', async () => {
    missionsServiceMock.getMissionsVolontaireState.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).not.toContain(MESSAGE_SCAN_PASSAGE);
  });
});
