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
    titre: 'Trail long — 35 km',
    corps:
      'L’épreuve phare, au départ du stade Agni Lhoudh.\n\nDénivelé positif : à confirmer par le comité.\nRavitaillements : à confirmer par le comité.',
    epreuve: {
      slug: 'longue',
      nom: 'La Longue — 35 km',
      distanceKm: 35,
      gpxUrl: 'https://files.exemple.dz/longue.gpx',
    },
  },
  {
    slug: 'parcours-moyenne',
    titre: 'Trail moyen — 12 km',
    corps: 'Une distance plus courte, le même jour.<script>alert("xss")</script>',
    epreuve: {
      slug: 'moyenne',
      nom: 'La Moyenne — 12 km',
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

  it('titre de page, eyebrow, et un bloc par épreuve avec distance', () => {
    expect(html).toContain('id="titre-parcours"');
    expect(html).toContain('Les parcours');
    expect(html).toContain('Trail long — 35 km');
    expect(html).toContain('Trail moyen — 12 km');
    expect(html).toContain('>35 km<');
    expect(html).toContain('>12 km<');
  });

  it('corps : paragraphes séparés par lignes vides, sauts de ligne conservés', () => {
    expect(html).toContain(
      'L’épreuve phare, au départ du stade Agni Lhoudh.',
    );
    expect(html).toContain('Dénivelé positif : à confirmer par le comité.');
    expect(html).toContain('Ravitaillements : à confirmer par le comité.');
    // Saut simple dans un paragraphe : rendu explicite (<br/>), pas fusionné.
    expect(html).toMatch(/Dénivelé positif[^<]*<br\/?>/);
  });

  it('citation « Aman d laman » exclusivement aux ravitaillements, source Hanoteau 1867, une seule fois', () => {
    expect(html).toContain('Aman d laman — l’eau est sûre');
    expect(html).toContain('Sagesse kabyle (Hanoteau, 1867)');
    expect((html.match(/Aman d laman/g) ?? []).length).toBe(1);
    expect(html.indexOf('Aman d laman')).toBeGreaterThan(html.indexOf('titre-ravitaillements'));
  });

  it('GPX différé : <details> fermé par défaut, bouton Voir le tracé GPX, lien révélé au clic', () => {
    const details = html.match(/<details[^>]*>/)?.[0] ?? '';
    expect(details).not.toBe('');
    expect(details).not.toContain('open');
    expect(html).toContain('Voir le tracé GPX');
    expect(html).toContain('href="https://files.exemple.dz/longue.gpx"');
    expect(html).toContain('Télécharger le tracé GPX');
    // Zéro octet GPX au chargement initial : ni script, ni iframe, ni carte.
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('leaflet');
    expect(html).not.toContain('maplibre');
  });

  it('sans GPX (ou URL non https échappée en base) : pas de lien mort, « Tracé à venir »', () => {
    // La Moyenne porte une URL javascript: (stockée hors application) : la
    // garde isHttpsUrl du rendu la refuse — défense en profondeur anti-XSS.
    expect(html).toContain('Tracé à venir');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('alert(document.domain)');
    expect((html.match(/<details/g) ?? []).length).toBe(1);
  });

  it('HTML injecté dans le corps : affiché échappé, rien d’exécuté', () => {
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
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
    expect(vide).not.toContain('aa-card');
    expect(vide).not.toContain('aa-parcours');
    expect(vide).not.toContain('Aman d laman');
    expect(vide).not.toContain('Tracé à venir');
    // État vide explicite (pas de conteneur vide, pas de promesse « ici »).
    expect(vide).toContain('seront publiés après');
  });
});
