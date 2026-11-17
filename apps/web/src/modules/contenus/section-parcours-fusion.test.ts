import { describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from '@/modules/iam/errors';

import { getSectionParcours } from './section-parcours';
import { PARCOURS_DOC, validerParcoursDoc } from './parcours/lecture';
import type { ContenuRecord, ContenusStore, EpreuveParcoursRecord } from './store';

/* Story 11.1 — raccordement de parcours.json au contrat 9.3.
 *
 * Décision du PO du 2026-11-05 : faute de tracé court défini (12 à 15 km
 * attendus), la moyenne reçoit dans parcours.json une DUPLICATION provisoire
 * du relevé d’essai de la longue, pour que les stories 11.3 et 11.5 disposent
 * de deux épreuves. Les deux fiches portent donc les mêmes chiffres, et la
 * mention « tracé provisoire » les accompagne. À remplacer dès que
 * l’organisation fournit le tracé court.
 *
 * Le store est un FAKE (même convention que contenus.test.ts) qui sert les
 * deux épreuves. */

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
      nom: 'La Grande Boucle',
      distanceKm: 28,
      gpxUrl: 'https://files.exemple.dz/longue.gpx',
    },
    { id: 'e2', slug: 'moyenne', nom: 'La Boucle Moyenne', distanceKm: 12, gpxUrl: null },
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

/** Store paramétrable (revue 9, I3) : ordre des contenus et épreuves servies
 * contrôlés par le test — getSectionParcours est exécutée pour de vrai. */
function fakeStoreParcoursParametrable(contenus: ContenuRecord[], epreuvesServies: EpreuveParcoursRecord[]): ContenusStore {
  return {
    readDefaultOrgPageParcours: vi.fn().mockResolvedValue({
      contenus,
      epreuves: epreuvesServies,
    }),
  } as unknown as ContenusStore;
}

