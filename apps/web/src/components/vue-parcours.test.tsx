import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SectionParcours } from '@/components/section-parcours';
import { VueParcours } from '@/components/vue-parcours';
import { getParcoursDoc } from '@/modules/contenus/parcours/lecture';
import { PALETTE_PENTE_VUE } from '@/modules/contenus/parcours/profil-vue';
import { construireProfilEpreuve } from '@/modules/contenus/parcours/profil';

/* Vue reprise du POC « carte 3D du parcours » : rendu SERVEUR. La carte, elle,
 * n'existe qu'après montage et visibilité — le HTML servi ne doit donc porter
 * ni moteur, ni canvas, ni tracé, mais tout ce qui se lit sans JavaScript. */

const DOC = getParcoursDoc();
const PROFIL = DOC === null ? null : construireProfilEpreuve(DOC, 'longue');

const STATS = {
  distanceKm: 28,
  denivelePositifM: 1186,
  deniveleNegatifM: 1187,
  altitudeMinM: 222,
  altitudeMaxM: 836,
};

function rendre() {
  if (PROFIL === null) throw new Error('parcours.json absent');
  return renderToStaticMarkup(
    <VueParcours nom="La Grande Boucle" profil={PROFIL} slug="longue" stats={STATS} version={2} />,
  );
}

describe('VueParcours — ce que le serveur sert', () => {
  const html = rendre();

  it('le nom de l’épreuve n’est écrit qu’une fois : le titre du panneau, pas un second dans la vue', () => {
    expect(html).toContain('aria-label="Parcours — La Grande Boucle"');
    expect(html).not.toContain('<h4');
  });

  it('la bande de chiffres du POC : distance, D+, D−, altitude', () => {
    expect(html).toContain('Distance');
    expect(html).toContain('D+');
    expect(html).toContain('D−');
    expect(html).toContain('Altitude');
    expect(html).toContain('1 186 m');
  });

  it('aucun moteur, aucun canvas, aucun tracé dans le HTML : la carte se charge à la demande', () => {
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('maplibre');
    expect(html).not.toContain('/api/parcours/');
    // 993 points de tracé = ~2 000 coordonnées : aucune ne doit partir avec la page.
    expect((html.match(/\d+\.\d{4,}/g) ?? []).length).toBeLessThan(5);
  });

  it('les commandes du POC sont là, désactivées tant que la carte n’est pas ouverte', () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Vue 3D/);
    // Le « survol du parcours » a été retiré à la demande de l'utilisateur.
    expect(html).not.toContain('Survol');
    expect(html).toContain('Relief ×');
    const curseur = (html.match(/<input[^>]*type="range"[^>]*>/) ?? [''])[0];
    expect(curseur).toContain('disabled');
  });

  it('la carte indique qu’elle se charge, jamais un cadre vide', () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('La carte du relief se charge');
  });

  it('le profil se replie, et son état est annoncé (aria-expanded + aria-controls)', () => {
    expect(html).toMatch(/aria-expanded="true"/);
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toContain('Masquer le profil');
  });

  it('les quatre paliers de pente : légende en toutes lettres, jamais la couleur seule', () => {
    for (const libelle of ['Roulant', 'Soutenu', 'Raide', 'Très raide']) {
      expect(html).toContain(libelle);
    }
    for (const couleur of PALETTE_PENTE_VUE) {
      expect(html).toContain(couleur);
    }
    expect(html).toContain('Technicité');
  });

  it('sans JavaScript, aucun « slider » inerte : le curseur n’existe qu’après hydratation', () => {
    // Un role="slider" servi tel quel serait atteignable au Tab sans rien faire.
    // Le pilotage au clavier lui-même est couvert par sMApresTouche (pur).
    expect(html).not.toContain('role="slider"');
    expect(html).not.toContain('tabindex="0"');
  });

  it('le SVG est décoratif : tout ce qu’il dit est écrit en texte', () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain('de D+. Technicité');
  });

  it('les attributions du fond de carte sont servies, hors du canvas (FR-32)', () => {
    expect(html).toContain('vp__attributions');
    expect(html).toMatch(/OpenStreetMap|OpenTopoMap/);
  });

  it('Départ et Arrivée sont marqués sur le profil', () => {
    expect(html).toContain('Départ');
    expect(html).toContain('Arrivée');
  });
});

describe('SectionParcours — l’accueil fusionné, avec la vraie vue', () => {
  function section() {
    if (PROFIL === null) throw new Error('parcours.json absent');
    return renderToStaticMarkup(
      <SectionParcours
        entete={{
          id: 'titre-epreuves-2027',
          surtitre: 'Les épreuves',
          titre: 'Deux trails au départ du stade',
          chapeau: 'Chapeau de test.',
        }}
        pied={<p className="pied-test">Contenu sous le sélecteur</p>}
        presentations={{ longue: { phare: true, texte: 'La grande course.' } }}
        version={2}
        view={{
          epreuves: [
            {
              slug: 'longue',
              nom: 'La Grande Boucle',
              distanceKm: 28,
              gpxUrl: null,
              metriques: {
                denivelePositifM: 1186,
                deniveleNegatifM: 1187,
                altitudeMinM: 222,
                altitudeMaxM: 836,
                heureDepart: null,
                barriereHoraire: null,
              },
              pointsDePassage: null,
              profil: PROFIL,
            },
            {
              slug: 'moyenne',
              nom: 'La Boucle Moyenne',
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
  }

  it('l’épreuve avec tracé porte la vue du POC ; l’autre, son annonce', () => {
    const html = section();
    expect(html.match(/class="vp"/g)).toHaveLength(1);
    expect(html).toContain('carte en relief et le profil altimétrique');
  });

  it('entête, accroche et pied fournis par l’accueil sont rendus', () => {
    const html = section();
    expect(html).toContain('id="titre-epreuves-2027"');
    expect(html).toContain('Chapeau de test.');
    expect(html).toContain('Épreuve phare');
    expect(html).toContain('La grande course.');
    expect(html).toContain('Contenu sous le sélecteur');
  });

  it('la mention « tracé provisoire » accompagne la vue, comme avant', () => {
    expect(section()).toContain('Tracé provisoire');
  });

  it('un profil SANS métriques affiche quand même la vue, chiffres tirés du profil', () => {
    if (PROFIL === null) throw new Error('parcours.json absent');
    const html = renderToStaticMarkup(
      <SectionParcours
        view={{
          epreuves: [
            {
              slug: 'longue',
              nom: 'La Grande Boucle',
              distanceKm: 28,
              gpxUrl: null,
              metriques: null,
              pointsDePassage: null,
              profil: PROFIL,
            },
          ],
        }}
      />,
    );
    expect(html).toContain('class="vp"');
    expect(html).not.toContain('seront publiés');
    expect(html).toContain(`${new Intl.NumberFormat('fr-FR').format(Math.round(PROFIL.dplusM))}`);
  });

  it('l’ancien profil n’est plus servi sur l’accueil', () => {
    const html = section();
    expect(html).not.toContain('aa-profil');
    expect(html).not.toContain('titre-viz-parcours');
  });
});
