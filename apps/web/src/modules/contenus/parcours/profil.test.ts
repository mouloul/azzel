import { describe, expect, it } from 'vitest';

import { PARCOURS_DOC } from './lecture';
import { arrondi } from './geo';
import type { ParcoursDoc } from './construire';
import {
  libelleCourtMarqueur,
  BORNES_PENTE_PCT,
  FENETRE_PENTE_M,
  PAS_CURSEUR_M,
  TOLERANCE_DP_M,
  construireProfilEpreuve,
  decimerVertical,
  deplacerCurseur,
  erreurMaxDecimation,
  lecturePendantDeplacement,
  palierDePente,
  partsParPalier,
  pentesFenetrees,
  pointLePlusProche,
  sMDepuisFraction,
  sensPente,
  sequenceEpreuve,
  xCurseurPourcent,
} from './profil';

/* Story 11.4 — module pur du profil altimétrique. Les chiffres ÉPINGLÉS sur
 * le parcours.json réel (3 222 points, 28,0 km) sont mesurés : tout écart
 * signifie que séquence/DP/pente a dérivé — pas qu’il faut réaligner le
 * test. Relevé de référence : 140 points gardés, erreur max 2,494 m,
 * pentes fenêtrées extrêmes −32,0 / +28,5 %. */

const DOC = PARCOURS_DOC as ParcoursDoc;

describe('palierDePente — échelle verrouillée UX-DR-36 (bornes testées)', () => {
  it.each([
    [4.9, 'roulant'],
    [5, 'soutenu'],
    [11.9, 'soutenu'],
    [12, 'raide'],
    [19.9, 'raide'],
    [20, 'tres-raide'],
    [20.1, 'tres-raide'],
  ] as const)('%s %% → %s', (pente, attendu) => {
    expect(palierDePente(pente)).toBe(attendu);
  });

  it('palier sur la valeur ABSOLUE : la descente raide est raide aussi', () => {
    expect(palierDePente(-4.9)).toBe('roulant');
    expect(palierDePente(-5)).toBe('soutenu');
    expect(palierDePente(-12)).toBe('raide');
    expect(palierDePente(-20)).toBe('tres-raide');
  });

  it('les bornes nommées sont l’échelle verrouillée (5 / 12 / 20 %)', () => {
    expect(BORNES_PENTE_PCT).toEqual({ soutenu: 5, raide: 12, tresRaide: 20 });
  });
});

describe('pente fenêtrée — anti-bruit GPS', () => {
  it('plat avec bruit ±2 m : pente ≈ 0, tout le monde roulant (pas de zébrage)', () => {
    // 1 000 points tous les 8 m, bruit déterministe d’amplitude 1,9 m
    // (≤ ±2 m, cas GPS) autour de 500 m — y compris aux extrémités où la
    // fenêtre est décalée, jamais réduite.
    const sequence = Array.from({ length: 1000 }, (_, i) => ({
      sM: i * 8,
      altitudeM: 500 + (((i % 7) - 3) / 3) * 1.9,
    }));
    const pentes = pentesFenetrees(sequence);
    const pire = Math.max(...pentes.map(Math.abs));
    // ±2 m d’amplitude sur une fenêtre de 80 m ⇒ < 5 % de pente mesurée :
    // palier roulant partout, le bruit n’est jamais coloré.
    expect(pire).toBeLessThan(BORNES_PENTE_PCT.soutenu);
    const parts = partsParPalier(sequence, pentes);
    expect(parts.find((p) => p.palier === 'roulant')?.part).toBeGreaterThan(0.99);
  });

  it('la fenêtre porte bien FENETRE_PENTE_M (constante documentée)', () => {
    expect(FENETRE_PENTE_M).toBe(80);
  });

  it('rampe franche de 10 % sur 1 km : pente mesurée ≈ 10 % (signée)', () => {
    const sequence = Array.from({ length: 101 }, (_, i) => ({
      sM: i * 10,
      altitudeM: 1000 + i, // +1 m tous les 10 m = +10 %
    }));
    const pentes = pentesFenetrees(sequence);
    const auCentre = pentes[50] ?? 0;
    expect(auCentre).toBeGreaterThan(9);
    expect(auCentre).toBeLessThan(11);
  });
});

