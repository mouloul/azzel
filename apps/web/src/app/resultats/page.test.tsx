import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Story 7.2 — rendu serveur de la page publique /resultats : SSR force-
// dynamic (le client n'est qu'un rafraîchisseur), SEO sobre + noindex (les
// dossards seuls ne sont jamais indexés), comptage ?partage=1 BEST EFFORT
// (3 chargements = 3 visites ; sans paramètre = 0 ; un échec de comptage ne
// touche JAMAIS le rendu), état dégradé base KO (message + assistance, jamais
// d'erreur brute). Isolée par mocks (pattern page.test.tsx / admin course).

const chronoServiceMock = vi.hoisted(() => ({
  getResultatsPublic: vi.fn(),
  compterVisitePartage: vi.fn(),
}));

vi.mock(
  '@/modules/chrono/service',
  () => chronoServiceMock as unknown as typeof import('@/modules/chrono/service'),
);

const assistanceMock = vi.hoisted(() => ({
  readAssistancePhone: vi.fn(() => '+213 555 010 200'),
}));

vi.mock(
  '@/lib/assistance-phone',
  () => assistanceMock as unknown as typeof import('@/lib/assistance-phone'),
);

import ResultatsPage, { dynamic as RESULTATS_DYNAMIC, metadata } from './page';

const RESULTATS = {
  classements: {
    genereA: '2027-03-26T10:00:05.000Z',
    fraicheur: '2027-03-26T10:00:02.000Z',
    libelle: 'Classement provisoire',
    epreuves: [
      {
        epreuveSlug: 'longue',
        epreuveNom: 'La Grande Boucle — 35 km',
        distanceKm: 35,
        heureDepart: '2027-03-26T07:00:00.000Z',
        configure: true,
        lignes: [
          { dossard: 201, rang: 1, tempsMs: 6_000_000, statut: 'arrivé', categorieAge: 'Senior' },
        ],
        abandons: [],
      },
    ],
  },
  derniersArrives: [
    { dossard: 201, epreuveSlug: 'longue', epreuveNom: 'La Grande Boucle — 35 km', tempsMs: 6_000_000 },
  ],
};

async function rendu(params: Record<string, string | string[] | undefined> = {}): Promise<string> {
  const flux = await renderToReadableStream(
    <ResultatsPage searchParams={Promise.resolve(params)} />,
  );
  return await new Response(flux).text();
}

beforeEach(() => {
  chronoServiceMock.getResultatsPublic.mockReset();
  chronoServiceMock.compterVisitePartage.mockReset();
  chronoServiceMock.getResultatsPublic.mockResolvedValue(RESULTATS);
  chronoServiceMock.compterVisitePartage.mockResolvedValue(undefined);
});

describe('page /resultats — SSR vitrine (story 7.2)', () => {
  it('dynamique : force-dynamic (jamais de cache sur une page live)', () => {
    expect(RESULTATS_DYNAMIC).toBe('force-dynamic');
  });

  it('SEO sobre : title/description — noindex (les dossards seuls ne sont jamais indexés) + Open Graph pour les aperçus de partage', () => {
    expect(metadata.title).toBe('Résultats');
    expect(metadata.description).toContain('Classement provisoire');
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.openGraph?.title).toContain('Résultats');
    expect(metadata.openGraph?.description).toContain('Classement provisoire');
  });

  it('jour J : « Classement provisoire » en toutes lettres, classements par épreuve, derniers arrivés, témoin live', async () => {
    const html = await rendu();
    expect(html).toContain('Résultats en direct');
    expect(html).toContain('Classement provisoire');
    expect(html).toContain('La Grande Boucle — 35 km');
    expect(html).toContain('Derniers arrivés');
    expect(html).toContain('resultats-temoin');
    expect(html).toContain('synchronisé il y a');
    const bas = html.toLowerCase();
    expect(bas).not.toContain('officiel');
    expect(bas).not.toContain('temps réel');
  });

  it('registre vouvoyé : aucun tutoiement dans la page publique', async () => {
    const html = await rendu();
    expect(html).not.toMatch(/\b[Tt]on dossier\b|\b[Tt]a course\b|\b[Rr]éessaie\b/);
  });

  it('état vide avec heures configurées : verbatim « Pas encore de partants — départ à --:-- » avant montage (aucun flash serveur)', async () => {
    chronoServiceMock.getResultatsPublic.mockResolvedValue({
      classements: {
        ...RESULTATS.classements,
        fraicheur: null,
        epreuves: RESULTATS.classements.epreuves.map((epreuve) => ({
          ...epreuve,
          lignes: [],
          abandons: [],
        })),
      },
      derniersArrives: [],
    });
    const html = await rendu();
    expect(html).toContain('Pas encore de partants — départ à --:--');
    expect(html).not.toMatch(/Pas encore de partants — départ à \d{2}:\d{2}/);
    expect(html).toContain('Classement provisoire');
  });

  it('état vide sans heure : texte neutre — JAMAIS un départ à 00:00', async () => {
    chronoServiceMock.getResultatsPublic.mockResolvedValue({
      classements: {
        ...RESULTATS.classements,
        epreuves: [
          {
            epreuveSlug: 'sprint',
            epreuveNom: 'Le Sprint — 5 km',
            distanceKm: 5,
            heureDepart: null,
            configure: false,
            lignes: [],
            abandons: [],
          },
        ],
      },
      derniersArrives: [],
    });
    const html = await rendu();
    expect(html).toContain('Les résultats apparaîtront au départ');
    expect(html).not.toContain('00:00');
  });

  it('base indisponible (SSR) : page dégradée message + assistance, jamais d’erreur brute', async () => {
    chronoServiceMock.getResultatsPublic.mockRejectedValue(
      new Error('ECONNREFUSED détails internes'),
    );
    const html = await rendu();
    expect(html).toContain('Les résultats ne sont pas disponibles pour le moment');
    expect(html).toContain('se rafraîchira d’elle-même');
    expect(html).toMatch(/href="tel:\+213/);
    expect(html).toContain('Appelez l’équipe');
    // Jamais l'erreur brute, et le rafraîchisseur reste monté (squelettes).
    expect(html).not.toContain('ECONNREFUSED');
    expect(html).toContain('resultats-squelette');
  });
});