describe('section parcours — fusion parcours.json (story 11.1)', () => {
  it('le parcours.json commis est valide et déclare les deux épreuves', () => {
    expect(PARCOURS_DOC).not.toBeNull();
    expect(Object.keys(PARCOURS_DOC?.epreuves ?? {}).sort()).toEqual(['longue', 'moyenne']);
    // La petite boucle a son propre relevé (10/11/2026) : elle n'est plus
    // une duplication de la longue.
    expect(PARCOURS_DOC?.epreuves.moyenne?.source?.fichier).toBe('activity_petite_boucle.gpx');
    expect(PARCOURS_DOC?.epreuves.moyenne?.distanceM).toBeLessThan(
      PARCOURS_DOC?.epreuves.longue?.distanceM ?? 0,
    );
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
    // Points de passage : Départ/Arrivée auto-déduits + les quatre
    // ravitaillements déclarés (retour comité 2027), dans l'ordre du tracé.
    const points = longue?.pointsDePassage ?? [];
    expect(points.map((p) => p.id)).toEqual([
      'depart',
      'ravito-1',
      'ravito-2',
      'ravito-3',
      'ravito-4',
      'arrivee',
    ]);
    expect(points[0]?.nom).toBe('Départ');
    expect(points[0]?.kilometre).toBe(0);
    expect(points[5]?.kilometre).toBeCloseTo(28.01, 1);
    // Services : déclarés pour les ravitaillements, inconnus ⇒ null sinon
    // (FR-39 : jamais inventés).
    expect(points[0]?.services).toBeNull();
    expect(points[5]?.services).toBeNull();
    expect(points[1]?.services).toContain('Eau');
    // D+ du tronçon amont exposé pour le détail des points de passage.
    expect(points[0]?.dplusDepuisPrecedentM).toBe(0);
    expect(points[1]?.dplusDepuisPrecedentM).toBeGreaterThan(0);
  });

  it('la moyenne porte son propre relevé (petite boucle)', async () => {
    const vue = await getSectionParcours({ store: fakeStoreParcours() });
    const moyenne = vue.epreuves[1];
    expect(moyenne?.metriques).not.toBeNull();
    expect(moyenne?.pointsDePassage).not.toBeNull();
    expect(moyenne?.profil).not.toBeNull();
    // Le nom vient de la base et ne porte plus de distance (migration 0040).
    expect(moyenne?.nom).toBe('La Boucle Moyenne');
    // Distance de SON tracé (13,0 km : 286 m de base + son relevé), pas celle
    // de la base éditoriale : la fiche reste cohérente avec son profil.
    expect(moyenne?.distanceKm).toBeCloseTo(13.01, 2);
    expect(moyenne?.metriques?.denivelePositifM).toBe(524);
    // Retour comité 2027 : départ au stade (celui de la base, la montre
    // s'était connectée 286 m plus loin), deux ravitaillements PROPRES.
    const points = moyenne?.pointsDePassage ?? [];
    expect(points.map((p) => p.id)).toEqual([
      'depart',
      'moyenne-ravito-1',
      'moyenne-ravito-2',
      'moyenne-arrivee',
    ]);
    expect(points[1]?.nom).toBe('Ravitaillement 1 · Le fond de vallée');
    // Km 5,81 et 10,13 du relevé de la montre = km 6,09 et 10,42 depuis le stade.
    expect(points[1]?.kilometre).toBeCloseTo(6.09, 2);
    expect(points[2]?.nom).toBe('Ravitaillement 2 · Avant la remontée');
    expect(points[2]?.kilometre).toBeCloseTo(10.42, 2);
  });

  it('décision produit : la distance affichée est celle du RELEVÉ dès qu’il existe', async () => {
    const vue = await getSectionParcours({ store: fakeStoreParcours() });
    // Présente dans parcours.json : distance du relevé (28 006,4 m → 28,0 km),
    // PAS la distance éditoriale de la base (35) — le panneau reste cohérent
    // avec le profil et les métriques issus du même relevé.
    expect(vue.epreuves[0]?.distanceKm).toBe(
      (PARCOURS_DOC?.epreuves.longue?.distanceM ?? NaN) / 1000,
    );
    expect(vue.epreuves[0]?.distanceKm).toBeCloseTo(28.0, 1);
    // La moyenne suit la même règle, sur son propre relevé.
    expect(vue.epreuves[1]?.distanceKm).toBe(
      (PARCOURS_DOC?.epreuves.moyenne?.distanceM ?? NaN) / 1000,
    );
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
    expect(longue?.profil?.marqueurs.map((m) => m.id)).toEqual([
      'depart',
      'ravito-1',
      'ravito-2',
      'ravito-3',
      'ravito-4',
      'arrivee',
    ]);
  });

  it('store indisponible : dégradation en section vide (convention 9.3 inchangée)', async () => {
    const store = {
      readDefaultOrgPageParcours: vi.fn().mockRejectedValue(new DbUnavailableError()),
    } as unknown as ContenusStore;
    const vue = await getSectionParcours({ store });
    expect(vue.epreuves).toEqual([]);
  });

  // Revue épopée 9 (I3) — les deux garanties de getSectionParcours que la
  // fusion seule ne couvrait pas : l'ordre vient de PARCOURS_SLUGS (pas du
  // store) et un bloc sans épreuve associée est filtré.
  it('ordre PARCOURS_SLUGS (la longue d’abord) même si le store sert les contenus en sens inverse', async () => {
    const [blocLongue, blocMoyenne] = contenusParcours();
    const vue = await getSectionParcours({
      store: fakeStoreParcoursParametrable([blocMoyenne!, blocLongue!], epreuves()),
    });
    expect(vue.epreuves.map((e) => e.slug)).toEqual(['longue', 'moyenne']);
  });

  it('bloc sans épreuve associée (épreuve absente de la base) : filtré — la section n’affiche jamais un contenu orphelin', async () => {
    const [, blocMoyenne] = contenusParcours();
    const moyenneSeule = epreuves().filter((epreuve) => epreuve.slug === 'moyenne');
    const vue = await getSectionParcours({
      store: fakeStoreParcoursParametrable(contenusParcours(), moyenneSeule),
    });
    // Le bloc longue existe mais son épreuve n’est pas servie : rien n’est rendu.
    expect(vue.epreuves.map((e) => e.slug)).toEqual(['moyenne']);
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
