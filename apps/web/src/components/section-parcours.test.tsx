import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SectionParcours } from '@/components/section-parcours';
import type {
  EpreuveSectionParcours,
  SectionParcoursView,
} from '@/modules/contenus/section-parcours';

/* Story 9.3 — la coquille parcours de l’accueil. Le sélecteur est sans
 * JavaScript : des radios natifs + des règles :has() générées côté serveur.
 * Les tests vérifient donc le CONTRAT de bascule (radio i ↔ panneau i) tel
 * qu’il est servi, champ par champ : disponible → rendu, null → absent. */

const NBSP_ETROIT = '\u202f';
const GROUPE_FR = new Intl.NumberFormat('fr-FR');

function epreuveActuelle(overrides: Partial<EpreuveSectionParcours> = {}): EpreuveSectionParcours {
  return {
    slug: 'longue',
    nom: 'La Longue — 35 km',
    distanceKm: 35,
    gpxUrl: 'https://files.exemple.dz/longue.gpx',
    metriques: null,
    pointsDePassage: null,
    ...overrides,
  };
}

const VUE_ACTUELLE: SectionParcoursView = {
  epreuves: [
    epreuveActuelle(),
    epreuveActuelle({
      slug: 'moyenne',
      nom: 'La Moyenne — 12 km',
      distanceKm: 12,
      gpxUrl: null,
    }),
  ],
};

/** Vue telle que la story 11.1 la produira (parcours.json branché) : le rendu
 *  d’aujourd’hui doit déjà savoir l’afficher sans changer. */
const VUE_EPOPEE_11: SectionParcoursView = {
  epreuves: [
    epreuveActuelle({
      metriques: {
        denivelePositifM: 1240,
        deniveleNegatifM: 1230,
        altitudeMinM: 210,
        altitudeMaxM: 780,
        heureDepart: '08 h 00',
        barriereHoraire: '11 h 30',
      },
      // Point PARTAGÉ par les deux épreuves : kilomètres distincts, chacun
      // dans le référentiel de son épreuve (UX-DR-31).
      pointsDePassage: [
        {
          id: 'pc-tala',
          nom: 'Tala',
          kilometre: 7,
          altitudeM: 410,
          services: ['Ravitaillement', 'Point d’eau'],
        },
      ],
    }),
    epreuveActuelle({
      slug: 'moyenne',
      nom: 'La Moyenne — 12 km',
      distanceKm: 12,
      gpxUrl: null,
      metriques: {
        denivelePositifM: 380,
        deniveleNegatifM: 375,
        altitudeMinM: 210,
        altitudeMaxM: 460,
        heureDepart: '08 h 30',
        barriereHoraire: null,
      },
      pointsDePassage: [
        {
          id: 'pc-tala',
          nom: 'Tala',
          kilometre: 5,
          altitudeM: 410,
          services: ['Ravitaillement'],
        },
      ],
    }),
  ],
};

function panneau(html: string, rang: number): string {
  // L’article réel, pas la règle CSS générée qui mentionne aussi data-panneau.
  const debut = html.indexOf(`<article class="socle-carte aa-parcours-accueil__panneau" data-panneau="${rang}">`);
  expect(debut).toBeGreaterThan(-1);
  const fin = html.indexOf('</article>', debut);
  return html.slice(debut, fin);
}

