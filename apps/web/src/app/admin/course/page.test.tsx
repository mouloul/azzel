import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 5.1 — rendu serveur de la page PC course : cartes de synthèse,
// boards UX-DR-12 (dossard mono + heure locale, séparateurs pointillés via
// CSS), fraîcheur TOUJOURS présente (NFR-5), note « aucun checkpoint
// d'arrivée défini », branches d'erreur. Isolée par mocks (pattern
// page.test.tsx) : session iam + service chrono.
//
// Story 5.2 — bloc alertes hors-délais : lignes intégrales clignotantes,
// actions par ligne (tel: / libellé inactif / abandon), absence du
// bloc quand vide, garde CSS du clignotement borné + reduced-motion.
//
// Story 5.3 — saisie des abandons : bouton d'en-tête, action abandon ACTIVE
// par ligne d'alerte, carte Abandonnés sans note « à venir », formulaire
// inline ABSENT du SSR (ouverture client uniquement).
//
// Story 5.4 — annulation auditable : bouton « … » par ligne de board (aria-
// label complet), dialogue ABSENT du SSR, CSS visible au survol ET au focus.

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
        {
          evenementId: '22222222-3333-4222-8222-2222222222a1',
          dossard: 102,
          horodatageReception: '2027-05-16T07:05:09.000Z',
        },
        {
          evenementId: '22222222-3333-4222-8222-2222222222a2',
          dossard: 101,
          horodatageReception: '2027-05-16T07:01:44.000Z',
        },
      ],
    },
    {
      id: 'cp-arrivee',
      titre: 'Scan arrivée',
      estArrivee: true,
      passages: [
        {
          evenementId: '22222222-3333-4222-8222-2222222222b1',
          dossard: 104,
          horodatageReception: '2027-05-16T09:40:00.000Z',
        },
      ],
    },
  ],
  alertes: [
    {
      dossard: 101,
      checkpointId: 'cp-km12',
      checkpointTitre: 'Scan km 12',
      barriereLe: '2027-05-16T10:00:00.000Z',
      contactSecteur: '+213 555 010 203',
    },
    {
      dossard: 102,
      checkpointId: 'cp-km12',
      checkpointTitre: 'Scan km 12',
      barriereLe: '2027-05-16T10:00:00.000Z',
      contactSecteur: null,
    },
  ],
  fraicheur: '2027-05-16T07:05:09.000Z',
  genereA: '2027-05-16T07:05:12.000Z',
};

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(<AdminCoursePage />);
  return await new Response(flux).text();
}

/**
 * Contenu de la CARTE « Abandonnés » uniquement (du titre à la fermeture du
 * div) : les assertions de la carte ne fuient pas sur le reste de la page
 * (la note sans alerte contient légitimement d'autres formules d'attente).
 */
function carteAbandons(html: string): string {
  const debut = html.indexOf('Abandonnés');
  expect(debut).toBeGreaterThanOrEqual(0);
  const fin = html.indexOf('</div>', debut);
  return html.slice(debut, fin);
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

describe('page /admin/course — bloc alertes hors-délais (story 5.2)', () => {
  it('bloc danger : lignes intégrales par alerte, tri dossard croissant, heure en attente avant montage', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('course-alertes');
    // React insère un commentaire entre segments : « Alertes hors-délais (2) ».
    expect(html).toMatch(/Alertes hors-délais \(<!-- -->2<!-- -->\)/);
    // Texte intégral (UX-DR-12 : jamais la couleur seule) — l'heure locale
    // n'est calculée qu'après montage client (emplacement --:--, calque board).
    expect(html).toContain('⚠ Dossard 101 — pas vu à Scan km 12 depuis --:--');
    expect(html).toContain('⚠ Dossard 102 — pas vu à Scan km 12 depuis --:--');
    // Tri dossard croissant : 101 avant 102.
    expect(html.indexOf('Dossard 101 — pas vu')).toBeLessThan(html.indexOf('Dossard 102 — pas vu'));
  });

  it('actions par ligne : tel: du secteur, libellé inactif sans contact, abandon ACTIF (story 5.3)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    // Contact renseigné (ligne 101) : lien tel: normalisé (espaces retirés).
    expect(html).toContain('href="tel:+213555010203"');
    expect(html).toContain('Appeler le secteur');
    // Contact absent (ligne 102) : libellé inactif, jamais de lien mort.
    expect(html).toContain('contact du secteur non renseigné');
    // Abandon : bouton ACTIF (plus jamais disabled « bientôt disponible »),
    // un par ligne d'alerte — l'ouverture préremplie vit côté client.
    expect(html).not.toContain('bientôt disponible');
    const occurrences = html.match(/<button[^>]*>Saisir l’abandon<\/button>/g) ?? [];
    expect(occurrences.length).toBe(ETAT.alertes.length);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Saisir l’abandon/);
  });

  it('aucune alerte : le bloc est ABSENT, une note discrète le remplace (batterie = suivi GPS à venir)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue({ ...ETAT, alertes: [] });
    const html = await rendu();
    expect(html).not.toContain('course-alertes');
    expect(html).not.toContain('pas vu à');
    expect(html).toContain('course-sans-alerte');
    expect(html).toContain('Aucune alerte hors-délais');
    expect(html).toContain('suivi GPS');
  });

  it('CSS : clignotement borné (période ≥ 1 s, steps) et coupé sous prefers-reduced-motion', () => {
    const css = readFileSync(fileURLToPath(new URL('./course.css', import.meta.url)), 'utf8');
    // Période 1 s (≥ 1 s : ≤ 1 flash/s), deux paliers nets (steps) — espaces
    // tolérés autour des jetons (reformatage mineur du CSS).
    expect(css).toMatch(/animation:\s*course-alertes-clignote\s+1s\s+steps\(\s*2/);
    // reduced-motion : animation coupée pour le bloc alertes.
    const blocReduit = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(blocReduit).toMatch(/\.course-alertes\s*\{\s*animation:\s*none/);
  });
});

