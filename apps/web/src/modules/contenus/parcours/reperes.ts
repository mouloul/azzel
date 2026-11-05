import type { ParcoursDoc } from './construire';

/** Point de passage prêt pour une pastille de carte. */
export interface Repere {
  id: string;
  nom: string;
  lon: number;
  lat: number;
  /** Texte de l'infobulle : nom, kilomètre, altitude, D+ du segment, services. */
  libelle: string;
}

/**
 * Points de passage d'une épreuve, prêts pour les pastilles de la carte.
 *
 * Lus sur le document publié : nom, kilomètre, altitude, D+ du segment amont
 * et services, tels que la story 11.1 les a calculés (UX-DR-26). Jamais de
 * valeur inventée — un champ absent ne s'affiche pas.
 *
 * Pure : le document est passé en paramètre. La page parcours et l'API que
 * l'accueil appelle à l'ouverture de la carte lisent ainsi le MÊME code.
 */
export function reperesEpreuve(doc: ParcoursDoc | null, slug: string): Repere[] {
  // hasOwn : le slug peut venir d'une URL publique, et `epreuves['constructor']`
  // rendrait la fonction héritée de Object plutôt que `undefined`.
  if (doc == null || !Object.hasOwn(doc.epreuves, slug)) return [];
  const epreuve = doc.epreuves[slug];
  if (epreuve === undefined) return [];
  const base = new Map(doc.pointsDePassage.map((point) => [point.id, point]));
  return epreuve.pointsDePassage.flatMap((point) => {
    const repere = base.get(point.id);
    if (repere === undefined) return [];
    const morceaux = [repere.nom];
    if (point.kilometre !== null) morceaux.push(`km ${point.kilometre}`);
    const altitude = point.altitudeM ?? repere.altitudeM;
    if (altitude !== null) morceaux.push(`${Math.round(altitude)} m`);
    if (point.dplusSegmentAmontM !== null && point.dplusSegmentAmontM > 0) {
      morceaux.push(`+${Math.round(point.dplusSegmentAmontM)} m de D+ depuis le point précédent`);
    }
    if (repere.services !== null && repere.services.length > 0) {
      morceaux.push(repere.services.join(', '));
    }
    return [
      {
        id: point.id,
        nom: repere.nom,
        lon: repere.lon,
        lat: repere.lat,
        libelle: morceaux.join(' · '),
      },
    ];
  });
}
