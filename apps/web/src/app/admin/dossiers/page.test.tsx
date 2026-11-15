import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 7.4 — SSR minimal de /admin/dossiers : la page porte la passerelle
// vers /admin/rapports (processus J-10 — la commande part des validés que
// cette page sert). Isolée par mocks (pattern page.test.tsx) : session iam +
// service inscriptions.

const sessionMock = vi.hoisted(() => ({
  requireRolePage: vi.fn(),
}));

vi.mock(
  '@/modules/iam/session',
  () => sessionMock as unknown as typeof import('@/modules/iam/session'),
);

const inscriptionsServiceMock = vi.hoisted(() => ({
  getDossiersState: vi.fn(),
}));

vi.mock(
  '@/modules/inscriptions/service',
  () => inscriptionsServiceMock as unknown as typeof import('@/modules/inscriptions/service'),
);

// Le bouton d'attribution des dossards est un composant client Next (router) :
// hors de propos ici — la page est testée pour ses LIENS (story 7.4).
vi.mock('./attribution-dossards', () => ({
  AttributionDossards: () => null,
}));

import { LIST_COUREURS_LIMIT } from '@/modules/inscriptions/domain';

import AdminDossiersPage, { dynamic as DOSSIERS_DYNAMIC } from './page';

const SESSION_ORGANISATEUR = {
  accountId: 'account-pc',
  organisationId: 'org-1',
  email: 'pc@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const DOSSIERS = [
  {
    coureurId: 'coureur-1',
    prenom: 'Amina',
    nom: 'Belkacem',
    email: 'amina@exemple.dz',
    epreuveNom: 'La Grande Boucle',
    dossard: 101,
    status: 'validé',
    refusalReason: null,
    hasActivePreuve: true,
    preuveDepositedAt: '2027-03-01T09:00:00.000Z',
    acceptationsCompletes: true,
    createdAt: '2027-02-20T10:00:00.000Z',
  },
  {
    coureurId: 'coureur-2',
    prenom: 'Yacine',
    nom: 'Haddad',
    email: 'yacine@exemple.dz',
    epreuveNom: 'La Boucle Moyenne',
    dossard: null,
    status: 'refusé',
    refusalReason: 'Preuve illisible',
    hasActivePreuve: false,
    preuveDepositedAt: null,
    acceptationsCompletes: false,
    createdAt: '2027-02-21T11:00:00.000Z',
  },
  {
    coureurId: 'coureur-3',
    prenom: 'Nina',
    nom: 'Cherif',
    email: 'nina@exemple.dz',
    epreuveNom: 'La Grande Boucle',
    dossard: 103,
    status: 'en constitution',
    refusalReason: null,
    hasActivePreuve: false,
    preuveDepositedAt: null,
    acceptationsCompletes: false,
    createdAt: '2027-02-22T12:00:00.000Z',
  },
  {
    // Preuve déposée, rien d'autre à faire côté coureur : le dossier attend
    // l'organisation. Sans dossard ni acceptation manquante pour ne bouger
    // aucun des autres compteurs.
    coureurId: 'coureur-4',
    prenom: 'Sofiane',
    nom: 'Mebarki',
    email: 'sofiane@exemple.dz',
    epreuveNom: 'La Grande Boucle',
    dossard: null,
    status: 'en validation',
    refusalReason: null,
    hasActivePreuve: true,
    preuveDepositedAt: '2027-02-23T09:00:00.000Z',
    acceptationsCompletes: true,
    createdAt: '2027-02-23T08:00:00.000Z',
  },
  {
    // Expiré sans acceptations : pas complétable en l'état, hors compteur.
    coureurId: 'coureur-5',
    prenom: 'Lyes',
    nom: 'Hamdi',
    email: 'lyes@exemple.dz',
    epreuveNom: 'La Boucle Moyenne',
    dossard: null,
    status: 'expirée',
    refusalReason: null,
    hasActivePreuve: false,
    preuveDepositedAt: null,
    acceptationsCompletes: false,
    createdAt: '2027-02-24T08:00:00.000Z',
  },
  {
    // Liste d'attente sans acceptations : ne peut pas accepter, hors compteur.
    coureurId: 'coureur-6',
    prenom: 'Nora',
    nom: 'Saadi',
    email: 'nora@exemple.dz',
    epreuveNom: 'La Boucle Moyenne',
    dossard: null,
    status: 'liste d’attente',
    refusalReason: null,
    hasActivePreuve: false,
    preuveDepositedAt: null,
    acceptationsCompletes: false,
    createdAt: '2027-02-25T08:00:00.000Z',
  },
];