describe('décimation Douglas-Peucker verticale — chiffres mesurés', () => {
  const sequence = sequenceEpreuve(DOC, 'longue');
  const decimes = decimerVertical(sequence, TOLERANCE_DP_M);

  it('tolérance constante 2,5 m', () => {
    expect(TOLERANCE_DP_M).toBe(2.5);
  });

  it('140 points gardés sur les 3 222 du relevé réel (mesuré)', () => {
    expect(sequence.length).toBe(3222);
    expect(decimes.length).toBe(140);
  });

  it('erreur max d’altitude ≤ tolérance (mesuré : 2,494 m)', () => {
    const erreur = erreurMaxDecimation(sequence, decimes);
    expect(erreur).toBeLessThanOrEqual(TOLERANCE_DP_M);
    expect(erreur).toBeCloseTo(2.494, 2);
  });

  it('premier et dernier points toujours gardés (profil complet)', () => {
    expect(decimes[0]?.sM).toBe(sequence[0]?.sM);
    expect(decimes[decimes.length - 1]?.sM).toBe(sequence[sequence.length - 1]?.sM);
  });

  it('une ligne droite décime en 2 points, erreur nulle', () => {
    const ligne = Array.from({ length: 500 }, (_, i) => ({ sM: i * 10, altitudeM: 100 + i }));
    expect(decimerVertical(ligne, TOLERANCE_DP_M).length).toBe(2);
  });
});

describe('séquence d’épreuve — s continu sur les tranches (jamais global)', () => {
  it('deux tranches : s recompté au fil des tranches, jointure non dupliquée', () => {
    const doc: ParcoursDoc = {
      ...DOC,
      profile: [
        [0, 100],
        [100, 110],
        [200, 108],
        [300, 120],
      ],
      epreuves: {
        boucle: {
          ...DOC.epreuves.longue!,
          tranches: [
            { deIndex: 0, aIndex: 1 },
            { deIndex: 1, aIndex: 3 },
          ],
        },
      },
    };
    const sequence = sequenceEpreuve(doc, 'boucle');
    // Tranche 1 : 0→100 m ; tranche 2 : 100→300 m, s continue SANS saut ni
    // doublon — jamais une relecture du référentiel global.
    expect(sequence.map((p) => p.sM)).toEqual([0, 100, 200, 300]);
    expect(sequence.length).toBe(4);
  });

  it('épreuve inconnue : séquence vide', () => {
    expect(sequenceEpreuve(DOC, 'inexistante')).toEqual([]);
  });
});

