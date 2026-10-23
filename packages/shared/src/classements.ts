// Story 7.1 (FR-15, AD-3, NFR-4) — contrat des classements par épreuve.
// Unique source de vérité entre le calcul serveur (module chrono) et les
// surfaces à venir (vitrine publique 7.2) : AUCUN recalcul client — les rangs,
// temps et statuts sont servis prêts à l'afficher, la vitrine filtre (catégorie
// d'âge) sans jamais recompter.
//
// Temps = horodatage de réception SERVEUR du premier passage ARRIVÉE arbitré
// (AD-3) − heure de départ OFFICIELLE de l'épreuve : jamais l'heure appareil,
// jamais un scan de départ. Départs échelonnés : chaque épreuve porte SA
// référence, le rang ne se compare qu'ENTRE coureurs de la même épreuve.
//
// Le classement est PROVISOIRE par nature : le libellé fait partie du contrat
// (jamais « officiel », jamais « temps réel ») et la fraîcheur (dernier passage
// reçu) voyage avec.

/** Catégories d'âge au classement (calque du CHECK coureur.age_category). */
export const CATEGORIES_AGE_CLASSEMENT = ['U20', 'Senior', 'V1', 'V2', 'V3'] as const;

export type CategorieAgeClassement = (typeof CATEGORIES_AGE_CLASSEMENT)[number];

/** Statut de course d'un partant au moment du calcul. */
export type StatutLigneClassement = 'arrivé' | 'en-course' | 'abandonné';

/**
 * Une ligne de classement : un partant (validé, numéroté, retiré) de SON
 * épreuve. `rang`/`tempsMs` null tant que la ligne n'est pas arrivée ou que
 * l'épreuve n'a pas d'heure de départ — jamais de temps faux à zéro.
 */
export interface LigneClassement {
  dossard: number;
  rang: number | null;
  tempsMs: number | null;
  statut: StatutLigneClassement;
  categorieAge: CategorieAgeClassement;
}

/**
 * Classement d'UNE épreuve. `configure` false = aucune heure de départ
 * officielle : les lignes restent (statuts honnêtes) mais SANS temps ni rang.
 * `abandons` = dossards abandonnés, listés à part — jamais rangés.
 */
export interface ClassementEpreuve {
  epreuveSlug: string;
  epreuveNom: string;
  distanceKm: number;
  heureDepart: string | null;
  configure: boolean;
  lignes: LigneClassement[];
  abandons: number[];
}

/**
 * Le libellé réglementaire du classement servi : provisoire, en toutes
 * lettres — jamais « officiel » ni « temps réel ».
 */
export const LIBELLE_CLASSEMENT = 'Classement provisoire';

/**
 * Classements de l'édition courante, calculés à UN instant (NFR-4 : une
 * transaction, jamais un classement partiel incohérent). `genereA` = horloge
 * serveur du calcul, `fraicheur` = dernier passage reçu (null avant tout
 * départ).
 */
export interface ClassementsEdition {
  genereA: string;
  fraicheur: string | null;
  libelle: 'Classement provisoire';
  epreuves: ClassementEpreuve[];
}

/**
 * Rangs ex æquo (classement compétition « dense ») : à temps ÉGAUX, même rang
 * — le rang suivant est SAUTÉ (1, 1, 3). Pure et indépendante de l'ordre
 * d'entrée : le rang d'un temps vaut 1 + nombre de temps strictement plus
 * petits. Un temps non fini est une erreur de programmation (jamais silencé).
 */
export function departagerExAequo(temps: readonly number[]): number[] {
  for (const valeur of temps) {
    if (!Number.isFinite(valeur)) {
      throw new Error('departagerExAequo : chaque temps doit être un nombre fini (ms)');
    }
  }
  return temps.map((valeur) => 1 + temps.reduce((plusPetits, autre) => (autre < valeur ? plusPetits + 1 : plusPetits), 0));
}
