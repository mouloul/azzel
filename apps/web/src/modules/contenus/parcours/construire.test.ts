import { describe, expect, it } from 'vitest';

import {
  ConfigInvalideError,
  construireParcoursDoc,
  validerConfig,
  type EntreeConstruction,
  type ParcoursConfig,
} from './construire';
import type { ReleveGpx } from './gpx';
import { calculerDeniveles, type GeometrieBase } from './traitement';

/* Fixture synthétique DANS LE TEST (jamais dans les données livrées —
 * aucun relevé réel de la moyenne n’existe) :
 * base = ligne de 10 000 m, 101 points tous les 100 m, « montagne » en
 * altitude : montée 100→150 m jusqu’au km 5 (index 50, le point Y), puis
 * descente jusqu’à 100 m à l’arrivée.
 *   longue  = depart → arrivee (10 km)
 *   moyenne = X (km 3) → arrivee (7 km)   [portion partagée X→arrivee]
 * Le point Y (sommet, km 5 de la base) doit porter DEUX kilométrages
 * distincts (FR-38) : 5,0 en longue, 2,0 en moyenne. */
const PAS_M = 100;
const NB_POINTS = 101;
const DISTANCE_TOTALE = (NB_POINTS - 1) * PAS_M; // 10 000 m
const altitudeAu = (i: number) => 100 + (i <= 50 ? i : 100 - i);

function geometrieSynthetique(): GeometrieBase {
  const altitudes = Array.from({ length: NB_POINTS }, (_, i) => altitudeAu(i));
  const distances = Array.from({ length: NB_POINTS }, (_, i) => i * PAS_M);
  return {
    points: altitudes.map((altitudeM, i) => ({
      lon: i / 1000,
      lat: 36,
      altitudeM,
      distanceM: distances[i] ?? 0,
      indexBrut: i,
    })),
    altitudesLissees: altitudes,
    altitudes,
    distances,
    distanceTotaleM: DISTANCE_TOTALE,
    deniveles: calculerDeniveles(altitudes),
    altitudeMinM: 100,
    altitudeMaxM: 150,
  };
}

const RELEVE_FIXTURE: ReleveGpx = {
  nom: 'Fixture synthétique',
  dateReleveIso: '2026-01-01T08:00:00.000Z',
  points: [],
};

function configFixture(): unknown {
  return {
    source: { gpx: 'docs/GPX/fixture.test.gpx' },
    pointsDePassage: [
      { id: 'x', nom: 'Croisement de X', positionBaseM: 3000 },
      { id: 'y', nom: 'Sommet de Y', positionBaseM: 5000 },
    ],
    epreuves: [
      { slug: 'longue', portions: [{ de: 'depart', a: 'arrivee' }] },
      { slug: 'moyenne', portions: [{ de: 'x', a: 'arrivee' }] },
    ],
  };
}

function construire(config: unknown): ReturnType<typeof construireParcoursDoc> {
  return construireParcoursDoc({
    config: validerConfig(config),
    releve: RELEVE_FIXTURE,
    geometrie: geometrieSynthetique(),
    rapportQualite: {
      pasMedianS: 1,
      partDistanceSegmentsLongs: 0,
      pointsVitesseImplausible: 0,
      defauts: [],
      accepte: true,
    },
    version: 1,
  } satisfies EntreeConstruction);
}