describe('construireProfilEpreuve — données réelles de la longue', () => {
  const profil = construireProfilEpreuve(DOC, 'longue');

  it('profil complet : 140 points décimés, D+ publié 11.1, marqueurs Départ/Arrivée', () => {
    expect(profil).not.toBeNull();
    expect(profil?.points.length).toBe(140);
    expect(profil?.dplusM).toBe(DOC.epreuves.longue?.dplusM);
    expect(profil?.distanceM).toBe(DOC.epreuves.longue?.distanceM);
    expect(profil?.marqueurs.map((m) => m.id)).toEqual([
      'depart',
      'ravito-1',
      'ravito-2',
      'ravito-3',
      'ravito-4',
      'arrivee',
    ]);
    // D+ des tronçons : leur somme redonne le D+ publié (1 186 m).
    const somme = (profil?.marqueurs ?? []).reduce((t, m) => t + (m.dplusSegmentAmontM ?? 0), 0);
    expect(somme).toBe(1186);
    expect(profil?.marqueurs[5]?.kilometre).toBeCloseTo(28.01, 2);
  });

  it('les 4 paliers présents (parts mesurées ≈ 25/51/20/4 % de la distance)', () => {
    const parts = profil?.parts ?? [];
    expect(parts.map((p) => p.palier)).toEqual(['roulant', 'soutenu', 'raide', 'tres-raide']);
    for (const part of parts) {
      expect(part.part, `palier ${part.palier}`).toBeGreaterThan(0);
    }
    const soutenu = parts.find((p) => p.palier === 'soutenu')?.part ?? 0;
    expect(soutenu).toBeGreaterThan(0.45);
    expect(soutenu).toBeLessThan(0.55);
  });

  it('pentes fenêtrées extrêmes du relevé : −32,0 % / +28,5 % (mesuré)', () => {
    const pentes = pentesFenetrees(sequenceEpreuve(DOC, 'longue'));
    expect(Math.min(...pentes)).toBeCloseTo(-32.0, 1);
    expect(Math.max(...pentes)).toBeCloseTo(28.5, 1);
  });

  /* La moyenne porte désormais une duplication provisoire du relevé (décision
   * du 2026-11-05) : le garde-fou « aucun chiffre inventé » se vérifie donc
   * sur un slug réellement absent du document. */
  it('épreuve absente du JSON : null, aucun chiffre', () => {
    expect(construireProfilEpreuve(DOC, 'courte')).toBeNull();
    expect(construireProfilEpreuve(DOC, 'inconnue')).toBeNull();
  });

  it('la moyenne a son propre profil, tiré de son relevé (petite boucle)', () => {
    const moyenne = construireProfilEpreuve(DOC, 'moyenne');
    expect(moyenne).not.toBeNull();
    expect(moyenne?.distanceM).toBe(DOC.epreuves.moyenne?.distanceM);
    expect(moyenne?.dplusM).toBe(525);
    // Abscisse propre à l'épreuve : le profil part de 0, pas de la fin de la base.
    expect(moyenne?.points[0]?.sM).toBe(0);
    expect(moyenne?.points.at(-1)?.sM).toBeCloseTo(12_724.5, 0);
  });
});

describe('appariement pente ↔ point décimé — marche monotone exacte', () => {
  const profil = construireProfilEpreuve(DOC, 'longue');
  const sequence = sequenceEpreuve(DOC, 'longue');
  const pentes = pentesFenetrees(sequence);

  it('premier point décimé : la pente fenêtrée de l’indice 0 de la séquence', () => {
    expect(profil?.points[0]?.pentePct).toBe(arrondi(pentes[0] ?? 0, 1));
  });

  it('chacun des 140 points garde la pente fenêtrée de son jumeau strict de la séquence', () => {
    const decimes = decimerVertical(sequence, TOLERANCE_DP_M);
    expect(profil?.points.length).toBe(decimes.length);
    let curseur = 0;
    decimes.forEach((decime, rang) => {
      while (
        curseur < sequence.length &&
        (sequence[curseur]?.sM !== decime.sM || sequence[curseur]?.altitudeM !== decime.altitudeM)
      ) {
        curseur++;
      }
      expect(curseur, `point ${rang} (sM=${decime.sM}) : jumeau strict introuvable`).toBeLessThan(
        sequence.length,
      );
      expect(profil?.points[rang]?.pentePct).toBe(arrondi(pentes[curseur] ?? 0, 1));
    });
  });

  it('point le plus raide du relevé (mesuré) : −23,4 % à l’indice 29, sM 5 786 m', () => {
    const points = profil?.points ?? [];
    let index = 0;
    points.forEach((point, i) => {
      if (Math.abs(point.pentePct) > Math.abs(points[index]?.pentePct ?? 0)) index = i;
    });
    expect(index).toBe(29);
    expect(points[index]?.sM).toBe(5786);
    expect(points[index]?.altitudeM).toBe(390.5);
    expect(points[index]?.pentePct).toBe(-23.4);
  });

  it('les parts couvrent toute la distance : somme ≈ 1 (± 0,002)', () => {
    const somme = (profil?.parts ?? []).reduce((total, part) => total + part.part, 0);
    expect(Math.abs(somme - 1)).toBeLessThan(0.002);
  });

  it('aller-retour curseur exact : sM → fraction → sM sans dérive (5 abscisses réparties)', () => {
    const distanceM = profil?.distanceM ?? 0;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const sM = fraction * distanceM;
      const retour = sMDepuisFraction(xCurseurPourcent(sM, distanceM) / 100, distanceM);
      expect(Math.abs(retour - sM), `fraction ${fraction}`).toBeLessThan(0.1);
    }
  });
});

