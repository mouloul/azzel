import { describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from '@/modules/iam/errors';

import { getSectionParcours } from './section-parcours';
import { PARCOURS_DOC, validerParcoursDoc } from './parcours/lecture';
import type { ContenuRecord, ContenusStore, EpreuveParcoursRecord } from './store';

/* Story 11.1 — raccordement de parcours.json au contrat 9.3.
 *
 * Le parcours.json RÉEL (généré par le pipeline, committé) ne déclare QUE
 * l’épreuve longue : la moyenne n’a pas de tracé fourni par l’organisation.
 * Le store est un FAKE (même convention que contenus.test.ts) qui sert les
 * deux épreuves : la fusion doit enrichir la longue et laisser la moyenne
 * SANS AUCUN chiffre. */

const UPDATED_AT = new Date('2026-10-22T09:00:00.000Z');

function contenusParcours(): ContenuRecord[] {
  return [
    {
      id: 'contenu-1',
      organisationId: 'org-1',
      slug: 'parcours-longue',
      titre: 'Trail long',
      corps: 'La grande boucle.',
      updatedAt: UPDATED_AT,
    },
    {
      id: 'contenu-2',
      organisationId: 'org-1',
      slug: 'parcours-moyenne',
      titre: 'Trail moyen',
      corps: 'La petite boucle.',
      updatedAt: UPDATED_AT,
    },
  ];
}

function epreuves(): EpreuveParcoursRecord[] {
  return [
    {
      id: 'e1',
      slug: 'longue',
      nom: 'La Longue — 35 km',
      distanceKm: 35,
      gpxUrl: 'https://files.exemple.dz/longue.gpx',
    },
    { id: 'e2', slug: 'moyenne', nom: 'La Moyenne — 12 km', distanceKm: 12, gpxUrl: null },
  ];
}

function fakeStoreParcours(): ContenusStore {
  return {
    readDefaultOrgPageParcours: vi.fn().mockResolvedValue({
      contenus: contenusParcours(),
      epreuves: epreuves(),
    }),
  } as unknown as ContenusStore;
}

describe('section parcours — fusion parcours.json (story 11.1)', () => {
  it('le parcours.json commis est valide et ne déclare QUE la longue', () => {
    expect(PARCOURS_DOC).not.toBeNull();
    expect(Object.keys(PARCOURS_DOC?.epreuves ?? {})).toEqual(['longue']);
  });

  it('la longue est fusionnée : métriques publiées + points de passage, horaires null', async () => {
    const vue = await getSectionParcours({ store: fakeStoreParcours() });
    expect(vue.epreuves.map((e) => e.slug)).toEqual(['longue', 'moyenne']);
    const longue = vue.epreuves[0];
    expect(longue?.metriques).not.toBeNull();
    expect(longue?.metriques?.denivelePositifM).toBe(PARCOURS_DOC?.epreuves.longue?.dplusM);
    expect(longue?.metriques?.deniveleNegatifM).toBe(PARCOURS_DOC?.epreuves.longue?.dmoinsM);
    expect(longue?.metriques?.altitudeMinM).toBe(221.6);
    expect(longue?.metriques?.altitudeMaxM).toBe(835.7);
    // Heure de départ et barrière horaire : INCONNUES ⇒ null (jamais inventées).
    expect(longue?.metriques?.heureDepart).toBeNull();
    expect(longue?.metriques?.barriereHoraire).toBeNull();
    // Points de passage : Départ/Arrivée auto-déduits, kilométrages extrêmes.
    const points = longue?.pointsDePassage ?? [];
    expect(points.map((p) => p.id)).toEqual(['depart', 'arrivee']);
    expect(points[0]?.nom).toBe('Départ');
    expect(points[0]?.kilometre).toBe(0);
    expect(points[1]?.kilometre).toBeCloseTo(28.01, 1);
    // Services inconnus ⇒ null (FR-39 : jamais inventés).
    expect(points.every((p) => p.services === null)).toBe(true);
  });

  it('la moyenne (absente du JSON) ne porte AUCUN chiffre', async () => {
    const vue = await getSectionParcours({ store: fakeStoreParcours() });
    const moyenne = vue.epreuves[1];
    expect(moyenne?.metriques).toBeNull();
    expect(moyenne?.pointsDePassage).toBeNull();
    // Story 11.4 : pas de profil non plus — annonce texte de la coquille 9.3.
    expect(moyenne?.profil).toBeNull();
    // La fiche de base (nom, distance, GPX) reste intacte.
    expect(moyenne?.nom).toBe('La Moyenne — 12 km');
    expect(moyenne?.distanceKm).toBe(12);
  });

  it('décision produit 2026-11-04 : distance affichée du RELEVÉ pour la longue, de la base pour la moyenne', async () => {
    const vue = await getSectionParcours({ store: fakeStoreParcours() });
    // Présente dans parcours.json : distance du relevé (28 006,4 m → 28,0 km),
    // PAS la distance éditoriale de la base (35) — le panneau reste cohérent
    // avec le profil et les métriques issus du même relevé.
    expect(vue.epreuves[0]?.distanceKm).toBe(
      (PARCOURS_DOC?.epreuves.longue?.distanceM ?? NaN) / 1000,
    );
    expect(vue.epreuves[0]?.distanceKm).toBeCloseTo(28.0, 1);
    // Absente du JSON : la distance de la base (la moyenne) fait foi.
    expect(vue.epreuves[1]?.distanceKm).toBe(12);
  });

  it('story 11.4 : la longue porte un profil décimé complet, la moyenne aucun', async () => {
    const vue = await getSectionParcours({ store: fakeStoreParcours() });
    const longue = vue.epreuves[0];
    // Profil décimé (140 points mesurés sur le relevé réel) avec pente signée.
    expect(longue?.profil).not.toBeNull();
    expect(longue?.profil?.points.length).toBe(140);
    expect(longue?.profil?.parts.map((p) => p.palier)).toEqual([
      'roulant',
      'soutenu',
      'raide',
      'tres-raide',
    ]);
    // D+ du profil = chiffre PUBLIÉ 11.1 (même source que les métriques).
    expect(longue?.profil?.dplusM).toBe(longue?.metriques?.denivelePositifM);
    // Marqueurs Départ/Arrivée au référentiel de l’épreuve.
    expect(longue?.profil?.marqueurs.map((m) => m.id)).toEqual(['depart', 'arrivee']);
  });

  it('store indisponible : dégradation en section vide (convention 9.3 inchangée)', async () => {
    const store = {
      readDefaultOrgPageParcours: vi.fn().mockRejectedValue(new DbUnavailableError()),
    } as unknown as ContenusStore;
    const vue = await getSectionParcours({ store });
    expect(vue.epreuves).toEqual([]);
  });
});

describe('section parcours — validation légère du JSON (dégradation)', () => {
  it('rejette les documents malformés sans lever (dégradation null)', () => {
    expect(validerParcoursDoc(null)).toBeNull();
    expect(validerParcoursDoc('texte')).toBeNull();
    expect(validerParcoursDoc({ version: 1 })).toBeNull(); // sans coords/profile
    expect(validerParcoursDoc({ version: 1, coords: [[1, 2, 3]], profile: [], pointsDePassage: [], mesures: {}, epreuves: {} })).toBeNull(); // coords < 2
    expect(validerParcoursDoc({ version: '1', coords: [[1], [2]], profile: [], pointsDePassage: [], mesures: {}, epreuves: {} })).toBeNull();
  });

  it('accepte un document structurellement complet', () => {
    const doc = {
      version: 1,
      coords: [
        [4.4, 36.7, 600],
        [4.5, 36.8, 700],
      ],
      profile: [
        [0, 600],
        [12000, 700],
      ],
      pointsDePassage: [],
      mesures: { distanceM: 12000 },
      epreuves: { longue: { distanceM: 12000 } },
    };
    expect(validerParcoursDoc(doc)).not.toBeNull();
  });
});
