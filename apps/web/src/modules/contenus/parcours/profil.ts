// Story 11.4 — profil altimétrique et graphe de technicité (module PUR).
//
// Entrée : le `ParcoursDoc` publié (11.1) — `profile[[dist_m, alt]]` lu par
// les TRANCHES de l’épreuve, `s` recompté en continu au fil des tranches
// (jamais global, FR-38). Sortie : les données du profil rendu sur l’accueil.
//
// Chaîne de traitement (constantes nommées, chacune testée) :
//   1. séquence de l’épreuve (s continu) ;
//   2. pente SIGNÉE fenêtrée (FENETRE_PENTE_M) — la fenêtre évite de
//      colorer le bruit GPS : ±2 m sur plat reste « roulant » ;
//   3. décimation Douglas-Peucker VERTICALE (TOLERANCE_DP_M) — l’altitude
//      de tout point écarté reste à ± la tolérance de la corde ;
//   4. paliers verrouillés sur |pente| (UX-DR-36) — la technicité concerne
//      la raideur du terrain, montée ou descente.
//
// Ce module est importé côté serveur (fusion 9.3, SVG) ET par l’île client
// du curseur (géométrie partagée) : il n’importe JAMAIS parcours.json ni
// aucun module serveur.

import { arrondi } from './geo';
import type { ParcoursDoc } from './construire';

/* ------------------------------------------------------------------ */
/* Constantes verrouillées                                             */
/* ------------------------------------------------------------------ */

/**
 * Fenêtre de calcul de la pente (mètres, centrée sur le point). Assez large
 * pour lisser le bruit GPS (±2 m sur plat ⇒ pente ≈ ±2,5 % ⇒ roulant),
 * assez fine pour que les rampes courtes (100–200 m) soient vues.
 */
export const FENETRE_PENTE_M = 80;

/**
 * Tolérance de décimation Douglas-Peucker VERTICALE (mètres). Mesuré sur le
 * relevé réel (3 222 points, 28 km) : 140 points gardés, erreur max 2,49 m.
 * La tolérance borne AUSSI la lecture de palier : dans un segment gardé,
 * l’altitude reste à ± 2,5 m de la corde.
 */
export const TOLERANCE_DP_M = 2.5;

/** Bornes de l’échelle de technicité verrouillée (UX-DR-36), en % de pente. */
export const BORNES_PENTE_PCT = { soutenu: 5, raide: 12, tresRaide: 20 } as const;

/** Paliers de technicité — libellés en toutes lettres dans la légende. */
export const PALIERS = ['roulant', 'soutenu', 'raide', 'tres-raide'] as const;
export type Palier = (typeof PALIERS)[number];

/** Libellés en toutes lettres (jamais la couleur seule). */
export const LIBELLES_PALIERS: Readonly<Record<Palier, string>> = {
  roulant: 'Roulant',
  soutenu: 'Soutenu',
  raide: 'Raide',
  'tres-raide': 'Très raide',
};

/** Palier d’une pente : échelle verrouillée, calcul sur la valeur absolue. */
export function palierDePente(pentePct: number): Palier {
  const v = Math.abs(pentePct);
  if (v < BORNES_PENTE_PCT.soutenu) return 'roulant';
  if (v < BORNES_PENTE_PCT.raide) return 'soutenu';
  if (v < BORNES_PENTE_PCT.tresRaide) return 'raide';
  return 'tres-raide';
}

/* ------------------------------------------------------------------ */
/* Géométrie SVG partagée serveur/île                                  */
/* ------------------------------------------------------------------ */

/**
 * ViewBox mobile-first : ≈ 1:1 sur un téléphone 390 px, texte ≥ 11 unités.
 * Exportée pour que l’île client positionne le curseur EXACTEMENT comme le
 * serveur dessine les aires (positions en % de la largeur rendue).
 */
export const PROFIL_VIEWBOX = { largeur: 400, hauteur: 210 } as const;

/** Marges internes du tracé (unités viewBox) : place pour les axes. */
export const PROFIL_MARGES = { gauche: 30, droite: 6, haut: 14, bas: 24 } as const;

/** Marge d’altitude au-dessus/en-dessous des extrêmes (mètres). */
export const PROFIL_MARGE_ALTITUDE_M = 15;