async function rendu(): Promise<string> {
  const flux = await renderToReadableStream(
    <AdminDossiersPage searchParams={Promise.resolve({})} />,
  );
  return await new Response(flux).text();
}

beforeEach(() => {
  sessionMock.requireRolePage.mockReset();
  sessionMock.requireRolePage.mockResolvedValue({
    status: 'authenticated',
    session: SESSION_ORGANISATEUR,
  });
  inscriptionsServiceMock.getDossiersState.mockReset();
  inscriptionsServiceMock.getDossiersState.mockResolvedValue({
    edition: {
      id: 'edition-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: '2027-03-26',
      registrationClosesAt: '2027-03-16T22:59:59.000Z',
      registrationOpen: false,
    },
    dossiers: [],
    hasMore: false,
  });
});

describe('page /admin/dossiers — rendu serveur', () => {
  it('dynamique : force-dynamic', () => {
    expect(DOSSIERS_DYNAMIC).toBe('force-dynamic');
  });

  it('liste vide : message dédié + lien J-10 vers /admin/rapports (story 7.4)', async () => {
    const html = await rendu();
    expect(html).toContain('Aucun coureur inscrit pour le moment.');
    expect(html).toContain('href="/admin/rapports"');
    expect(html).toContain('prépare la commande t-shirts et médailles depuis les rapports');
  });

  it('lien historique vers le PC course conservé, la page ne casse pas', async () => {
    const html = await rendu();
    expect(html).toContain('href="/admin/course"');
    // React insère un commentaire entre segments du titre composé.
    expect(html).toMatch(/Dossiers<!-- --> — Édition 2027/);
  });

  it('base KO : écran AdminIndisponible', async () => {
    sessionMock.requireRolePage.mockResolvedValue({ status: 'db-unavailable' });
    const html = await rendu();
    expect(html).toContain('Connexion indisponible.');
    expect(html).not.toContain('/admin/rapports');
  });
});

describe('page /admin/dossiers — gabarit tableau commun (story 10.3)', () => {
  beforeEach(() => {
    inscriptionsServiceMock.getDossiersState.mockResolvedValue({
      edition: {
        id: 'edition-1',
        slug: '2027',
        nom: 'Édition 2027',
        dateCourse: '2027-03-26',
        registrationClosesAt: '2027-03-16T22:59:59.000Z',
        registrationOpen: false,
      },
      dossiers: DOSSIERS,
      hasMore: false,
    });
  });

  it('tableau sur .socle-table dans un conteneur .table-wrap (défilement horizontal)', async () => {
    const html = await rendu();
    expect(html).toContain('class="table-wrap"');
    expect(html).toContain('class="socle-table table-dossiers"');
  });

  it('en-têtes associés : chaque colonne porte scope="col"', async () => {
    const html = await rendu();
    for (const colonne of ['Coureur', 'Épreuve', 'Dossard', 'Statut', 'Preuve', 'Acceptations', 'Inscrit le']) {
      expect(html).toMatch(new RegExp(`<th[^>]*scope="col"[^>]*>\\s*${colonne}`));
    }
  });

  it('statuts en pastille du socle : point + LIBELLÉ, jamais la couleur seule', async () => {
    const html = await rendu();
    expect(html).toContain('socle-pastille--succes');
    expect(html).toContain('socle-pastille--danger');
    expect(html).toContain('socle-pastille--attention');
    expect(html.match(/socle-pastille-point/g)?.length).toBe(DOSSIERS.length);
    // Le libellé textuel porte le sens dans tous les cas.
    expect(html).toContain('Validé');
    expect(html).toContain('Refusé');
    // Les deux attentes se disent par qui doit agir : le coureur (en
    // constitution) ou l'organisation (en validation).
    expect(html).toContain('En attente de justificatif de paiement');
    expect(html).toContain('En attente de validation par l’organisation');
    expect(html).not.toContain('En constitution');
    // Le motif de refus reste affiché sous la pastille.
    expect(html).toContain('Preuve illisible');
  });

  it('dossards et heures en monospace aligné à droite (.socle-num sur th et td)', async () => {
    const html = await rendu();
    expect(html).toMatch(/<th[^>]*class="socle-num"[^>]*>\s*Dossard/);
    expect(html).toMatch(/<th[^>]*class="socle-num"[^>]*>\s*Inscrit le/);
    expect(html).toMatch(/<td[^>]*class="socle-num"[^>]*>.*dossard-numero/s);
  });
});

