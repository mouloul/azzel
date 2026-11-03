// Story 11.1 — primitives géodésiques du pipeline GPX → parcours.json.
//
// Aucune dépendance : haversine suffit (segments < quelques dizaines de
// mètres), même formule que le POC Python (`poc/gpx.py`). Les arrondis sont
// « stables » : déterministes d’une exécution à l’autre (même entrée ⇒ même
// parcours.json octet pour octet — nécessaire pour la trace gelée) et sans
// « -0 » qui polluerait le JSON.

/** Rayon terrestre moyen (mètres) — convention haversine. */
const RAYON_TERRE_M = 6_371_000;

/** Distance orthodromique entre deux points (mètres). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const versRadians = (degres: number) => (degres * Math.PI) / 180;
  const dLat = versRadians(lat2 - lat1);
  const dLon = versRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(versRadians(lat1)) * Math.cos(versRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.sqrt(a));
}

/**
 * Arrondi décimal déterministe : `arrondi(678.25, 1)` vaut toujours `678.3`,
 * et le résultat n’est jamais `-0`.
 */
export function arrondi(valeur: number, decimales: number): number {
  const facteur = 10 ** decimales;
  const resultat = Math.round(valeur * facteur) / facteur;
  return Object.is(resultat, -0) ? 0 : resultat;
}