/** Palier (unités viewBox) des graduations d’altitude. */
export const PROFIL_PAS_ALTITUDE_M = 200;

/** Fabrique les échelles s→x / altitude→y (unités viewBox), serveur ET île. */
export function fabriquerEchelles(
  distanceM: number,
  altitudeMinM: number,
  altitudeMaxM: number,
): { x: (sM: number) => number; y: (altitudeM: number) => number; yBase: number } {
  const { largeur } = PROFIL_VIEWBOX;
  const { gauche, droite, haut, bas } = PROFIL_MARGES;
  const utileX = Math.max(largeur - gauche - droite, 1);
  const min = altitudeMinM - PROFIL_MARGE_ALTITUDE_M;
  const max = altitudeMaxM + PROFIL_MARGE_ALTITUDE_M;
  const utileY = Math.max(PROFIL_VIEWBOX.hauteur - haut - bas, 1);
  return {
    x: (sM: number) => arrondi(gauche + (sM / Math.max(distanceM, 1)) * utileX, 1),
    y: (altitudeM: number) =>
      arrondi(haut + ((max - altitudeM) / Math.max(max - min, 1)) * utileY, 1),
    yBase: PROFIL_VIEWBOX.hauteur - bas,
  };
}

/** Graduations d’altitude « propres » (multiples du pas, dans [min ; max]). */
export function graduationsAltitude(altitudeMinM: number, altitudeMaxM: number): number[] {
  const premier = Math.ceil((altitudeMinM - PROFIL_MARGE_ALTITUDE_M) / PROFIL_PAS_ALTITUDE_M) * PROFIL_PAS_ALTITUDE_M;
  const dernier = Math.floor((altitudeMaxM + PROFIL_MARGE_ALTITUDE_M) / PROFIL_PAS_ALTITUDE_M) * PROFIL_PAS_ALTITUDE_M;
  const valeurs: number[] = [];
  for (let v = premier; v <= dernier; v += PROFIL_PAS_ALTITUDE_M) {
    valeurs.push(v);
  }
  return valeurs;
}

/** Graduations de distance : ~5 repères « propres » (0 … distance). */
export function graduationsDistance(distanceM: number): number[] {
  if (distanceM <= 0) return [];
  const cible = distanceM / 4;
  const pasKmBrut = cible / 1000;
  const beaux = [0.5, 1, 2, 2.5, 5, 10, 15, 20, 25];
  const pasKm = beaux.find((b) => b >= pasKmBrut) ?? Math.max(25, Math.ceil(pasKmBrut / 25) * 25);
  const pas = pasKm * 1000;
  const valeurs: number[] = [];
  for (let v = 0; v <= distanceM + 1e-9; v += pas) {
    valeurs.push(arrondi(v, 0));
  }
  return valeurs;
}

/** Position du curseur en % de la largeur rendue (île client), cohérente avec
 *  les abscisses viewBox du SVG serveur (même échelle linéaire commune). */
export function xCurseurPourcent(sM: number, distanceM: number): number {
  const { largeur } = PROFIL_VIEWBOX;
  const { gauche, droite } = PROFIL_MARGES;
  const utile = Math.max(largeur - gauche - droite, 1);
  return arrondi(((gauche + (sM / Math.max(distanceM, 1)) * utile) / largeur) * 100, 2);
}

/** Abscisse curviligne depuis une fraction de la largeur rendue (0–1, pointeur). */
export function sMDepuisFraction(fraction: number, distanceM: number): number {
  const { largeur } = PROFIL_VIEWBOX;
  const { gauche, droite } = PROFIL_MARGES;
  const utile = Math.max(largeur - gauche - droite, 1);
  const bornee = Math.min(Math.max(fraction, 0), 1);
  const x = Math.min(Math.max(bornee * largeur, gauche), largeur - droite);
  return Math.min(Math.max(((x - gauche) / utile) * distanceM, 0), distanceM);
}

/* ------------------------------------------------------------------ */
/* Données du profil                                                   */
/* ------------------------------------------------------------------ */