describe('page /admin/dossiers — compteurs de tête de page (story 10.3)', () => {
  beforeEach(() => {
    inscriptionsServiceMock.getDossiersState.mockResolvedValue({
      edition: {
        id: 'edition-1',
        slug: '2027',
        nom: 'Édition 2027',
        dateCourse: '2027-03-26',
        registrationClosesAt: '2027-03-16T22:59:59.000Z',
        registrationOpen: false,
      },
      dossiers: DOSSIERS,
      hasMore: false,
    });
  });

  it('cinq compteurs lisibles sans survol, chiffres exacts, libellés distincts', async () => {
    const html = await rendu();
    expect(html).toContain('dossiers-compteurs');
    // 1 validé, 1 en constitution, 1 en validation (file « à examiner »),
    // 1 acceptation manquante (M1 : seuls les dossiers en constitution
    // comptent — refusé, expiré et liste d'attente incomplets de la fixture
    // SORTENT du compteur), 2 dossards.
    expect(html).toMatch(/Validés<\/dt><dd[^>]*>1</);
    expect(html).toMatch(/En attente de justificatif<\/dt><dd[^>]*>1</);
    expect(html).toMatch(/À examiner \(en validation\)<\/dt><dd[^>]*>1</);
    expect(html).toMatch(/Acceptations manquantes<\/dt><dd[^>]*>1</);
    expect(html).toMatch(/Dossards attribués<\/dt><dd[^>]*>2</);
  });

  it('aucun filtre de statut : les compteurs ne sont PAS des liens (pas de lien mort)', async () => {
    const html = await rendu();
    const compteurs = html.slice(html.indexOf('dossiers-compteurs'), html.indexOf('</dl>'));
    expect(compteurs).not.toContain('<a ');
    expect(compteurs).not.toContain('href');
  });

  it('liste complète : aucune réserve sur le périmètre compté', async () => {
    const html = await rendu();
    expect(html).not.toContain('Comptages sur la liste affichée');
  });

  it('liste tronquée : le périmètre compté est dit (hasMore) — limite lue depuis la constante (M2)', async () => {
    inscriptionsServiceMock.getDossiersState.mockResolvedValue({
      edition: null,
      dossiers: DOSSIERS,
      hasMore: true,
    });
    const html = await rendu();
    expect(html).toContain('Comptages sur la liste affichée');
    expect(html).toContain(`tronquée à ${LIST_COUREURS_LIMIT} dossiers`);
    // React coupe les segments du texte composé par des commentaires.
    expect(html).toMatch(new RegExp(`${LIST_COUREURS_LIMIT}(<!-- -->)? maximum`));
  });
});