describe('lectures du curseur (île client)', () => {
  const points = [
    { sM: 0, altitudeM: 500, pentePct: 0 },
    { sM: 1000, altitudeM: 560, pentePct: 6 },
    { sM: 2000, altitudeM: 660, pentePct: 14 },
  ];

  it('point le plus proche d’une abscisse', () => {
    expect(pointLePlusProche(points, 350)?.sM).toBe(0);
    expect(pointLePlusProche(points, 1300)?.sM).toBe(1000);
    expect(pointLePlusProche(points, 9999)?.sM).toBe(2000);
  });

  it('déplacement clavier borné [0 ; distance], au pas nommé', () => {
    expect(PAS_CURSEUR_M).toBe(100);
    expect(deplacerCurseur(500, 2000, PAS_CURSEUR_M)).toBe(600);
    expect(deplacerCurseur(50, 2000, -PAS_CURSEUR_M)).toBe(0);
    expect(deplacerCurseur(1950, 2000, PAS_CURSEUR_M)).toBe(2000);
  });

  it('sens de pente en toutes lettres (jamais le signe seul)', () => {
    expect(sensPente(6)).toBe('montée');
    expect(sensPente(-12)).toBe('descente');
    expect(sensPente(0)).toBe('plat');
  });

  it('AC 11.4 « lecture au survol comme au tap » : la souris lit SANS appui, le tactile exige l’appui', () => {
    // Souris : le déplacement sans bouton enfoncé met à jour la lecture.
    expect(lecturePendantDeplacement('mouse', false)).toBe(true);
    expect(lecturePendantDeplacement('mouse', true)).toBe(true);
    // Tactile : sans appui, rien (un survol capacitif ne lit pas)…
    expect(lecturePendantDeplacement('touch', false)).toBe(false);
    // …appuyé puis glissé, la lecture suit.
    expect(lecturePendantDeplacement('touch', true)).toBe(true);
    // Stylet : même contrat que le tactile.
    expect(lecturePendantDeplacement('pen', false)).toBe(false);
    expect(lecturePendantDeplacement('pen', true)).toBe(true);
  });

  it('géométrie partagée : curseur ↔ SVG dans la même échelle', () => {
    const distanceM = 28006.4;
    // Départ et arrivée du curseur = abscisses viewBox des marges, en %.
    expect(xCurseurPourcent(0, distanceM)).toBeCloseTo(7.5, 2);
    expect(xCurseurPourcent(distanceM, distanceM)).toBeCloseTo(98.5, 2);
    // Pointeur : aller-retour fraction ↔ s sans dérive.
    const s = sMDepuisFraction(0.5, distanceM);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(distanceM);
    expect(sMDepuisFraction(0, distanceM)).toBe(0);
    expect(sMDepuisFraction(1, distanceM)).toBe(distanceM);
    expect(sMDepuisFraction(-3, distanceM)).toBe(0);
    expect(sMDepuisFraction(7, distanceM)).toBe(distanceM);
  });
});

describe('slug hérité de Object (même garde que traceCarte)', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'le slug « %s » ne passe pas pour une épreuve',
    (slug) => {
      expect(construireProfilEpreuve(DOC, slug)).toBeNull();
      expect(sequenceEpreuve(DOC, slug)).toEqual([]);
    },
  );
});

describe('libelleCourtMarqueur — repères sous le profil (retour comité 2027)', () => {
  it('raccourcit les ravitaillements, laisse Départ/Arrivée intacts', () => {
    expect(libelleCourtMarqueur('Ravitaillement 2 · La montée du milieu')).toBe('Ravito 2');
    expect(libelleCourtMarqueur('Départ')).toBe('Départ');
    expect(libelleCourtMarqueur('Arrivée')).toBe('Arrivée');
  });
});
