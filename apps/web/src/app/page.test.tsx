import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToReadableStream } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';


// L’accueil lit la section partenaires en base (dynamique, story 2.3) : le
// composant est asynchrone — rendu via renderToReadableStream (l’API statique
// synchro ne supporte pas les composants asynchrones). Cette lecture est
// isolée par mock ; chaque mode a sa suite dédiée dans
// section-partenaires.test.tsx.
const sponsorsServiceMock = vi.hoisted(() => ({
  getPartenairesSection: vi.fn(),
}));

vi.mock(
  '@/modules/sponsors/service',
  () =>
    sponsorsServiceMock as unknown as typeof import('@/modules/sponsors/service'),
);

// Story 9.3 : la section parcours de l’accueil lit les épreuves via le
// contrat dédié (lui-même branché sur getParcoursPage — voir
// section-parcours.test.tsx pour le rendu complet, vues actuelle et épopée 11).
const sectionParcoursMock = vi.hoisted(() => ({
  getSectionParcours: vi.fn(),
}));

vi.mock(
  '@/modules/contenus/section-parcours',
  () =>
    sectionParcoursMock as unknown as typeof import('@/modules/contenus/section-parcours'),
);

import HomePage, { revalidate as ACCUEIL_REVALIDATE } from './page';

const VUE_PARCOURS_ACCUEIL = {
  epreuves: [
    {
      slug: 'longue',
      nom: 'La Longue — 35 km',
      distanceKm: 35,
      gpxUrl: 'https://files.exemple.dz/longue.gpx',
      metriques: null,
      pointsDePassage: null,
    },
    {
      slug: 'moyenne',
      nom: 'La Moyenne — 12 km',
      distanceKm: 12,
      gpxUrl: null,
      metriques: null,
      pointsDePassage: null,
    },
  ],
};

let HTML_ACCUEIL = '';

beforeAll(async () => {
  sponsorsServiceMock.getPartenairesSection.mockResolvedValue(null);
  sectionParcoursMock.getSectionParcours.mockResolvedValue(VUE_PARCOURS_ACCUEIL);
  HTML_ACCUEIL = await renduAccueil();
});

async function renduAccueil(): Promise<string> {
  const flux = await renderToReadableStream(
    <HomePage />,
  );
  return await new Response(flux).text();
}

