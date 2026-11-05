import { arrondi } from './geo';
import { BORNES_PENTE_PCT, type Palier, type ProfilEpreuve } from './profil';

/**
 * Fiche technique rédigée depuis le profil publié : tout ce qu'elle affiche se
 * lit dans le relevé, rien n'est saisi à la main. Quand le tracé officiel
 * remplacera le relevé d'essai, le texte suit. La nature du sol (pierrier,
 * racines, sentier large) n'est PAS dans un relevé GPX : elle n'est pas dite ici.
 */

/** Écart d'altitude minimal pour compter un changement de sens (bruit GPS exclu). */
const SEUIL_TRONCON_M = 30;

const NBSP = ' ';
const formatNombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatEntier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export interface Troncon {
  deKm: number;
  aKm: number;
  /** Dénivelé du tronçon, en valeur absolue (mètres). */
  deniveleM: number;
  /** Pente moyenne, en valeur absolue (%). */
  penteMoyennePct: number;
}

export interface AnalyseProfil {
  distanceKm: number;
  dplusM: number;
  departAltitudeM: number;
  pointBas: { km: number; altitudeM: number };
  pointHaut: { km: number; altitudeM: number };
  plusLongueMontee: Troncon | null;
  plusLongueDescente: Troncon | null;
  penteMaxMonteePct: number;
  penteMaxDescentePct: number;
  /** Distance + D+/100 : la mesure d'effort courante en trail. */
  kmEffort: number;
  dplusParKm: number;
  /** Part de distance par palier, en % entier. */
  partsPct: Record<Palier, number>;
}

type PointProfilLu = ProfilEpreuve['points'][number];

/** Tronçons montants / descendants entre changements de sens d'au moins `SEUIL_TRONCON_M`. */
function tronconsMonotones(points: readonly PointProfilLu[]): {
  montees: Troncon[];
  descentes: Troncon[];
} {
  const montees: Troncon[] = [];
  const descentes: Troncon[] = [];
  const premier = points[0];
  if (premier === undefined) return { montees, descentes };

  const fermer = (de: PointProfilLu, a: PointProfilLu) => {
    const longueurM = a.sM - de.sM;
    const delta = a.altitudeM - de.altitudeM;
    if (longueurM <= 0 || delta === 0) return;
    const troncon: Troncon = {
      deKm: arrondi(de.sM / 1000, 1),
      aKm: arrondi(a.sM / 1000, 1),
      deniveleM: Math.round(Math.abs(delta)),
      penteMoyennePct: (Math.abs(delta) / longueurM) * 100,
    };
    (delta > 0 ? montees : descentes).push(troncon);
  };

  // `ancre` : début du tronçon en cours ; `extreme` : point le plus avancé dans
  // le sens courant. Le sens bascule quand le profil recule de SEUIL_TRONCON_M.
  let sens = 0;
  let ancre = premier;
  let extreme = premier;
  for (const point of points) {
    if (sens === 0) {
      if (point.altitudeM - ancre.altitudeM >= SEUIL_TRONCON_M) {
        sens = 1;
        extreme = point;
      } else if (ancre.altitudeM - point.altitudeM >= SEUIL_TRONCON_M) {
        sens = -1;
        extreme = point;
      }
      continue;
    }
    const avance = sens === 1 ? point.altitudeM >= extreme.altitudeM : point.altitudeM <= extreme.altitudeM;
    if (avance) {
      extreme = point;
      continue;
    }
    if (Math.abs(point.altitudeM - extreme.altitudeM) >= SEUIL_TRONCON_M) {
      fermer(ancre, extreme);
      sens = -sens;
      ancre = extreme;
      extreme = point;
    }
  }
  const dernier = points[points.length - 1];
  if (sens !== 0 && dernier !== undefined) fermer(ancre, dernier);
  return { montees, descentes };
}

function plusLong(troncons: readonly Troncon[]): Troncon | null {
  let retenu: Troncon | null = null;
  for (const t of troncons) {
    if (retenu === null || t.aKm - t.deKm > retenu.aKm - retenu.deKm) retenu = t;
  }
  return retenu;
}