describe('page /resultats — comptage des partages (story 7.2)', () => {
  it('?partage=1 : UNE visite comptée par chargement (best effort, service dédié)', async () => {
    await rendu({ partage: '1' });
    expect(chronoServiceMock.compterVisitePartage).toHaveBeenCalledTimes(1);
  });

  it('trois chargements ?partage=1 : trois comptages (aucun dédoublonnage côté page)', async () => {
    for (const _ of [1, 2, 3]) {
      await rendu({ partage: '1' });
    }
    expect(chronoServiceMock.compterVisitePartage).toHaveBeenCalledTimes(3);
  });

  it('SANS paramètre : AUCUN comptage', async () => {
    await rendu();
    expect(chronoServiceMock.compterVisitePartage).not.toHaveBeenCalled();
  });

  it('?partage=0 (hors URL documentée) : AUCUN comptage', async () => {
    await rendu({ partage: '0' });
    expect(chronoServiceMock.compterVisitePartage).not.toHaveBeenCalled();
  });

  it('comptage en échec : la page reste NORMALE (rendu jamais affecté)', async () => {
    chronoServiceMock.compterVisitePartage.mockRejectedValue(new Error('base KO'));
    const html = await rendu({ partage: '1' });
    expect(html).toContain('Classement provisoire');
    expect(html).toContain('Derniers arrivés');
    expect(html).not.toContain('base KO');
  });

  it('résultats en échec + partage=1 : comptage tenté quand même, en parallèle (indépendant)', async () => {
    chronoServiceMock.getResultatsPublic.mockRejectedValue(new Error('base KO'));
    await rendu({ partage: '1' });
    expect(chronoServiceMock.compterVisitePartage).toHaveBeenCalledTimes(1);
  });
});

describe('page /resultats — section carte (story 7.3, pare-chemin-critique)', () => {
  // Tutoiem* RÉELS (la vitrine vouvoie TOUJOURS) : possessifs + noms de surface,
  // impératifs et pronoms caractéristiques. Contrôlée par canari ci-dessous —
  // une regex qui ne détecte plus rien ne prouve rien.
  const TUTOIEMENT =
    /\b(?:[Tt]on|[Tt]a|[Tt]es)\s+(?:dossard|dossier|course|carte|appareil|scans?|positions?|numéro)|\b[Rr]éessaie\b|\b[Ss]uis\s+(?:le|la)\b|\b[Tt]u\s+(?:peux|as|es|verras|restes|scanne)/;

  it('registre vouvoyé : aucun tutoiement dans la page publique (regex contrôlée par canari)', async () => {
    // Canaris : la regex DOIT attraper des tutoiem* réels.
    expect('Réessaie dans un instant').toMatch(TUTOIEMENT);
    expect('suis le parcours').toMatch(TUTOIEMENT);
    expect('Ta course continue').toMatch(TUTOIEMENT);
    expect('tu peux suivre').toMatch(TUTOIEMENT);
    expect('ton dossard').toMatch(TUTOIEMENT);
    const html = await rendu();
    expect(html).not.toMatch(TUTOIEMENT);
  });

  it('la section « Carte de la course » existe, FERMÉE : bouton « Afficher la carte » seul', async () => {
    const html = await rendu();
    expect(html).toContain('Carte de la course');
    expect(html).toContain('Afficher la carte');
    // Fermée : ni squelette ni conteneur de carte dans le HTML initial.
    expect(html).not.toContain('carte-course-squelette');
    expect(html).not.toContain('carte-course-carte');
  });

  it('AUCUNE référence carto dans le HTML servi (3G : rien ne charge avant le clic)', async () => {
    const html = await rendu();
    const bas = html.toLowerCase();
    expect(bas).not.toContain('leaflet');
    expect(bas).not.toContain('openstreetmap');
    expect(bas).not.toContain('tile.');
    // Aucun chunk JS dédié carto dans le HTML initial.
    expect(html).not.toMatch(/<script[^>]+src="[^"]*carte/);
  });

  it('la carte vit APRÈS les classements : ResultatsLive précède la section carte', async () => {
    const html = await rendu();
    const positionLive = html.indexOf('resultats-live');
    const positionCarte = html.indexOf('carte-course');
    expect(positionLive).toBeGreaterThan(-1);
    expect(positionCarte).toBeGreaterThan(positionLive);
  });
});
