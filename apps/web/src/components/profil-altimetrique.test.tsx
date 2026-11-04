import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProfilAltimetrique } from '@/components/profil-altimetrique';
import { ProfilCurseur, texteLecture } from '@/components/profil-curseur';
import { MENTION_TRACE_PROVISOIRE, SectionParcours } from '@/components/section-parcours';
import { PARCOURS_DOC } from '@/modules/contenus/parcours/lecture';
import {
  construireProfilEpreuve,
  PAS_CURSEUR_M,
  deplacerCurseur,
  type ProfilEpreuve,
} from '@/modules/contenus/parcours/profil';
import type { EpreuveSectionParcours, SectionParcoursView } from '@/modules/contenus/section-parcours';

/* Story 11.4 — rendu SSR du profil altimétrique (sans JavaScript le profil
 * complet est servi : SVG + légende + synthèse) et curseur (pointeur ET
 * clavier, valeurs visibles ET annoncées). Le profil de test est celui du
 * parcours.json RÉEL (données mesurées : 140 points décimés). */

const NBSP_ETROIT = '\u202f';

if (PARCOURS_DOC === null) {
  throw new Error('parcours.json requis : les tests du profil ont besoin du relevé réel');
}

const PROFIL_LONGUE = construireProfilEpreuve(PARCOURS_DOC, 'longue');

function epreuveAvecProfil(profil: ProfilEpreuve | null): EpreuveSectionParcours {
  return {
    slug: 'longue',
    nom: 'La Longue — 35 km',
    // Décision produit 2026-11-04 : la fusion écrase la distance éditoriale
    // (35) par celle du relevé — le fixture suit le contrat réel.
    distanceKm: (PARCOURS_DOC?.epreuves.longue?.distanceM ?? 0) / 1000,
    gpxUrl: null,
    metriques: null,
    pointsDePassage: null,
    profil,
  };
}