describe('accueil vitrine — rendu statique', () => {
  it('plus de mention d’égide sur l’accueil (retirée en recette le 04/11/2026)', () => {
    expect(HTML_ACCUEIL).not.toContain('égide');
  });

  it('hero : bandeau date, titre, lieu, CTA S’inscrire vers /connexion?parcours=inscription', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('2ᵉ édition');
    expect(html).toContain('Printemps 2027');
    expect(html).toContain('Week-end Sportif');
    expect(html).toContain('Aït Aïssi');
    expect(html).toContain('stade Agni Lhoudh');
    expect(html).toContain('Yakouren');
    expect(html).toContain('href="/connexion?parcours=inscription"');
    expect(html).toContain('S’inscrire');
  });

  it('hero : la date exacte reste masquee tant que le comite ne l’a pas annoncee', () => {
    const html = HTML_ACCUEIL;
    expect(html).not.toContain('26 mars');
    expect(html).toContain('printemps 2027');
  });

  it('hero : photo eager + fetchpriority high (LCP), dimensions alignées sur la variante 640', () => {
    const html = HTML_ACCUEIL;
    const hero = html.match(/<img[^>]*data-hero-photo[^>]*>/)?.[0] ?? '';
    expect(hero).not.toBe('');
    expect(hero).toContain('loading="eager"');
    expect(hero).toMatch(/fetchpriority="high"/i);
    expect(hero).toContain('width="640"');
    expect(hero).toContain('height="360"');
    expect(hero).toContain(
      'src="/charte/photos-2026/aitaissi-2026-ligne-depart-640.webp"',
    );
  });

  it('hero : art direction <picture> — 1280 réservé aux écrans ≥ 700 px, pas de srcset mobile', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('media="(min-width: 700px)"');
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-ligne-depart-1280\.webp"/i,
    );
    expect(html).not.toContain('ligne-depart-640.webp 640w');
    expect(html).not.toContain('ligne-depart-1280.webp 1280w');
  });

  it('chiffres officiels 2026 exacts, jamais additionnés ni inventés', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('>279<');
    expect(html).toContain('>222<');
    expect(html).toContain('>214<');
    expect(html).toContain('>116<');
    expect(html).toContain('dont 36 femmes');
  });

  it('épreuves 2027 : trail long 35 km et trail moyen 12 km', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('Trail long — 35 km');
    expect(html).toContain('Trail moyen — 12 km');
    expect(html).toContain('Épreuve phare');
  });

  it('navigation sobre : liens texte /parcours et /region dans la section épreuves (story 2.4)', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('href="/parcours"');
    expect(html).toContain('href="/region"');
    expect(html.indexOf('href="/parcours"')).toBeGreaterThan(html.indexOf('titre-epreuves-2027'));
    expect(html.indexOf('href="/region"')).toBeGreaterThan(html.indexOf('titre-epreuves-2027'));
  });

  it('contact : bouton Appeler l’équipe (tel:) présent dans le hero et la section contact', () => {
    const html = HTML_ACCUEIL;
    expect(html).toContain('Appeler l’équipe');
    expect(html.match(/Appeler l’équipe/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/href="tel:\+213/);
  });

  it('photos de section : lazy + fetchpriority low, alts descriptifs, 1280 via <picture>', () => {
    const html = HTML_ACCUEIL;
    // La photo hero (ligne de départ) n'est pas reprise dans la galerie.
    const gallery = html.match(
      /<img[^>]*(celebration-montagne|arrivee-groupe-medailles)[^>]*>/g,
    );
    expect((html.match(/<img[^>]*ligne-depart[^>]*>/g) ?? []).length).toBe(1);
    expect(gallery?.length).toBe(2);
    for (const img of gallery ?? []) {
      expect(img).toContain('loading="lazy"');
      expect(img).toMatch(/fetchpriority="low"/i);
      expect(img).not.toMatch(/srcset/i);
    }
    expect(html).toMatch(/alt="[^"]*célébration[^"]*2026"/i);
    expect(html).toMatch(/alt="[^"]*arrivée[^"]*2026"/i);
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-celebration-montagne-1280\.webp"/i,
    );
    expect(html).toMatch(
      /srcset="\/charte\/photos-2026\/aitaissi-2026-arrivee-groupe-medailles-1280\.webp"/i,
    );
  });

  it('aucune mention interdite : « à confirmer », objectif 2027 chiffré', () => {
    const html = HTML_ACCUEIL.toLowerCase();
    expect(html).not.toContain('à confirmer');
    expect(html).not.toContain('objectif');
    expect(html).not.toContain('>600<');
  });
});

