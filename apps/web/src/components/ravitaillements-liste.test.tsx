import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { plusLongEcartKm, RavitaillementsListe } from './ravitaillements-liste';
import { RAVITAILLEMENTS_EPREUVES, RAVITAILLEMENTS_TOTAL } from './ravitaillements-parcours';
import { PARCOURS_DOC } from '@/modules/contenus/parcours/lecture';

const NBSP = ' ';
const html = renderToStaticMarkup(<RavitaillementsListe />);
const [longue, moyenne] = RAVITAILLEMENTS_EPREUVES;

/** Tronçon de HTML d'une épreuve : de son titre au bloc suivant. */
function bloc(slug: string): string {
  const debut = html.indexOf(`id="titre-ravitos-${slug}"`);
  const suite = html.indexOf('id="titre-ravitos-', debut + 1);
  return html.slice(debut, suite === -1 ? undefined : suite);
}

describe('ravitaillements — chiffres tirés de parcours.json (retour comité 2027)', () => {
  it('chaque poste reprend le kilomètre, l’altitude et le D+ du point de passage de SON épreuve', () => {
    for (const epreuve of RAVITAILLEMENTS_EPREUVES) {
      const points = PARCOURS_DOC?.epreuves[epreuve.slug]?.pointsDePassage ?? [];
      for (const poste of epreuve.points) {
        const source = points.find((p) => p.id === poste.id);
        expect(source).toBeDefined();
        expect(poste.kilometre).toBe(source?.kilometre);
        expect(poste.altitudeM).toBe(source?.altitudeM);
        expect(poste.dplusDepuisPrecedentM).toBe(source?.dplusSegmentAmontM);
      }
    }
  });

  it('la distance affichée est celle du relevé, jamais une constante recopiée', () => {
    expect(longue?.distanceKm).toBeCloseTo(28.01, 2);
    expect(moyenne?.distanceKm).toBeCloseTo(12.72, 2);
  });

  it('les services viennent du point de passage (une seule source, jamais inventés)', () => {
    const premier = longue?.points[0];
    expect(premier?.services).toEqual(
      PARCOURS_DOC?.pointsDePassage.find((p) => p.id === premier?.id)?.services,
    );
  });

  it('aucun D+ rédigé à la main ne contredit plus le tracé (ancien « +186 m » au km 8)', () => {
    expect(html).toContain(`+${longue?.points[0]?.dplusDepuisPrecedentM} m`);
    expect(html).not.toContain('+186 m');
    expect(html).not.toContain('411 m de montée');
  });
});

describe('ravitaillements — un bloc par épreuve (comité du 17/11/2026)', () => {
  it('quatre postes sur la Grande Boucle, deux sur la Boucle Moyenne : six au total', () => {
    expect(RAVITAILLEMENTS_EPREUVES.map((e) => e.slug)).toEqual(['longue', 'moyenne']);
    expect(longue?.points.map((p) => p.id)).toEqual(['ravito-1', 'ravito-2', 'ravito-3', 'ravito-4']);
    expect(moyenne?.points.map((p) => p.id)).toEqual(['moyenne-ravito-1', 'moyenne-ravito-2']);
    expect(RAVITAILLEMENTS_TOTAL).toBe(6);
  });

  it('les postes de la Boucle Moyenne sont aux km 5,81 et 10,13 demandés', () => {
    expect(moyenne?.points[0]?.kilometre).toBeCloseTo(5.81, 2);
    expect(moyenne?.points[1]?.kilometre).toBeCloseTo(10.13, 2);
  });

  it('chaque bloc porte son titre, sa ligne de course et SES seules fiches', () => {
    expect(bloc('longue')).toContain('La Grande Boucle');
    expect(bloc('longue')).toContain(`28${NBSP}km`);
    expect((bloc('longue').match(/class="socle-carte aa-ravito"/g) ?? []).length).toBe(4);
    expect(bloc('moyenne')).toContain('La Boucle Moyenne');
    expect(bloc('moyenne')).toContain(`12,7${NBSP}km`);
    expect(bloc('moyenne')).toContain('Le fond de vallée');
    expect(bloc('moyenne')).toContain('Avant la remontée');
    expect(bloc('moyenne')).not.toContain('Le premier souffle');
    expect((bloc('moyenne').match(/class="socle-carte aa-ravito"/g) ?? []).length).toBe(2);
  });

  it('plus de puce « Boucle Moyenne · km » ni de « Grande Boucle seulement » : chaque poste est à une épreuve', () => {
    expect(html).not.toContain('Boucle Moyenne · km');
    expect(html).not.toContain('Grande Boucle seulement');
  });
});

describe('plusLongEcartKm', () => {
  it('mesure le plus long tronçon sans ravitaillement, arrivée comprise', () => {
    expect(plusLongEcartKm([8, 15, 21, 26], 28)).toBe(8);
    expect(plusLongEcartKm([5], 20)).toBe(15);
    expect(plusLongEcartKm([], 12)).toBe(12);
  });
});