describe('profil altimetrique — SVG servi complet (story 11.4)', () => {
  const html = renderToStaticMarkup(
    <ProfilAltimetrique
      nomEpreuve="La Longue — 35 km"
      profil={PROFIL_LONGUE as ProfilEpreuve}
      slugEpreuve="longue"
    />,
  );

  it('SVG role="img" avec nom accessible complet (épreuve + chiffres publiés)', () => {
    expect(html).toMatch(/<svg[^>]*role="img"/);
    expect(html).toContain('aria-labelledby="profil-alt-titre-longue"');
    expect(html).toContain('<title id="profil-alt-titre-longue">');
    expect(html).toContain('Profil altimétrique de La Longue — 35 km');
    // Chiffres PUBLIÉS 11.1 (même source que la fiche) : 28 km, 1 186 m de D+.
    expect(html).toContain(`1${NBSP_ETROIT}186${NBSP_ETROIT}m de D+`);
  });

  it('les 4 aires de palier colorées par tokens (jamais la couleur seule)', () => {
    for (const palier of ['roulant', 'soutenu', 'raide', 'tres-raide']) {
      expect(html).toContain(`aa-profil__aire--${palier}`);
    }
    // Ligne d’arête par-dessus les aires.
    expect(html).toContain('aa-profil__arete');
  });

  it('axes lisibles : kilomètres et altitudes gradués', () => {
    expect(html).toContain('aa-profil__grille');
    expect(html).toContain('>km</text>');
    // Altitudes réelles 221,6–835,7 m : graduations 400/600/800 m servies.
    expect(html).toContain('>400</text>');
    expect(html).toContain('>800</text>');
    // Kilométrage : 0 au départ, pas « propre » de 10 km sur la longue.
    expect(html).toMatch(/<text[^>]*>0<\/text>/);
    expect(html).toContain('>10</text>');
    expect(html).toContain('>20</text>');
  });

  it('marqueurs Départ/Arrivée : kilomètre + D+ du segment amont', () => {
    expect(html).toContain('aa-profil__marqueur-libelle');
    expect(html).toContain(`Départ · km${NBSP_ETROIT}0`);
    expect(html).toContain(`Arrivée · km${NBSP_ETROIT}28 · +1${NBSP_ETROIT}186${NBSP_ETROIT}m D+`);
  });

  it('décor (grille, axes, aires, marqueurs) aria-hidden', () => {
    expect(html).toContain('class="aa-profil__decor" aria-hidden="true"');
    // Les groupes d’aires et de marqueurs portent aussi aria-hidden.
    expect(html.match(/<g aria-hidden="true">/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('légende en trait + TOUTES lettres : paliers, bornes, parts, sens', () => {
    expect(html).toContain('aa-profil__legende');
    expect(html).toContain('Roulant (moins de 5\xa0%)');
    expect(html).toContain('Soutenu (5 à 12\xa0%)');
    expect(html).toContain('Raide (12 à 20\xa0%)');
    expect(html).toContain('Très raide (20\xa0% et plus)');
    expect(html).toContain('% de la distance');
    // Le choix documenté : palier sur la raideur, montée ou descente.
    expect(html).toContain('en montée comme en descente');
  });

  it('synthèse texte complète (sans JS ni curseur, tout est dit)', () => {
    expect(html).toContain('aa-profil__synthese');
    expect(html).toContain('Technicité\xa0:');
    expect(html).toContain('soutenu');
  });
});

describe('section parcours accueil — aside viz par épreuve (story 11.4)', () => {
  const vue: SectionParcoursView = {
    epreuves: [
      epreuveAvecProfil(PROFIL_LONGUE),
      {
        slug: 'moyenne',
        nom: 'La Moyenne — 12 km',
        distanceKm: 12,
        gpxUrl: null,
        metriques: null,
        pointsDePassage: null,
        profil: null,
      },
    ],
  };
  const html = renderToStaticMarkup(<SectionParcours view={vue} />);

  it('la bascule pilote AUSSI la viz : règle :has() radio i ↔ [data-viz="i"]', () => {
    for (const rang of [0, 1]) {
      expect(html).toContain(
        `.aa-parcours-accueil:has([data-bascule="${rang}"]:checked) [data-viz="${rang}"]{display:block}`,
      );
    }
  });

  it('longue (données) : profil SVG servi dans l’aside, annonce absente', () => {
    expect(html).toContain('data-viz="0"');
    expect(html).toContain('aa-profil__aire--roulant');
    expect(html).not.toContain('seront publiés avec\n');
  });

  it('décision produit 2026-11-04 : panneau longue = distance du relevé + mention « tracé provisoire »', () => {
    // Distance AFFICHÉE = relevé (28 006,4 m → « 28 km », même convention
    // de format que « 12 km » : maximumFractionDigits 1, zéro traînant omis),
    // pas la base éditoriale (35) — le panneau est cohérent avec le profil.
    expect(html).toContain(`>28${NBSP_ETROIT}km<`);
    expect(html).not.toContain('>35');
    // Mention sobre, SERVIE sans JavaScript, texte en constante unique.
    expect(html).toContain(MENTION_TRACE_PROVISOIRE);
    // Une seule occurrence : le panneau de la longue, jamais ailleurs.
    expect(html.split(MENTION_TRACE_PROVISOIRE).length - 1).toBe(1);
  });

  it('moyenne (sans données) : mention « tracé provisoire » absente', () => {
    const sansProfil = renderToStaticMarkup(
      <SectionParcours
        view={{
          epreuves: [
            epreuveAvecProfil(null),
            {
              slug: 'moyenne',
              nom: 'La Moyenne — 12 km',
              distanceKm: 12,
              gpxUrl: null,
              metriques: null,
              pointsDePassage: null,
              profil: null,
            },
          ],
        }}
      />,
    );
    expect(sansProfil).not.toContain(MENTION_TRACE_PROVISOIRE);
  });

  it('moyenne (sans données) : AUCUNE visualisation ni chiffre de profil, annonce conservée', () => {
    const sansProfil = renderToStaticMarkup(
      <SectionParcours
        view={{
          epreuves: [
            epreuveAvecProfil(null),
            {
              slug: 'moyenne',
              nom: 'La Moyenne — 12 km',
              distanceKm: 12,
              gpxUrl: null,
              metriques: null,
              pointsDePassage: null,
              profil: null,
            },
          ],
        }}
      />,
    );
    expect(sansProfil).toContain('carte en relief et le profil altimétrique seront publiés');
    expect(sansProfil).toMatch(/aria-hidden="true"[^>]*data-parcours-viz|data-parcours-viz[^>]*aria-hidden="true"/);
    expect(sansProfil).not.toContain('aa-profil__aire');
    expect(sansProfil).not.toContain('aa-profil__synthese');
    expect(sansProfil).not.toContain('Technicité');
  });

  it('l’île curseur ne rend RIEN côté serveur (profil complet sans JS)', () => {
    expect(html).not.toContain('aa-profil__interaction');
    expect(html).not.toContain('role="slider"');
  });
});

describe('curseur de profil — clavier, pointeur, annonce (story 11.4)', () => {
  const points = [
    { sM: 0, altitudeM: 677.4, pentePct: -4.3 },
    { sM: 555.4, altitudeM: 649.6, pentePct: -8.4 },
    { sM: 5000, altitudeM: 500, pentePct: 6 },
    { sM: 12000, altitudeM: 720, pentePct: 14 },
    { sM: 28006.4, altitudeM: 676, pentePct: -6 },
  ];
  const distanceM = 28006.4;

  it('texte de lecture : kilomètre, altitude, pente SIGNÉE en toutes lettres + palier', () => {
    expect(texteLecture('longue', { sM: 5000, altitudeM: 500, pentePct: 6 })).toContain(
      `km${NBSP_ETROIT}5 · 500${NBSP_ETROIT}m · montée +6,0${NBSP_ETROIT}% — soutenu`,
    );
    expect(texteLecture('longue', { sM: 0, altitudeM: 677.4, pentePct: -4.3 })).toContain(
      `descente -4,3${NBSP_ETROIT}%`,
    );
    expect(texteLecture('longue', { sM: 0, altitudeM: 677.4, pentePct: 0 })).toContain('plat');
  });

  it('déplacement clavier : flèches au pas nommé, bornes respectées', () => {
    expect(PAS_CURSEUR_M).toBe(100);
    expect(deplacerCurseur(1000, distanceM, PAS_CURSEUR_M)).toBe(1100);
    expect(deplacerCurseur(50, distanceM, -PAS_CURSEUR_M)).toBe(0);
    expect(deplacerCurseur(27999, distanceM, PAS_CURSEUR_M)).toBe(distanceM);
  });

  it('SSR du curseur : role="slider" complet, lecture visible = aria-valuetext, UNE seule annonce', () => {
    const html = renderToStaticMarkup(
      <ProfilCurseur distanceM={distanceM} epreuve="longue" points={points} />,
    );
    expect(html).toMatch(/<div[^>]*role="slider"/);
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain(`aria-valuemax="${distanceM}"`);
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('Curseur de lecture du profil altimétrique');
    // Retour de revue 2026-11-04 : l’annonce lecteur d’écran est portée par
    // aria-valuetext (mécanisme natif du slider) — AUCUN aria-live sur le
    // paragraphe visible, qui ferait annoncer DEUX fois chaque flèche.
    expect(html).not.toContain('aria-live');
    // La lecture VISIBLE reste présente, et aria-valuetext dit EXACTEMENT
    // le texte visible (une seule source d’annonce).
    const valeurTexte = html.match(/aria-valuetext="([^"]*)"/)?.[1];
    const visible = html.match(/<p class="aa-profil__lecture">([^<]*)<\/p>/)?.[1];
    expect(valeurTexte).toBeDefined();
    expect(visible).toBeDefined();
    expect(valeurTexte).toBe(visible);
    expect(visible).toContain(`km${NBSP_ETROIT}0 · 677${NBSP_ETROIT}m`);
    // La ligne du curseur est décorative (l’information est dans le texte).
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*class="aa-profil__ligne"/);
  });
});