export function analyserProfil(profil: ProfilEpreuve): AnalyseProfil {
  const { points } = profil;
  let bas = points[0];
  let haut = points[0];
  for (const p of points) {
    if (bas === undefined || p.altitudeM < bas.altitudeM) bas = p;
    if (haut === undefined || p.altitudeM > haut.altitudeM) haut = p;
  }
  const distanceKm = profil.distanceM / 1000;
  const { montees, descentes } = tronconsMonotones(points);
  const partsPct: Record<Palier, number> = { roulant: 0, soutenu: 0, raide: 0, 'tres-raide': 0 };
  for (const { palier, part } of profil.parts) partsPct[palier] = Math.round(part * 100);

  return {
    distanceKm,
    dplusM: profil.dplusM,
    departAltitudeM: Math.round(points[0]?.altitudeM ?? profil.altitudeMinM),
    pointBas: {
      km: arrondi((bas?.sM ?? 0) / 1000, 1),
      altitudeM: Math.round(bas?.altitudeM ?? profil.altitudeMinM),
    },
    pointHaut: {
      km: arrondi((haut?.sM ?? 0) / 1000, 1),
      altitudeM: Math.round(haut?.altitudeM ?? profil.altitudeMaxM),
    },
    plusLongueMontee: plusLong(montees),
    plusLongueDescente: plusLong(descentes),
    penteMaxMonteePct: profil.penteMaxMonteePct,
    penteMaxDescentePct: profil.penteMaxDescentePct,
    kmEffort: arrondi(distanceKm + profil.dplusM / 100, 1),
    dplusParKm: Math.round(profil.dplusM / Math.max(distanceKm, 0.1)),
    partsPct,
  };
}

function qualifierEffort(dplusParKm: number): string {
  if (dplusParKm < 20) return 'roulant';
  if (dplusParKm < 35) return 'vallonné';
  if (dplusParKm < 50) return 'exigeant';
  return 'très exigeant';
}

const m = (valeur: number) => `${formatEntier.format(valeur)}${NBSP}m`;
const km = (valeur: number) => `${formatNombre.format(valeur)}${NBSP}km`;
const repereKm = (valeur: number) => `km${NBSP}${formatNombre.format(valeur)}`;
const pct = (valeur: number) => `${formatEntier.format(valeur)}${NBSP}%`;

/** Trois paragraphes : le relief, l'effort, les pentes. */
export function redigerFicheTechnique(a: AnalyseProfil): string[] {
  const relief: string[] = [
    `Départ à ${m(a.departAltitudeM)}. Le point bas est à ${m(a.pointBas.altitudeM)} (${repereKm(a.pointBas.km)}), le point haut à ${m(a.pointHaut.altitudeM)} (${repereKm(a.pointHaut.km)}) : ${m(a.pointHaut.altitudeM - a.pointBas.altitudeM)} d’amplitude sur ${km(a.distanceKm)}.`,
  ];
  const montee = a.plusLongueMontee;
  if (montee !== null) {
    relief.push(
      `La plus longue montée s’étire sur ${km(montee.aKm - montee.deKm)}, du ${repereKm(montee.deKm)} au ${repereKm(montee.aKm)} (+${m(montee.deniveleM)}, ${pct(montee.penteMoyennePct)} de pente moyenne).`,
    );
  }
  const descente = a.plusLongueDescente;
  if (descente !== null) {
    relief.push(
      `La plus longue descente couvre ${km(descente.aKm - descente.deKm)} (−${m(descente.deniveleM)}).`,
    );
  }

  const effort = `${m(a.dplusM)} de dénivelé positif sur ${km(a.distanceKm)}, soit ${formatEntier.format(a.dplusParKm)}${NBSP}m par kilomètre : environ ${formatNombre.format(a.kmEffort)}${NBSP}km-effort. Un profil ${qualifierEffort(a.dplusParKm)}.`;

  const { partsPct: p } = a;
  const { soutenu, raide, tresRaide } = BORNES_PENTE_PCT;
  const tresRaideKm = (p['tres-raide'] / 100) * a.distanceKm;
  const pentes = [
    `${pct(p.roulant)} du tracé est roulant (moins de ${pct(soutenu)}), ${pct(p.soutenu)} soutenu (${soutenu} à ${pct(raide)}), ${pct(p.raide)} raide (${raide} à ${pct(tresRaide)}) et ${pct(p['tres-raide'])} très raide (plus de ${pct(tresRaide)}${tresRaideKm >= 0.1 ? `, soit près de ${km(tresRaideKm)} cumulés` : ''}).`,
    `Pentes maximales mesurées : ${pct(a.penteMaxMonteePct)} en montée, ${pct(a.penteMaxDescentePct)} en descente.`,
  ].join(' ');

  return [relief.join(' '), effort, pentes];
}