/** Point décimé gardé par Douglas-Peucker, avec sa pente fenêtrée signée. */
export interface PointProfil {
  /** Abscisse curviligne dans le référentiel de l’épreuve (mètres). */
  sM: number;
  altitudeM: number;
  /** Pente fenêtrée SIGNÉE (%, positive = montée). */
  pentePct: number;
}

/** Marqueur vertical sur le profil (Départ/Arrivée aujourd’hui). */
export interface MarqueurProfil {
  id: string;
  nom: string;
  sM: number;
  kilometre: number | null;
  altitudeM: number | null;
  /** D+ publié du segment amont (même source que les métriques 11.1). */
  dplusSegmentAmontM: number | null;
}

/** Part de la distance totale d’un palier (synthèse de la légende). */
export interface PartPalier {
  palier: Palier;
  /** 0–1, arrondi à 3 décimales ; la somme peut différer de 1 d’un arrondi. */
  part: number;
}

/** Profil d’une épreuve, prêt au rendu (SVG serveur + île curseur). */
export interface ProfilEpreuve {
  distanceM: number;
  altitudeMinM: number;
  altitudeMaxM: number;
  /** D+ PUBLIÉ (hystérésis 11.1, même chiffre que les métriques de la fiche). */
  dplusM: number;
  /** Points décimés (Douglas-Peucker) avec pente fenêtrée signée. */
  points: readonly PointProfil[];
  /** Parts de distance par palier, toujours les 4 (même à 0). */
  parts: readonly PartPalier[];
  /** Départ/Arrivée (et demain les points de passage) au référentiel épreuve. */
  marqueurs: readonly MarqueurProfil[];
}

/* ------------------------------------------------------------------ */
/* Traitements                                                         */
/* ------------------------------------------------------------------ */

interface PointSequence {
  sM: number;
  altitudeM: number;
}

/**
 * Séquence parcourue par une épreuve : chaque point des tranches, `s` continu
 * au fil des tranches (le point de jointure n’est gardé qu’une fois).
 */
export function sequenceEpreuve(
  doc: ParcoursDoc,
  slug: string,
): readonly PointSequence[] {
  const vue = doc.epreuves[slug];
  if (vue === undefined) return [];
  const sequence: PointSequence[] = [];
  let sDepartTranche = 0;
  for (const tranche of vue.tranches) {
    const debut = doc.profile[tranche.deIndex]?.[0] ?? 0;
    const fin = doc.profile[tranche.aIndex]?.[0] ?? debut;
    const premierIndex = sequence.length === 0 ? tranche.deIndex : tranche.deIndex + 1;
    for (let i = premierIndex; i <= tranche.aIndex; i++) {
      const point = doc.profile[i];
      const sPoint = point?.[0];
      const altitude = point?.[1];
      if (sPoint === undefined || altitude === undefined) continue;
      sequence.push({ sM: sDepartTranche + (sPoint - debut), altitudeM: altitude });
    }
    sDepartTranche += fin - debut;
  }
  return sequence;
}

/**
 * Pente SIGNÉE fenêtrée de chaque point : dénivelé de la corde entre les
 * points encadrant ±FENETRE_PENTE_M/2 autour du point courant. Aux
 * extrémités du tracé, la fenêtre est DÉCALÉE (jamais réduite) : elle garde
 * FENETRE_PENTE_M d’amplitude, le bruit GPS n’y grossit pas. Le bruit résiduel
 * (±2 m sur plat) reste sous le palier « soutenu » : pas de zébrage.
 */
export function pentesFenetrees(
  sequence: readonly PointSequence[],
): readonly number[] {
  const demi = FENETRE_PENTE_M / 2;
  const sTotal = sequence.length > 0 ? (sequence[sequence.length - 1]?.sM ?? 0) : 0;
  return sequence.map((point, i) => {
    const cibleMin = point.sM - demi;
    const cibleMax = point.sM + demi;
    const sMin = cibleMin < 0 ? 0 : Math.min(cibleMin, Math.max(sTotal - FENETRE_PENTE_M, 0));
    const sMax =
      cibleMax > sTotal ? sTotal : Math.max(cibleMax, Math.min(FENETRE_PENTE_M, sTotal));
    let j1 = i;
    while (j1 > 0 && (sequence[j1]?.sM ?? point.sM) > sMin) j1--;
    let j2 = i;
    while (j2 < sequence.length - 1 && (sequence[j2]?.sM ?? point.sM) < sMax) j2++;
    const s1 = sequence[j1]?.sM ?? point.sM;
    const s2 = sequence[j2]?.sM ?? point.sM;
    const ds = s2 - s1;
    if (ds <= 0) return 0;
    const a1 = sequence[j1]?.altitudeM ?? point.altitudeM;
    const a2 = sequence[j2]?.altitudeM ?? point.altitudeM;
    return ((a2 - a1) / ds) * 100;
  });
}