describe('parcours — validation de la config', () => {
  it('config valide : structure normalisée', () => {
    const config = validerConfig(configFixture());
    expect(config.epreuves.map((e) => e.slug)).toEqual(['longue', 'moyenne']);
    expect(config.pointsDePassage.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('id réservé déclaré ⇒ erreur nommée', () => {
    const mauvaise = configFixture() as { pointsDePassage: { id: string }[] };
    mauvaise.pointsDePassage[0]!.id = 'depart';
    expect(() => validerConfig(mauvaise)).toThrow(ConfigInvalideError);
    expect(() => validerConfig(mauvaise)).toThrow(/réservé/);
  });

  it('ids dupliqués, épreuves vides, portions sans bornes ⇒ erreurs nommées', () => {
    expect(() => validerConfig({ source: { gpx: 'a.gpx' }, pointsDePassage: [], epreuves: [] })).toThrow(
      /epreuves doit être un tableau non vide/,
    );
    const dupliquee = configFixture() as { pointsDePassage: { id: string }[] };
    dupliquee.pointsDePassage[1]!.id = 'x';
    expect(() => validerConfig(dupliquee)).toThrow(/dupliqué/);
    expect(() =>
      validerConfig({ source: { gpx: 'a.gpx' }, pointsDePassage: [], epreuves: [{ slug: 's' }] }),
    ).toThrow(/portions/);
  });
});

describe('parcours — construction du document (2 épreuves, géométrie partagée)', () => {
  const doc = construire(configFixture());

  it('points de passage de base : depart/arrivee auto-déduits + déclarés, triés par position', () => {
    expect(doc.pointsDePassage.map((p) => p.id)).toEqual(['depart', 'x', 'y', 'arrivee']);
    expect(doc.pointsDePassage.map((p) => p.positionBaseM)).toEqual([0, 3000, 5000, 10_000]);
    expect(doc.pointsDePassage[0]?.nom).toBe('Départ');
    expect(doc.pointsDePassage[3]?.nom).toBe('Arrivée');
    expect(doc.pointsDePassage[2]?.altitudeM).toBe(150); // sommet
    expect(doc.pointsDePassage.every((p) => p.services === null)).toBe(true); // jamais inventés
  });

  it('géométrie publiée UNE fois : coords et profile alignés sur la base', () => {
    expect(doc.coords).toHaveLength(NB_POINTS);
    expect(doc.profile).toHaveLength(NB_POINTS);
    expect(doc.profile[50]).toEqual([5000, 150]);
  });

  it('mesures globales : distance, D+ brut 50 → 50 au seuil (montée franche), altitude 100–150', () => {
    expect(doc.mesures.distanceM).toBe(10_000);
    expect(doc.mesures.dplusBrutM).toBe(50);
    expect(doc.mesures.dplusM).toBe(50);
    expect(doc.mesures.dmoinsM).toBe(50);
    expect(doc.mesures.altitudeMinM).toBe(100);
    expect(doc.mesures.altitudeMaxM).toBe(150);
  });

  it('FR-38 : le point commun Y porte 2 kilométrages DISTINCTS selon l’épreuve (jamais global)', () => {
    const yLongue = doc.epreuves.longue?.pointsDePassage.find((p) => p.id === 'y');
    const yMoyenne = doc.epreuves.moyenne?.pointsDePassage.find((p) => p.id === 'y');
    expect(yLongue?.sM).toBe(5000);
    expect(yLongue?.kilometre).toBe(5);
    expect(yMoyenne?.sM).toBe(2000);
    expect(yMoyenne?.kilometre).toBe(2);
  });

  it('vues d’épreuve : tranches, distances et D+/D− propres à chacune', () => {
    expect(doc.epreuves.longue?.tranches).toEqual([{ deIndex: 0, aIndex: 100 }]);
    expect(doc.epreuves.moyenne?.tranches).toEqual([{ deIndex: 30, aIndex: 100 }]);
    expect(doc.epreuves.longue?.distanceM).toBe(10_000);
    expect(doc.epreuves.moyenne?.distanceM).toBe(7000);
    // Longue : monte 50 (D+ 50) puis descend 50. Moyenne : part de 130 m,
    // monte jusqu’à 150 (D+ 20) puis descend jusqu’à 100 (D− 50).
    expect(doc.epreuves.longue?.dplusM).toBe(50);
    expect(doc.epreuves.moyenne?.dplusM).toBe(20);
    expect(doc.epreuves.moyenne?.dmoinsM).toBe(50);
  });

  it('D+ du segment amont par point de passage (dans le référentiel de l’épreuve)', () => {
    const longue = doc.epreuves.longue?.pointsDePassage ?? [];
    expect(longue.map((p) => [p.id, p.dplusSegmentAmontM])).toEqual([
      ['depart', 0],
      ['x', 30], // 0→3000 m : montée 100→130
      ['y', 20], // 3000→5000 m : montée 130→150
      ['arrivee', 0], // descente seule
    ]);
    const moyenne = doc.epreuves.moyenne?.pointsDePassage ?? [];
    expect(moyenne.map((p) => [p.id, p.kilometre])).toEqual([
      ['x', 0],
      ['y', 2],
      ['arrivee', 7],
    ]);
  });

  it('métadonnées : source, constantes et version citées (auditabilité)', () => {
    expect(doc.version).toBe(1);
    expect(doc.source.nom).toBe('Fixture synthétique');
    expect(doc.source.dateReleve).toBe('2026-01-01T08:00:00.000Z');
    expect(doc.constantes.seuilDplusM).toBe(5);
    expect(doc.constantes.seuilFusionM).toBe(8);
    expect(doc.mesures.porte.accepte).toBe(true);
  });
});

describe('parcours — bornes de portions vs géométrie (erreurs nommées)', () => {
  it('borne inconnue ⇒ erreur nommée', () => {
    const config = configFixture() as { epreuves: { portions: { de: string }[] }[] };
    config.epreuves[1]!.portions[0]!.de = 'inconnu';
    expect(() => construire(config)).toThrow(/borne « inconnu » inconnue/);
  });

  it('portion à contre-sens du relevé ⇒ erreur nommée', () => {
    const config = configFixture() as { epreuves: { portions: { de: string; a: string }[] }[] };
    config.epreuves[0]!.portions[0] = { de: 'arrivee', a: 'depart' };
    expect(() => construire(config)).toThrow(/contre-sens/);
  });

  it('point de passage hors trace ]0 ; distance[ ⇒ erreur nommée avec le chiffre', () => {
    const config = configFixture() as { pointsDePassage: { id: string; positionBaseM: number }[] };
    config.pointsDePassage[0]!.positionBaseM = 0;
    expect(() => construire(config)).toThrow(/hors trace/);
  });
});

describe('parcours — config typée (garde de compilation)', () => {
  it('le type ParcoursConfig reflète le schéma livré', () => {
    const config: ParcoursConfig = validerConfig(configFixture());
    expect(config.source.gpx).toContain('fixture');
  });
});