describe('page /admin/course — saisie des abandons (story 5.3)', () => {
  it('bouton « Saisir un abandon » dans l’en-tête, à côté de la fraîcheur', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('Saisir un abandon');
    expect(html).toContain('course-entete');
    expect(html).toContain('course-bouton-abandon');
  });

  it('carte Abandonnés : compteur réel, note « à venir » retirée (même à 0)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).toContain('Abandonnés');
    expect(carteAbandons(html)).not.toContain('à venir');
    // Compteur réel dès qu'un abandon existe.
    chronoServiceMock.getEtatCourse.mockResolvedValue({ ...ETAT, abandones: 2, enCourse: 33 });
    const htmlAbandons = await rendu();
    expect(htmlAbandons).toContain('Abandonnés');
    expect(carteAbandons(htmlAbandons)).not.toContain('à venir');
  });

  it('formulaire inline : ABSENT du rendu serveur (ouverture client uniquement)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).not.toContain('course-abandon"');
    expect(html).not.toContain('Enregistrer l’abandon');
  });

  it('CSS : blocs formulaire/succes sans animation propre (seul le bloc alertes clignote)', () => {
    const css = readFileSync(fileURLToPath(new URL('./course.css', import.meta.url)), 'utf8');
    expect(css).toMatch(/\.course-entete/);
    expect(css).toMatch(/\.course-abandon\{/);
    expect(css).toMatch(/\.course-abandon-succes/);
    const blocAbandon = css.slice(css.indexOf('.course-abandon{'), css.indexOf('@media'));
    expect(blocAbandon).not.toMatch(/animation/);
  });
});

describe('page /admin/course — annulation auditable des passages (story 5.4)', () => {
  it('bouton « … » par ligne de board, aria-label complet (dossard + checkpoint)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    // Un bouton d'annulation par passage affiché (3 passages dans ETAT).
    const occurrences = html.match(/class="course-ligne-annuler"/g) ?? [];
    expect(occurrences.length).toBe(3);
    // aria-label complet : la cible se porte à elle-même.
    expect(html).toContain('aria-label="Annuler le passage — dossard 102 à Scan km 12"');
    expect(html).toContain('aria-label="Annuler le passage — dossard 101 à Scan km 12"');
    expect(html).toContain('aria-label="Annuler le passage — dossard 104 à Scan arrivée"');
  });

  it('les lignes restent SANS navigation : aucun href vers /admin/course/{dossard}', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).not.toContain('href="/admin/course/101');
    expect(html).not.toContain('href="/admin/course/102');
    // Le corps du bouton est « … » (discret), le libellé complet vit dans
    // l'aria-label.
    expect(html).toContain('>…</button>');
  });

  it('dialogue d’annulation : ABSENT du rendu serveur (ouverture client uniquement)', async () => {
    chronoServiceMock.getEtatCourse.mockResolvedValue(ETAT);
    const html = await rendu();
    expect(html).not.toContain('course-annulation"');
    expect(html).not.toContain('Annuler ce passage');
  });

  it('CSS : bouton visible au survol ET au focus clavier (opacity, jamais display), tactile toujours visible', () => {
    const css = readFileSync(fileURLToPath(new URL('./course.css', import.meta.url)), 'utf8');
    expect(css).toMatch(/\.course-ligne-annuler\{[^}]*opacity:\s*0/);
    // La déclaration opacity:1 est ÉPINGLÉE sur la règle groupée
    // :hover,:focus-within (le survol ne peut pas la perdre en refactor).
    expect(css).toMatch(
      /\.course-board-ligne:hover\s+\.course-ligne-annuler,\s*\.course-board-ligne:focus-within\s+\.course-ligne-annuler\{opacity:1\}/,
    );
    expect(css).toMatch(/@media \(hover:none\)\{\.course-ligne-annuler\{opacity:1\}\}/);
    // Jamais display:none : le bouton reste focusable et lisible (a11y).
    expect(css).not.toMatch(/course-ligne-annuler[^}]*display:\s*none/);
    // Le dialogue existe (calque abandon), sans animation propre.
    expect(css).toMatch(/\.course-annulation\{/);
    expect(css).toMatch(/\.course-annulation-cible/);
  });

  it('CSS : reduced-motion coupe AUSSI la transition du bouton « … » (clignotement alertes compris)', () => {
    const css = readFileSync(fileURLToPath(new URL('./course.css', import.meta.url)), 'utf8');
    const blocReduit = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    expect(blocReduit).toMatch(/\.course-alertes\s*\{\s*animation:\s*none/);
    expect(blocReduit).toMatch(/\.course-ligne-annuler\s*\{\s*transition:\s*none/);
  });
});
