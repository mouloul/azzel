import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Les pages publiques relisent les contenus en base à chaque requête (story
// 2.4, « bascule sans dev ») : la lecture est isolée par mock, le rendu est
// vérifié sur le HTML streamé (composants asynchrones).
const contenusServiceMock = vi.hoisted(() => ({
  getParcoursPage: vi.fn(),
}));

vi.mock(
  '@/modules/contenus/service',
  () =>
    contenusServiceMock as unknown as typeof import('@/modules/contenus/service'),
);

import ParcoursPage, { dynamic as PARCOURS_DYNAMIC } from './page';

const BLOCS = [
  {
    slug: 'parcours-longue',
    titre: 'Trail long',
    corps:
      'L’épreuve phare, au départ du stade Agni Lhoudh.\n\nDénivelé positif : à confirmer par le comité.\nRavitaillements : à confirmer par le comité.',
    epreuve: {
      slug: 'longue',
      nom: 'La Grande Boucle',
      distanceKm: 28,
      gpxUrl: 'https://files.exemple.dz/longue.gpx',
    },
  },
  {
    slug: 'parcours-moyenne',
    titre: 'Trail moyen',
    corps: 'Une distance plus courte, le même jour.<script>alert("xss")</script>',
    epreuve: {
      slug: 'moyenne',
      nom: 'La Boucle Moyenne',
      distanceKm: 12,
      gpxUrl: 'javascript:alert(document.domain)',
    },
  },
];

async function rendu(blocs = BLOCS): Promise<string> {
  contenusServiceMock.getParcoursPage.mockResolvedValue({ blocs });
  const flux = await renderToReadableStream(<ParcoursPage />);
  return await new Response(flux).text();
}

describe('page /parcours — rendu public', () => {
  let html = '';

  beforeAll(async () => {
    html = await rendu();
  });

  it('dynamique : les contenus sont relus à chaque requête (force-dynamic épinglé)', () => {
    // Supprimer l'export `dynamic` (retour au statique) casserait le
    // « reflété au rechargement » : ce test devient rouge.
    expect(PARCOURS_DYNAMIC).toBe('force-dynamic');
  });

  it('titre de page en h1, sélecteur d’épreuve et une fiche par épreuve (vue de l’accueil)', () => {
    expect(html).toMatch(/<h1[^>]*id="titre-parcours"/);
    expect(html).toContain('Les parcours');
    expect(html).toContain('Choisir l’épreuve');
    expect(html).toContain('Le Grand Trail d’Aït Aïssi');
    expect(html).toContain('La Boucle Moyenne');
    // Fiche technique rédigée depuis le relevé : relief, effort, pentes.
    expect(html).toContain('Relief');
    expect(html).toContain('km-effort');
    expect(html).toContain('Pentes maximales mesurées');
    expect((html.match(/<article[^>]*data-panneau=/g) ?? []).length).toBe(2);
    // Distance du RELEVÉ, comme sur l'accueil (même relevé pour les deux épreuves).
    expect(html).toContain('28');
    expect(html).not.toContain('>35 km<');
  });

  it('pas de lien « Voir le détail des parcours » : la page est ce détail', () => {
    expect(html).not.toContain('Voir le détail des parcours');
    expect(html).not.toContain('href="/parcours"');
  });

  it('plus de citation kabyle : la section ravitaillements est portée par ses points', () => {
    expect(html).not.toContain('Aman d laman');
    expect(html).not.toContain('Hanoteau');
    expect(html).toContain('id="titre-ravitaillements"');
  });

  it('ravitaillements détaillés par épreuve : km 8, 15, 21, 26 puis km 6,1 et 10,4', () => {
    for (const km of ['8', '15', '21', '26', '6,1', '10,4']) {
      expect(html).toContain(`<span class="aa-chip aa-chip--phare">Km ${km}</span>`);
    }
    expect(html).toContain('Plus long tronçon sans ravitaillement');
    // Retour comité 2027 : six postes distincts, quatre + deux.
    expect((html.match(/class="socle-carte aa-ravito"/g) ?? []).length).toBe(6);
    expect(html).toContain('id="titre-ravitos-longue"');
    expect(html).toContain('id="titre-ravitos-moyenne"');
    expect(html).toContain('Boire et manger en course');
    expect(html).toContain('à confirmer par le comité');
  });

  it('GPX : lien https de la fiche conservé, URL non https jamais en href', () => {
    expect(html).toContain('href="https://files.exemple.dz/longue.gpx"');
    expect(html).toContain('Télécharger le tracé GPX');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('alert(document.domain)');
  });

  it('rien du moteur de carte au chargement initial', () => {
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('leaflet');
    expect(html).not.toContain('maplibre');
  });

  it('liens croisés vers /region et l’accueil', () => {
    expect(html).toContain('href="/region"');
    expect(html).toContain('href="/"');
  });
});

describe('page /parcours — sans contenu (seed absent ou base indisponible)', () => {
  it('coquille statique rendue, aucune carte vide ni citation hors contexte', async () => {
    const vide = await rendu([]);
    expect(vide).toContain('id="titre-parcours"');
    expect(vide).not.toContain('data-panneau');
    expect(vide).not.toContain('Aman d laman');
    // État vide explicite (pas de conteneur vide, pas de promesse « ici »).
    expect(vide).toContain('seront publiés après');
  });
});
