import { arrondi } from './geo';
import { palierDePente, type PointProfil } from './profil';

/**
 * Géométrie du profil altimétrique tel que le POC le dessine (module PUR).
 *
 * Le POC (« Trail d'Ath Aïssi », carte 3D) a été retenu pour son rendu : un
 * grand viewBox 1000 × 300 plafonné en hauteur, des aires colorées par pente,
 * un curseur qui suit le pointeur. Ce module en reprend la géométrie et les
 * teintes ; la mise en page est dans `components/vue-parcours.tsx`.
 *
 * Pas de dépendance à React : tout se teste sans navigateur.
 */

/** ViewBox et marges du POC, en unités viewBox. */
export const VUE = {
  largeur: 1000,
  hauteur: 300,
  gauche: 54,
  droite: 16,
  haut: 46,
  bas: 54,
} as const;

/** Pas des lignes de grille d'altitude (mètres), comme dans le POC. */
export const PAS_GRILLE_M = 200;

/**
 * Les quatre teintes du POC, de roulant à très raide : vert, vert-jaune, ambre,
 * orange. Elles se distinguent par la TEINTE et pas seulement par la clarté —
 * l'échelle du profil précédent (deux verts voisins) rendait roulant et
 * soutenu indiscernables, 76 % de la distance formant « une seule masse verte »
 * (revue visuelle du 04/11/2026, M1).
 *
 * Littéraux assumés : ce sont des couleurs de DONNÉE dessinées dans un SVG, pas
 * des couleurs d'interface, et elles doivent rester identiques dans les deux
 * thèmes pour que la légende reste vraie.
 */
export const PALETTE_PENTE_VUE = ['#4caf72', '#9fc93c', '#e0a33e', '#e4572e'] as const;

const ORDRE_PALIERS = ['roulant', 'soutenu', 'raide', 'tres-raide'] as const;

/** Teinte d'une pente. Mêmes bornes que la légende (5 / 12 / 20 %, sur la valeur absolue). */
export function couleurPenteVue(pentePct: number): string {
  const palier = palierDePente(pentePct);
  return PALETTE_PENTE_VUE[ORDRE_PALIERS.indexOf(palier)] ?? PALETTE_PENTE_VUE[0];
}

export interface EchellesVue {
  x: (sM: number) => number;
  y: (altitudeM: number) => number;
  /** Ordonnée de la base du graphe (le sol de l'aire colorée). */
  yBase: number;
  /** Bornes d'altitude arrondies à la centaine, comme le POC. */
  amin: number;
  amax: number;
}

export function echellesVue(distanceM: number, altitudeMinM: number, altitudeMaxM: number): EchellesVue {
  const utileX = VUE.largeur - VUE.gauche - VUE.droite;
  const utileY = VUE.hauteur - VUE.haut - VUE.bas;
  const amin = Math.floor(altitudeMinM / 100) * 100;
  const amaxBrut = Math.ceil(altitudeMaxM / 100) * 100;
  // Une plage nulle (parcours parfaitement plat) ne doit pas diviser par zéro.
  const amax = amaxBrut > amin ? amaxBrut : amin + 100;
  return {
    x: (sM) => arrondi(VUE.gauche + (sM / Math.max(distanceM, 1)) * utileX, 1),
    y: (altitudeM) => arrondi(VUE.haut + utileY - ((altitudeM - amin) / (amax - amin)) * utileY, 1),
    yBase: VUE.hauteur - VUE.bas,
    amin,
    amax,
  };
}

/** Lignes de grille d'altitude : un multiple de 200 m, de la base au sommet. */
export function graduationsAltitudeVue(amin: number, amax: number): number[] {
  const valeurs: number[] = [];
  for (let a = Math.ceil(amin / PAS_GRILLE_M) * PAS_GRILLE_M; a <= amax; a += PAS_GRILLE_M) {
    valeurs.push(a);
  }
  return valeurs;
}

export interface SegmentVue {
  couleur: string;
  /** Polygone fermé : le segment de courbe puis la base, pour l'aire colorée. */
  aire: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Un segment par intervalle de points décimés. La couleur est le palier de la
 * pente MOYENNE de ses deux extrémités : une transition entre deux paliers ne
 * se colore pas du palier de l'un des deux au hasard.
 */
export function segmentsVue(points: readonly PointProfil[], echelles: EchellesVue): SegmentVue[] {
  const segments: SegmentVue[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === undefined || b === undefined) continue;
    const x1 = echelles.x(a.sM);
    const y1 = echelles.y(a.altitudeM);
    const x2 = echelles.x(b.sM);
    const y2 = echelles.y(b.altitudeM);
    segments.push({
      couleur: couleurPenteVue((a.pentePct + b.pentePct) / 2),
      aire: `M${x1} ${y1} L${x2} ${y2} L${x2} ${echelles.yBase} L${x1} ${echelles.yBase} Z`,
      x1,
      y1,
      x2,
      y2,
    });
  }
  return segments;
}

/** Point du profil le plus proche d'une abscisse (dichotomie), ou null si vide. */
export function pointLePlusProche(points: readonly PointProfil[], sM: number): PointProfil | null {
  if (points.length === 0) return null;
  let bas = 0;
  let haut = points.length - 1;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if ((points[milieu]?.sM ?? 0) < sM) bas = milieu + 1;
    else haut = milieu;
  }
  const apres = points[bas];
  const avant = points[Math.max(bas - 1, 0)];
  if (apres === undefined || avant === undefined) return null;
  return Math.abs(avant.sM - sM) <= Math.abs(apres.sM - sM) ? avant : apres;
}

/**
 * Distance parcourue sous le pointeur, depuis son abscisse en pixels dans le
 * SVG rendu. Borné à la zone utile : un pointeur dans la marge de l'axe
 * indique le départ ou l'arrivée, jamais une distance négative.
 */
export function sMDepuisPointeur(xPixel: number, largeurRendue: number, distanceM: number): number {
  if (largeurRendue <= 0) return 0;
  const xVue = (xPixel / largeurRendue) * VUE.largeur;
  const borne = Math.min(Math.max(xVue, VUE.gauche), VUE.largeur - VUE.droite);
  const utile = VUE.largeur - VUE.gauche - VUE.droite;
  return Math.min(Math.max(((borne - VUE.gauche) / utile) * distanceM, 0), distanceM);
}

/**
 * Nouvelle position du curseur après une touche, ou `undefined` si la touche
 * n'est pas la nôtre (Tab, lettres… : le navigateur garde la main). `null`
 * retire le curseur.
 *
 * Le POC ne se pilotait qu'à la souris : sans clavier, le profil n'était
 * lisible ni au clavier ni au lecteur d'écran.
 */
export function sMApresTouche(
  touche: string,
  grandPas: boolean,
  sMCourant: number | null,
  distanceM: number,
): number | null | undefined {
  const pas = distanceM * (grandPas ? 0.05 : 0.01);
  const borne = (valeur: number) => Math.min(Math.max(valeur, 0), distanceM);
  switch (touche) {
    case 'ArrowRight':
      return borne((sMCourant ?? 0) + pas);
    case 'ArrowLeft':
      return borne((sMCourant ?? 0) - pas);
    case 'Home':
      return 0;
    case 'End':
      return distanceM;
    case 'Escape':
      return null;
    default:
      return undefined;
  }
}