/**
 * Décimation Douglas-Peucker VERTICALE : la distance mesurée est l’écart
 * d’altitude entre le point et la corde [premier ; dernier] du lot. Garantit
 * premier/dernier, erreur max ≤ tolérance (testée, chiffre mesuré).
 */
export function decimerVertical(
  sequence: readonly PointSequence[],
  toleranceM: number,
): readonly PointSequence[] {
  const n = sequence.length;
  if (n <= 2) return [...sequence];
  const garder = new Uint8Array(n);
  garder[0] = 1;
  garder[n - 1] = 1;
  const pile: [number, number][] = [[0, n - 1]];
  while (pile.length > 0) {
    const [a, b] = pile.pop() as [number, number];
    if (b - a < 2) continue;
    const sa = sequence[a]?.sM ?? 0;
    const sb = sequence[b]?.sM ?? sa;
    const aa = sequence[a]?.altitudeM ?? 0;
    const ab = sequence[b]?.altitudeM ?? aa;
    let ecartMax = -1;
    let iMax = -1;
    for (let i = a + 1; i < b; i++) {
      const s = sequence[i]?.sM ?? sa;
      const alt = sequence[i]?.altitudeM ?? aa;
      const t = (s - sa) / (sb - sa || 1);
      const ecart = Math.abs(alt - (aa + t * (ab - aa)));
      if (ecart > ecartMax) {
        ecartMax = ecart;
        iMax = i;
      }
    }
    if (ecartMax > toleranceM && iMax > 0) {
      garder[iMax] = 1;
      pile.push([a, iMax], [iMax, b]);
    }
  }
  return sequence.filter((_, i) => garder[i] === 1);
}

/** Erreur max de décimation : altitude de chaque point vs corde décimée. */
export function erreurMaxDecimation(
  sequence: readonly PointSequence[],
  decimes: readonly PointSequence[],
): number {
  if (decimes.length < 2) return 0;
  let ecartMax = 0;
  for (const point of sequence) {
    let a = 0;
    while (a < decimes.length - 2 && (decimes[a + 1]?.sM ?? Infinity) < point.sM) a++;
    const A = decimes[a];
    const B = decimes[a + 1];
    if (A === undefined || B === undefined) continue;
    const t = (point.sM - A.sM) / (B.sM - A.sM || 1);
    ecartMax = Math.max(ecartMax, Math.abs(point.altitudeM - (A.altitudeM + t * (B.altitudeM - A.altitudeM))));
  }
  return ecartMax;
}

/** Parts de distance par palier sur la séquence COMPLÈTE (pas seulement les
 *  points gardés) : chaque micro-segment prend le palier de la moyenne des
 *  pentes fenêtrées de ses extrémités — même règle que la couleur des aires. */
export function partsParPalier(
  sequence: readonly PointSequence[],
  pentes: readonly number[],
): readonly PartPalier[] {
  const cumul = new Map<Palier, number>();
  for (let i = 0; i < sequence.length - 1; i++) {
    const suivant = sequence[i + 1];
    if (suivant === undefined) continue;
    const p1 = pentes[i] ?? 0;
    const p2 = pentes[i + 1] ?? 0;
    const palier = palierDePente((p1 + p2) / 2);
    cumul.set(palier, (cumul.get(palier) ?? 0) + (suivant.sM - (sequence[i]?.sM ?? suivant.sM)));
  }
  const total = sequence.length > 0 ? (sequence[sequence.length - 1]?.sM ?? 0) : 0;
  return PALIERS.map((palier) => ({
    palier,
    part: total > 0 ? arrondi((cumul.get(palier) ?? 0) / total, 3) : 0,
  }));
}

