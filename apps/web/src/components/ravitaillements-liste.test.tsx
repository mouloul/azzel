import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { plusLongEcartKm, RavitaillementsListe } from './ravitaillements-liste';
import {
  BOUCLE_MOYENNE_DISTANCE_KM,
  RAVITAILLEMENTS_DISTANCE_KM,
  RAVITAILLEMENTS_POINTS,
} from './ravitaillements-parcours';
import { PARCOURS_DOC } from '@/modules/contenus/parcours/lecture';

const NBSP = ' ';
const html = renderToStaticMarkup(<RavitaillementsListe />);

describe('ravitaillements — chiffres tirés de parcours.json (retour comité 2027)', () => {
  it('chaque poste reprend le kilomètre, l’altitude et le D+ du point de passage de la longue', () => {
    const points = PARCOURS_DOC?.epreuves.longue?.pointsDePassage ?? [];
    expect(RAVITAILLEMENTS_POINTS).toHaveLength(4);
    for (const poste of RAVITAILLEMENTS_POINTS) {
      const source = points.find((p) => p.id === poste.id);
      expect(source).toBeDefined();
      expect(poste.kilometre).toBe(source?.kilometre);
      expect(poste.altitudeM).toBe(source?.altitudeM);
      expect(poste.dplusDepuisPrecedentM).toBe(source?.dplusSegmentAmontM);
    }
  });

  it('la distance affichée est celle du relevé, jamais une constante recopiée', () => {
    expect(RAVITAILLEMENTS_DISTANCE_KM).toBeCloseTo(28.01, 2);
    expect(BOUCLE_MOYENNE_DISTANCE_KM).toBeCloseTo(12.72, 2);
  });

  it('les services viennent du point de passage (une seule source, jamais inventés)', () => {
    const premier = RAVITAILLEMENTS_POINTS[0];
    expect(premier?.services).toEqual(
      PARCOURS_DOC?.pointsDePassage.find((p) => p.id === premier?.id)?.services,
    );
  });

  it('aucun D+ rédigé à la main ne contredit plus le tracé (ancien « +186 m » au km 8)', () => {
    expect(html).toContain(`+${RAVITAILLEMENTS_POINTS[0]?.dplusDepuisPrecedentM} m`);
    expect(html).not.toContain('+186 m');
    expect(html).not.toContain('411 m de montée');
  });
});

describe('ravitaillements — couverture des deux épreuves', () => {
  it('une ligne de course par épreuve, chacune avec sa distance', () => {
    expect(html).toContain('La Grande Boucle');
    expect(html).toContain('La Boucle Moyenne');
    expect(html).toContain(`28${NBSP}km`);
    expect(html).toContain(`12,7${NBSP}km`);
  });

  it('les deux postes partagés portent AUSSI le kilomètre de la Boucle Moyenne', () => {
    const partages = RAVITAILLEMENTS_POINTS.filter((p) => p.kilometreBoucleMoyenne !== null);
    expect(partages.map((p) => p.id)).toEqual(['ravito-1', 'ravito-4']);
    expect(html).toContain('Boucle Moyenne · km 7,2');
    expect(html).toContain('Boucle Moyenne · km 10,8');
  });

  it('les postes réservés à la Grande Boucle le disent', () => {
    expect((html.match(/Grande Boucle seulement/g) ?? []).length).toBe(2);
  });
});

describe('plusLongEcartKm', () => {
  it('mesure le plus long tronçon sans ravitaillement, arrivée comprise', () => {
    expect(plusLongEcartKm([8, 15, 21, 26], 28)).toBe(8);
    expect(plusLongEcartKm([5], 20)).toBe(15);
    expect(plusLongEcartKm([], 12)).toBe(12);
  });
});