describe('section parcours accueil — sélecteur sans JavaScript (story 9.3)', () => {
  const html = renderToStaticMarkup(<SectionParcours view={VUE_ACTUELLE} />);

  it('un seul état : groupe de radios natifs, premier coché, labels liés par for/id', () => {
    expect(html).toContain('<fieldset');
    expect(html).toContain('Épreuve affichée');
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios.length).toBe(2);
    for (const radio of radios) {
      expect(radio).toContain('name="epreuve-parcours-accueil"');
    }
    expect(radios[0]).toContain('checked');
    expect(radios[1]).not.toContain('checked');
    expect(radios[0]).toContain('data-bascule="0"');
    expect(radios[1]).toContain('data-bascule="1"');
    expect(html).toContain('for="parcours-accueil-longue"');
    expect(html).toContain('for="parcours-accueil-moyenne"');
    // Libellés = cibles du socle (≥ 44 px) : la classe pilule est sur le label.
    expect(html).toMatch(/<label[^>]*class="socle-action socle-action--contour aa-parcours-accueil__libelle"/);
  });

  it('la bascule pilote TOUT le panneau : règle :has() générée radio i ↔ panneau i, pour chaque épreuve', () => {
    // Le style généré porte le contrat complet : cocher un radio affiche le
    // panneau de SON épreuve (et lui seul, règle de masquage de globals.css).
    for (const rang of [0, 1]) {
      expect(html).toContain(
        `.aa-parcours-accueil:has([data-bascule="${rang}"]:checked) [data-panneau="${rang}"]{display:block}`,
      );
    }
    expect((html.match(/\[data-panneau="\d"\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Le chip actif bascule aussi (fond plein), même geste, même règle.
    expect(html).toContain(
      `.aa-parcours-accueil:has([data-bascule="0"]:checked) [data-libelle="0"]{background:var(--az-action)`,
    );
    // Chaque panneau porte la fiche ENTIÈRE de son épreuve : nom + synthèse
    // dans le même article — jamais un kilométrage orphelin.
    expect(panneau(html, 0)).toContain('La Longue — 35 km');
    expect(panneau(html, 1)).toContain('La Moyenne — 12 km');
  });

  it('données réelles seulement : nom, distance, GPX https — rien de plus', () => {
    expect(html).toContain(`>35${NBSP_ETROIT}km<`);
    expect(html).toContain(`>12${NBSP_ETROIT}km<`);
    expect(html).toContain('href="https://files.exemple.dz/longue.gpx"');
    expect(html).toContain('Télécharger le tracé GPX');
    // gpxUrl null (ou non https) : aucun lien, aucun texte de remplacement.
    expect(panneau(html, 1)).not.toContain('href="https://');
    expect(html).not.toContain('Tracé à venir');
  });

  it('métriques et points de passage nuls : aucune ligne, aucun libellé, aucun chiffre', () => {
    for (const interdit of [
      'Dénivelé',
      'Altitude',
      'Heure de départ',
      'Barrière horaire',
      'Points de passage',
      `km${NBSP_ETROIT}`,
    ]) {
      expect(html).not.toContain(interdit);
    }
  });

  it('emplacement de la visualisation annoncé, utile tel quel — jamais un cadre vide', () => {
    expect(html).toContain('id="titre-viz-parcours"');
    expect(html).toContain('carte en relief et le profil altimétrique');
    expect(html).toMatch(/aria-hidden="true"[^>]*data-parcours-viz|data-parcours-viz[^>]*aria-hidden="true"/);
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('maplibre');
  });

  it('la section ne remplace pas la page détaillée : lien /parcours présent', () => {
    expect(html).toContain('href="/parcours"');
    expect(html).toContain('Voir le détail des parcours');
  });
});

describe('section parcours accueil — vue épopée 11 (données non nulles)', () => {
  const html = renderToStaticMarkup(<SectionParcours view={VUE_EPOPEE_11} />);

  it('toutes les lignes de synthèse rendues quand les métriques existent', () => {
    expect(html).toContain('Dénivelé positif');
    expect(html).toContain('Dénivelé négatif');
    expect(html).toContain(`>${GROUPE_FR.format(1240)}${NBSP_ETROIT}m<`);
    expect(html).toContain(`>${GROUPE_FR.format(210)}–${GROUPE_FR.format(780)}${NBSP_ETROIT}m<`);
    expect(html).toContain('>08 h 00<');
    expect(html).toContain('Barrière horaire');
    expect(html).toContain('>11 h 30<');
    // Barrière null sur la Moyenne : ligne absente de SON panneau.
    expect(panneau(html, 1)).not.toContain('Barrière horaire');
  });

  it('point de passage partagé : chaque kilomètre rendu dans le panneau de son épreuve', () => {
    expect(html).toContain('Points de passage');
    expect(panneau(html, 0)).toContain(`km${NBSP_ETROIT}7`);
    expect(panneau(html, 1)).toContain(`km${NBSP_ETROIT}5`);
    expect(panneau(html, 0)).not.toContain(`km${NBSP_ETROIT}5`);
    expect(panneau(html, 1)).not.toContain(`km${NBSP_ETROIT}7`);
    // Services en toutes lettres, jamais en icône seule.
    expect(panneau(html, 0)).toContain('Ravitaillement · Point d’eau');
  });
});

describe('section parcours accueil — vue vide (base indisponible, seed absent)', () => {
  it('coquille utile sans sélecteur ni chiffre inventé, lien /parcours conservé', () => {
    const html = renderToStaticMarkup(<SectionParcours view={{ epreuves: [] }} />);
    expect(html).toContain('titre-parcours-accueil');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('data-panneau');
    expect(html).not.toContain('35');
    expect(html).toContain('href="/parcours"');
  });
});