describe('accueil vitrine — hero plein écran (modèle UTMB)', () => {
  const CSS = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');

  function regle(selecteur: string): string {
    const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bloc = CSS.match(new RegExp(`^${echappe}\\s*\\{([^}]*)\\}`, 'm'))?.[1];
    if (bloc === undefined) {
      throw new Error(`règle ${selecteur} absente de globals.css`);
    }
    return bloc;
  }

  it('structure : section plein écran, titre, crête, rail de chiffres clés (date + épreuves), méta, actions', () => {
    const html = HTML_ACCUEIL;
    const debut = html.indexOf('class="aa-hero aa-hero--plein"');
    expect(debut).toBeGreaterThan(-1);
    const titre = html.indexOf('aa-hero__title');
    const crete = html.indexOf('data-crete');
    const rail = html.indexOf('class="aa-hero__rail"');
    const date = html.indexOf('Printemps 2027');
    const epreuves = html.indexOf('35 km · 12 km');
    const meta = html.indexOf('class="aa-hero__meta"');
    const actions = html.indexOf('class="aa-hero__actions"');
    expect(debut).toBeLessThan(titre);
    expect(titre).toBeLessThan(crete);
    expect(crete).toBeLessThan(rail);
    expect(rail).toBeLessThan(date);
    expect(rail).toBeLessThan(epreuves);
    expect(rail).toBeLessThan(meta);
    expect(meta).toBeLessThan(actions);
    expect(actions).toBeLessThan(html.indexOf('aa-bilan'));
    // Story 9.2 : le bandeau de date et le badge des épreuves se fondent
    // dans le rail — plus d'éléments flottants autonomes.
    expect(html).not.toContain('aa-hero__badge');
    expect(html).not.toContain('aa-hero__date');
    // Rail en liste de définitions : quatre paires dt/dd (une paire = une
    // cellule cloisonnée).
    const railHtml = html.slice(html.indexOf('aa-hero__rail'), html.indexOf('</dl>'));
    expect((railHtml.match(/<dt>/g) ?? []).length).toBe(4);
    expect((railHtml.match(/<dd>/g) ?? []).length).toBe(4);
    expect(railHtml).toContain('Stade Agni Lhoudh</dd>');
    expect(railHtml).toContain('Forêt de Yakouren</dd>');
    // Une seule photo prioritaire, avant le titre (LCP).
    expect((html.match(/data-hero-photo/g) ?? []).length).toBe(1);
    expect(html.indexOf('data-hero-photo')).toBeLessThan(titre);
    expect(html).toMatch(/<h1 class="aa-hero__title" id="titre-accueil">/);
    expect(html).toContain('aria-labelledby="titre-accueil"');
  });

  it('CSS : hero à hauteur d’écran moins l’égide, titre à gauche / rail à droite sur socle, rail sous le titre en mobile', () => {
    const plein = regle('.aa-hero--plein');
    expect(plein).toMatch(/min-height:\s*calc\(100svh - var\(--frise-hauteur\)/);
    const corps = regle('.aa-hero--plein .aa-hero__body');
    // Composition 9.2 : grille deux colonnes (titre à gauche, rail à droite),
    // texte à gauche — plus de contenu centré.
    expect(corps).toContain('display: grid');
    expect(corps).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(/);
    expect(corps).toContain('text-align: left');
    // Socle translucide forest-800 : porte l’accent ocre du nom (≥ 3,49:1,
    // grand texte) et l’encre on-forest (≥ 8,39:1) — mesurés story 9.2.
    expect(corps).toContain('color-mix(in srgb, var(--forest-800) 45%, transparent)');
    const titre = regle('.aa-hero--plein .aa-hero__title');
    // Très grande échelle dégressive : plafond 136 px (UX-DR-33), plancher
    // mobile 44 px (paliers dans les media queries ci-dessous).
    expect(titre).toMatch(/font-size:\s*clamp\(72px, 10\.5vw, 136px\)/);
    // Mobile/tablette : une colonne — le rail passe SOUS le titre au lieu de
    // le comprimer (ordre vertical titre, crête, rail, méta, actions). Le bloc
    // media capture sa première règle : celle du corps, qui porte la bascule.
    const mobile = CSS.match(/@media \(max-width: 959\.98px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(mobile).toContain('.aa-hero--plein .aa-hero__body');
    expect(mobile).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(mobile.indexOf('"titre"')).toBeLessThan(mobile.indexOf('"rail"'));
    expect(mobile.indexOf('"rail"')).toBeLessThan(mobile.indexOf('"actions"'));
    // Paliers du titre : 44 px plancher téléphone, 40 px très petit écran.
    expect(CSS).toMatch(/clamp\(44px, 12\.5vw, 72px\)/);
    expect(CSS).toMatch(/clamp\(40px, 11vw, 44px\)/);
  });

  it('CSS : en-tête superposé à la photo sans JS (logo négatif, texte clair) — conservé par la refonte 9.2', () => {
    const entete = regle('body:has(.aa-hero--plein) .site-header');
    expect(entete).toContain('position: absolute');
    expect(entete).toContain('background: transparent');
    expect(entete).toContain('color: var(--on-forest)');
    expect(regle('body:has(.aa-hero--plein) .header-logo')).toContain(
      'aitaissi-logo-negatif.svg',
    );
  });

  it.each([
    ['clair', '.aa-hero--plein .aa-hero__veil'],
    ['sombre', "[data-theme='dark'] .aa-hero--plein .aa-hero__veil"],
  ])('voile charte (thème %s) : opacité entre 60 et 85 % sur toute la hauteur', (_theme, selecteur) => {
    const alphas = [...regle(selecteur).matchAll(/rgba\([^)]*,\s*([0-9.]+)\s*\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(alphas.length).toBeGreaterThanOrEqual(2);
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0.6);
      expect(alpha).toBeLessThanOrEqual(0.85);
    }
  });
});

describe('accueil vitrine — section parcours (story 9.3)', () => {
  function trancheSection(): string {
    const debut = HTML_ACCUEIL.indexOf('titre-parcours-accueil');
    expect(debut).toBeGreaterThan(-1);
    const fin = HTML_ACCUEIL.indexOf('titre-piliers', debut);
    return HTML_ACCUEIL.slice(debut, fin);
  }

  it('après le hero et la section épreuves — jamais le premier écran', () => {
    const html = HTML_ACCUEIL;
    expect(html.indexOf('aa-hero--plein')).toBeLessThan(html.indexOf('titre-parcours-accueil'));
    expect(html.indexOf('titre-epreuves-2027')).toBeLessThan(html.indexOf('titre-parcours-accueil'));
    expect(html.indexOf('titre-parcours-accueil')).toBeLessThan(html.indexOf('titre-piliers'));
  });

  it('sélecteur servi : deux radios homonymes, premier coché, fiches des deux épreuves', () => {
    const section = trancheSection();
    const radios = section.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios.length).toBe(2);
    for (const radio of radios) {
      expect(radio).toContain('name="epreuve-parcours-accueil"');
    }
    expect(radios[0]).toContain('checked');
    expect(section).toContain('La Longue — 35 km');
    expect(section).toContain('La Moyenne — 12 km');
    expect(section).toContain('href="https://files.exemple.dz/longue.gpx"');
  });

  it('aucun chiffre de dénivelé, altitude, horaire ou barrière tant que la donnée est nulle', () => {
    const section = trancheSection();
    for (const interdit of [
      'Dénivelé',
      'Altitude',
      'Heure de départ',
      'Barrière horaire',
      'Points de passage',
    ]) {
      expect(section).not.toContain(interdit);
    }
  });

  it('emplacement de la visualisation annoncé, section rendue sans la visualisation', () => {
    const section = trancheSection();
    expect(section).toContain('titre-viz-parcours');
    expect(section).toContain('carte en relief et le profil altimétrique');
    expect(section).not.toContain('<iframe');
    expect(section).not.toContain('<canvas');
    expect(section).not.toContain('maplibre');
  });

  it('la page détaillée reste à portée : lien /parcours dans la section', () => {
    expect(trancheSection()).toContain('href="/parcours"');
  });

  it('liens texte : cibles tactiles ≥ 44 px (mesuré 25,5 px avant la garde, story 9.6)', () => {
    const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
    const regleCss = css
      .replace(/\s+/g, ' ')
      .match(/\.aa-lien-texte\{([^}]*)\}/)?.[1] ?? '';
    expect(regleCss).toMatch(/min-height:\s*44px/);
    expect(regleCss).toContain('display:inline-flex');
  });
});

describe('accueil vitrine — mode de rendu', () => {
  it('cache court (ISR) : la section partenaires est relue sans rendre la page dynamique', () => {
    // Supprimer l'export `revalidate` figerait la section partenaires à la
    // construction : la bascule A/B « sans dev » ne se verrait plus.
    // Le remplacer par `force-dynamic` remettrait Postgres dans le chemin
    // critique du premier rendu (budget < 5 s en 3G lent).
    expect(ACCUEIL_REVALIDATE).toBe(60);
  });
});

describe('accueil vitrine — section partenaires rendue (story 2.3)', () => {
  it('mode B : titre de section et nom du sponsor présents dans le HTML de l’accueil', async () => {
    sponsorsServiceMock.getPartenairesSection.mockResolvedValueOnce({
      mode: 'B',
      signature: null,
      sponsors: [{ id: 's1', nom: 'Ifri', url: null, logoUrl: null }],
    });
    const html = await renduAccueil();
    expect(html).toContain('id="titre-partenaires"');
    expect(html).toContain('Ils soutiennent le week-end');
    expect(html).toContain('Ifri');
    expect(html).toContain('aa-partenaire');
  });
});

describe('accueil vitrine — identité village (story 2.2)', () => {
  it('piliers : quatre glyphes SVG inline et libellés exacts', () => {
    const html = HTML_ACCUEIL;
    const glyphes = html.match(/<svg[^>]*data-glyphe="([^"]+)"[^>]*>/g) ?? [];
    expect(glyphes.length).toBe(4);
    // Correspondance piliers ↔ glyphes (noms kabyles sources) :
    // Sport → yaz ⵣ, Santé → tala (la fontaine), Citoyenneté → tabzimt (la fibule), Écologie → ingel (le cèdre).
    const noms = glyphes
      .map((g) => g.match(/data-glyphe="([^"]+)"/)?.[1] ?? '')
      .sort();
    expect(noms).toEqual(['ingel', 'tabzimt', 'tala', 'yaz']);
    const titres = (html.match(/class="aa-pilier__titre">([^<]+)</g) ?? []).map((t) =>
      t.replace(/^.*?>/, '').replace(/<$/, ''),
    );
    expect(new Set(titres)).toEqual(new Set(['Sport', 'Santé', 'Citoyenneté', 'Écologie']));
  });

  it('piliers : cartes sobres avec glyphe + titre + ligne concrète, jamais de glyphe seul', () => {
    const html = HTML_ACCUEIL;
    expect((html.match(/<article class="aa-card aa-pilier"/g) ?? []).length).toBe(4);
    expect(html).toContain('stade Agni Lhoudh');
    expect(html).toContain('116 enfants');
    expect(html).toContain('village d’Aït Aïssi');
    expect(html).toContain('forêt de Yakouren');
  });

  it('glyphes : monochromes currentColor, trait sans remplissage, 20–24 px', () => {
    const html = HTML_ACCUEIL;
    const blocs = html.match(/<svg[^>]*data-glyphe[^>]*>.*?<\/svg>/g) ?? [];
    expect(blocs.length).toBe(4);
    for (const bloc of blocs) {
      expect(bloc).toContain('stroke="currentColor"');
      expect(bloc).toContain('fill="none"');
      expect(bloc).not.toMatch(/fill="(?!none)/);
      expect(bloc).toMatch(/width="2[0-4]"/);
      expect(bloc).toMatch(/height="2[0-4]"/);
    }
  });

  it('frise : présente en tête et pied de la vitrine, aria-hidden, jamais dans le contenu', () => {
    const html = HTML_ACCUEIL;
    const frises = html.match(/<svg[^>]*data-frise[^>]*>/g) ?? [];
    expect(frises.length).toBe(2);
    for (const frise of frises) {
      expect(frise).toContain('aria-hidden="true"');
    }
    const premiere = html.indexOf('data-frise');
    const derniere = html.lastIndexOf('data-frise');
    expect(premiere).toBeGreaterThan(-1);
    expect(premiere).toBeLessThan(html.indexOf('aa-hero'));
    expect(derniere).toBeGreaterThan(html.indexOf('id="titre-contact"'));
  });

  it('crête : ligne ocre 1,5 px directement sous le titre du hero (avant le rail), aria-hidden', () => {
    const html = HTML_ACCUEIL;
    const crete = html.match(/<svg[^>]*data-crete[^>]*>/)?.[0] ?? '';
    expect(crete).not.toBe('');
    expect(crete).toContain('aria-hidden="true"');
    expect(crete).toContain('stroke-width="1.5"');
    expect((html.match(/data-crete/g) ?? []).length).toBe(1);
    // Identité story 2.2 conservée dans la composition 9.2 : la crête reste
    // sous le titre, déplacée ni par le rail ni par la méta.
    expect(html.indexOf('data-crete')).toBeGreaterThan(html.indexOf('aa-hero__title'));
    expect(html.indexOf('data-crete')).toBeLessThan(html.indexOf('aa-hero__rail'));
    expect(html.indexOf('data-crete')).toBeLessThan(html.indexOf('aa-hero__meta'));
  });

  it('interdits : aucun « Tafsut », médaillon, mascotte ni drapeau', () => {
    const html = HTML_ACCUEIL.toLowerCase();
    expect(html).not.toContain('tafsut');
    expect(html).not.toContain('médaillon');
    expect(html).not.toContain('medaillon');
    expect(html).not.toContain('mascotte');
    expect(html).not.toContain('drapeau');
  });
});
