import type { ParcoursDoc } from './construire';

/** Nature d'un repère : elle fixe la couleur de sa pastille sur la carte. */
export type TypeRepere = 'depart' | 'arrivee' | 'ravitaillement' | 'passage';

/** Point de passage prêt pour une pastille de carte. */
export interface Repere {
  id: string;
  nom: string;
  lon: number;
  lat: number;
  type: TypeRepere;
  /**
   * Texte DANS la pastille, un ou deux caractères : « D », « A », ou le numéro
   * du ravitaillement. Retour comité 2027 : toutes les pastilles des
   * ravitaillements affichaient « R », impossible de les distinguer.
   */
  pastille: string;
  /** Première ligne de l'infobulle : « Ravitaillement 2 », « Départ »… */
  titre: string;
  /** Nom propre du point, sous le titre (« Le premier souffle »), s'il en a un. */
  sousTitre: string | null;
  /** Mesures du point : kilomètre, altitude, D+ depuis le point précédent. */
  mesures: string[];
  /** Services en toutes lettres, vide si inconnus (jamais inventés). */
  services: string[];
  /** Phrase complète : nom accessible de la pastille (lecteurs d'écran). */
  libelle: string;
}

/** Espace fine insécable entre un nombre et son unité (« km 9 », « 812 m »). */
const NBSP = '\u202f';
const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatM = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function typeDe(id: string, nom: string): TypeRepere {
  if (id === 'depart' || id.endsWith('-depart')) return 'depart';
  if (id === 'arrivee' || id.endsWith('-arrivee')) return 'arrivee';
  if (/^ravitaillement\b/i.test(nom)) return 'ravitaillement';
  return 'passage';
}

function pastilleDe(type: TypeRepere, nom: string): string {
  if (type === 'depart') return 'D';
  if (type === 'arrivee') return 'A';
  if (type === 'ravitaillement') return /^ravitaillement\s+(\d{1,2})\b/i.exec(nom)?.[1] ?? 'R';
  return nom.slice(0, 1).toUpperCase();
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
    const type = typeDe(point.id, repere.nom);
    // « Ravitaillement 2 · Le dernier coup de collier » : le titre, puis le nom propre.
    const [titre = repere.nom, ...reste] = repere.nom.split(' · ');
    const sousTitre = reste.length > 0 ? reste.join(' · ') : null;

    const mesures: string[] = [];
    if (point.kilometre !== null) mesures.push(`km${NBSP}${formatKm.format(point.kilometre)}`);
    const altitude = point.altitudeM ?? repere.altitudeM;
    if (altitude !== null) mesures.push(`${formatM.format(altitude)}${NBSP}m d’altitude`);
    if (point.dplusSegmentAmontM !== null && point.dplusSegmentAmontM > 0) {
      mesures.push(`+${formatM.format(point.dplusSegmentAmontM)}${NBSP}m de D+ depuis le point précédent`);
    }
    const services = repere.services !== null ? [...repere.services] : [];

    const morceaux = [repere.nom, ...mesures];
    if (services.length > 0) morceaux.push(services.join(', '));
    return [
      {
        id: point.id,
        nom: repere.nom,
        lon: repere.lon,
        lat: repere.lat,
        type,
        pastille: pastilleDe(type, repere.nom),
        titre,
        sousTitre,
        mesures,
        services,
        libelle: morceaux.join(' · '),
      },
    ];
  });
}