/**
 * Construit le profil d’une épreuve depuis le document publié. Retourne
 * `null` sans épreuve ou sans géométrie exploitable (≥ 2 points) : aucune
 * visualisation, aucun chiffre — l’annonce texte de la coquille 9.3 reste.
 */
export function construireProfilEpreuve(doc: ParcoursDoc, slug: string): ProfilEpreuve | null {
  const vue = doc.epreuves[slug];
  if (vue === undefined) return null;
  const sequence = sequenceEpreuve(doc, slug);
  if (sequence.length < 2) return null;
  const pentes = pentesFenetrees(sequence);
  const decimes = decimerVertical(sequence, TOLERANCE_DP_M);
  const altitudeParId = new Map(doc.pointsDePassage.map((p) => [p.id, p.altitudeM]));
  const nomParId = new Map(doc.pointsDePassage.map((p) => [p.id, p.nom]));
  // Index de chaque point gardé dans la séquence complète : DP conserve
  // l’ordre, une marche monotone depuis l’indice du point gardé précédent
  // trouve le point STRICTEMENT égal (sM ET altitude) en O(n) — aucun repli
  // silencieux (0 en dernier recours, impossible par construction).
  let curseurSequence = 0;
  const points: PointProfil[] = decimes.map((point) => {
    while (
      curseurSequence < sequence.length &&
      (sequence[curseurSequence]?.sM !== point.sM ||
        sequence[curseurSequence]?.altitudeM !== point.altitudeM)
    ) {
      curseurSequence++;
    }
    return {
      sM: arrondi(point.sM, 1),
      altitudeM: arrondi(point.altitudeM, 1),
      pentePct: arrondi(pentes[curseurSequence] ?? 0, 1),
    };
  });
  return {
    distanceM: vue.distanceM,
    altitudeMinM: vue.altitudeMinM,
    altitudeMaxM: vue.altitudeMaxM,
    dplusM: vue.dplusM,
    points,
    parts: partsParPalier(sequence, pentes),
    marqueurs: vue.pointsDePassage.map((point) => ({
      id: point.id,
      nom: nomParId.get(point.id) ?? point.id,
      sM: point.sM,
      kilometre: point.kilometre,
      altitudeM: point.altitudeM ?? altitudeParId.get(point.id) ?? null,
      dplusSegmentAmontM: point.dplusSegmentAmontM,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Lectures du curseur (île client, pures et testées)                  */
/* ------------------------------------------------------------------ */

/** Pas clavier du curseur (mètres) : les flèches parcourent le profil. */
export const PAS_CURSEUR_M = 100;

/** Sens de la pente en toutes lettres — jamais le signe seul. */
export function sensPente(pentePct: number): 'montée' | 'descente' | 'plat' {
  if (pentePct > 0.05) return 'montée';
  if (pentePct < -0.05) return 'descente';
  return 'plat';
}

/** Le point décimé le plus proche d’une abscisse (lecture du curseur). */
export function pointLePlusProche(
  points: readonly PointProfil[],
  sM: number,
): PointProfil | null {
  let meilleur: PointProfil | null = null;
  let ecartMin = Infinity;
  for (const point of points) {
    const ecart = Math.abs(point.sM - sM);
    if (ecart < ecartMin) {
      ecartMin = ecart;
      meilleur = point;
    }
  }
  return meilleur;
}

/** Déplacement clavier : borné [0 ; distance], au pas PAS_CURSEUR_M. */
export function deplacerCurseur(sM: number, distanceM: number, deltaM: number): number {
  return Math.min(Math.max(sM + deltaM, 0), distanceM);
}

/**
 * AC 11.4 — « la lecture est possible au survol COMME au tap » : la SOURIS
 * lit au simple déplacement (sans bouton enfoncé) ; le TACTILE/STYLET exige
 * l’appui (un survol capacitif ne déclenche rien, un doigt posé glisse).
 * Décision PURE et testée : le composant ne fait que l’appliquer — aucun
 * test DOM n’étant possible, cette fonction est la garantie du comportement.
 */
export function lecturePendantDeplacement(pointerType: string, saisie: boolean): boolean {
  return pointerType === 'mouse' ? true : saisie;
}
