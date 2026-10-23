// Story 7.1 (FR-15, AD-3, NFR-4) — contrat des classements par épreuve.
// Unique source de vérité entre le calcul serveur (module chrono) et les
// surfaces à venir (vitrine publique 7.2) : AUCUN recalcul client — les rangs,
// temps et statuts sont servis prêts à l'afficher, la vitrine filtre (catégorie
// d'âge) sans jamais recompter.

import { DEFAULT_LOCALE, formatLocalHeure } from './datetime';
//
// Temps = horodatage de réception SERVEUR du premier passage ARRIVÉE arbitré
// (AD-3) − heure de départ OFFICIELLE de l'épreuve : jamais l'heure appareil,
// jamais un scan de départ. Départs échelonnés : chaque épreuve porte SA
// référence, le rang ne se compare qu'ENTRE coureurs de la même épreuve.
//
// Le classement est PROVISOIRE par nature : le libellé fait partie du contrat
// (jamais « officiel », jamais « temps réel ») et la fraîcheur (dernier passage
// reçu) voyage avec.
//
// Story 7.2 — le contrat public /resultats ÉTEND le contrat classements SANS
// le recalculer : mêmes classements servis prêts à l'afficher + les derniers
// arrivés (10), anonymes par construction (dossard qualifié par épreuve).

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

// ---------------------------------------------------------------------------
// Story 7.2 — résultats en direct partageables (FR-16, SM-5, AD-7).
// ---------------------------------------------------------------------------

/**
 * Un arrivé récent, ANONYME : le dossard est le seul identifiant exposé,
 * qualifié par son épreuve (et, dans le contexte de page, par l'édition).
 * `tempsMs` null si l'épreuve n'a pas d'heure de départ officielle — jamais
 * de temps faux à zéro (calque LigneClassement).
 */
export interface DernierArrive {
  dossard: number;
  epreuveSlug: string;
  epreuveNom: string;
  tempsMs: number | null;
}

/** Nombre d'arrivés servis dans « derniers arrivés » (contrat figé). */
export const MAX_DERNIERS_ARRIVES = 10;

/**
 * Le contrat public servi par /resultats (SSR ET polling /api/resultats) :
 * les classements 7.1 TELS QUELS + les derniers arrivés. La vitrine n'est
 * qu'un rafraîchisseur : AUCUN recalcul client (AD-7).
 */
export interface ResultatsPublic {
  classements: ClassementsEdition;
  derniersArrives: DernierArrive[];
}

/**
 * Prochaine heure de départ officielle : la PLUS TÔT des heures À VENIR
 * (instant ≥ maintenant). Repli sur la plus tôt TOUTES CONFONDUES si aucune
 * n'est à venir (départs passés mais toujours aucun partant : le premier
 * départ du jour reste le repère honnête). Pure, indépendante de l'ordre ;
 * la comparaison se fait par INSTANTS (Date.parse), jamais par tri
 * lexicographique des chaînes — deux ISO décrivant le même instant à des
 * offsets près ne peuvent pas inverser l'ordre. Une heure illisible est
 * ignorée (défense en profondeur) ; null si AUCUNE épreuve n'est configurée
 * (l'état vide devient alors neutre — jamais un départ à 00:00).
 */
export function prochaineHeureDepart(
  epreuves: readonly { heureDepart: string | null }[],
  maintenant?: Date,
): string | null {
  let plusTot: string | null = null;
  let plusTotInstant = Number.POSITIVE_INFINITY;
  let aVenir: string | null = null;
  let aVenirInstant = Number.POSITIVE_INFINITY;
  for (const epreuve of epreuves) {
    const heure = epreuve.heureDepart;
    if (heure === null) {
      continue;
    }
    const instant = Date.parse(heure);
    if (Number.isNaN(instant)) {
      continue;
    }
    if (instant < plusTotInstant) {
      plusTotInstant = instant;
      plusTot = heure;
    }
    if (
      maintenant !== undefined &&
      instant >= maintenant.getTime() &&
      instant < aVenirInstant
    ) {
      aVenirInstant = instant;
      aVenir = heure;
    }
  }
  return aVenir ?? plusTot;
}

/** État vide sans heure configurée : texte NEUTRE, jamais un départ à 00:00. */
export const ETAT_VIDE_SANS_HEURE = 'Les résultats apparaîtront au départ';

/**
 * Libellé de l'état vide avant départ (verbatim, vouvoiement vitrine) :
 * « Pas encore de partants — départ à HH:MM » en heure LOCALE, ou le texte
 * neutre si aucune heure n'est configurée (ou illisible — défense en
 * profondeur : jamais un crash d'affichage pour une donnée amont abherrante).
 */
export function libelleEtatVide(
  prochaineDepartIso: string | null,
  locale: string = DEFAULT_LOCALE,
): string {
  if (prochaineDepartIso === null) {
    return ETAT_VIDE_SANS_HEURE;
  }
  const date = new Date(prochaineDepartIso);
  if (Number.isNaN(date.getTime())) {
    return ETAT_VIDE_SANS_HEURE;
  }
  return `Pas encore de partants — départ à ${formatLocalHeure(prochaineDepartIso, locale)}`;
}

/**
 * Formate un temps de course (ms) pour la vitrine : « 2 h 05 min 38 s »,
 * « 40 min 05 s », « 45 s » — registre sobre, chiffres tabulaires. Un temps
 * négatif (arrivée reçue avant une heure de départ configurée tard) reste
 * HONNÊTE : signe affiché, jamais clampé (calque departagerExAequo).
 */
export function formaterDureeCourse(tempsMs: number): string {
  if (!Number.isFinite(tempsMs)) {
    throw new Error('formaterDureeCourse : le temps doit être un nombre fini (ms)');
  }
  const signe = tempsMs < 0 ? '−' : '';
  const totalSecondes = Math.floor(Math.abs(tempsMs) / 1000);
  const heures = Math.floor(totalSecondes / 3600);
  const minutes = Math.floor((totalSecondes % 3600) / 60);
  const secondes = totalSecondes % 60;
  const pad = (valeur: number): string => String(valeur).padStart(2, '0');
  if (heures > 0) {
    return `${signe}${heures} h ${pad(minutes)} min ${pad(secondes)} s`;
  }
  if (minutes > 0) {
    return `${signe}${minutes} min ${pad(secondes)} s`;
  }
  return `${signe}${secondes} s`;
}
