// Story 7.3 (FR-19, NFR-7, AD-7) — contrat public de la carte anonyme.
// Unique source de vérité entre le backend (positions/traces servies, estompée
// calculée serveur) et la vitrine (rendu Leaflet) : le client ne RECALCULE
// jamais l'estompage, il affiche le drapeau servi. Anonymat par construction :
// dossard qualifié par épreuve + position horodatée — JAMAIS de nom, contact,
// photo ni jeton (l'existence de positions en base EST l'opt-in, 6.2).

/** [ASSUMPTION: X = 1 h, à confirmer] âge d'estompage d'une position. */
export const POSITION_ESTOMPEE_MS = 3_600_000;

/** Dernière position connue d'un coureur, ANONYME (dossard + épreuve seule). */
export interface PositionPublique {
  dossard: number;
  epreuveSlug: string;
  epreuveNom: string;
  lat: number;
  lon: number;
  /** ISO 8601 UTC strict (heure APPAREIL de capture, donnée brute). */
  capteA: string;
  /** Vrai si capteA est plus vieux que POSITION_ESTOMPEE_MS (calcul SERVEUR). */
  estompée: boolean;
}

/** Un point de tracé épreuve : coordonnées seules, rien d'autre ne fuit. */
export interface PointTrace {
  lat: number;
  lon: number;
}

/** Tracé GPX d'une épreuve, déjà réduit côté SERVEUR (≤ MAX_POINTS_TRACE). */
export interface TracePublique {
  epreuveSlug: string;
  epreuveNom: string;
  points: PointTrace[];
}

/** Plafond d'échantillonnage d'un tracé servi (fidélité visuelle suffisante). */
export const MAX_POINTS_TRACE = 500;

/**
 * Une position est ESTOMPÉE dès que son âge DÉPASSE strictement
 * POSITION_ESTOMPEE_MS (exactement 1 h → pas encore estompée). Pure : une
 * capteA illisible est estompée (défense en profondeur — jamais une position
 * abherrante présentée comme fraîche).
 */
export function estEstompee(capteA: string, maintenant: Date): boolean {
  const capte = Date.parse(capteA);
  if (Number.isNaN(capte)) {
    return true;
  }
  return maintenant.getTime() - capte > POSITION_ESTOMPEE_MS;
}

/**
 * Libellé sobre de la dernière position connue : « il y a X min » puis
 * « il y a X h » (registre vitrine, jamais alarmiste). Moins d'une minute →
 * « il y a 1 min » (plancher honnête, jamais « il y a 0 min »). Une capteA
 * illisible replie sur l'âge d'estompage (cohérent avec estEstompee :
 * jamais présentée comme fraîche) ; dans le futur → plancher (jamais négatif).
 */
export function libelleDerniereConnue(capteA: string, maintenant: Date): string {
  const capte = Date.parse(capteA);
  const ageMs = Number.isNaN(capte)
    ? POSITION_ESTOMPEE_MS
    : Math.max(0, maintenant.getTime() - capte);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) {
    return `il y a ${Math.max(1, minutes)} min`;
  }
  return `il y a ${Math.floor(minutes / 60)} h`;
}

/**
 * Échantillonnage régulier d'un tracé : garde TOUJOURS les extrémités
 * (départ/arrivée) et répartit les max points à intervalles réguliers sur le
 * tracé d'origine (index arrondis, jamais cumulés — aucune dérive). Entrée
 * ≤ max : retournée TELLE QUELLE (même référence, zéro copie inutile).
 * max < 2 : erreur de programmation (un tracé vit au moins départ + arrivée).
 */
export function echantillonnerPoints(
  points: readonly PointTrace[],
  max: number = MAX_POINTS_TRACE,
): PointTrace[] {
  if (!Number.isInteger(max) || max < 2) {
    throw new Error('echantillonnerPoints : max doit être un entier ≥ 2');
  }
  if (points.length <= max) {
    return points as PointTrace[];
  }
  const echantillon: PointTrace[] = [];
  const stride = (points.length - 1) / (max - 1);
  for (let rang = 0; rang < max; rang += 1) {
    echantillon.push(points[Math.round(rang * stride)] as PointTrace);
  }
  return echantillon;
}
