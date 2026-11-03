// Story 9.3 — contrat de données de la section parcours de l’accueil.
//
// Cette section vit côté vitrine mais ne possède AUCUNE source de vérité
// propre : les épreuves (slug, nom, distance, GPX) viennent de
// `getParcoursPage()` (mêmes lignes que la page /parcours, même store). Les
// champs que l’épopée 11 remplira — dénivelés, altitudes, horaires, points de
// passage — sont OPTIONNELS et valent `null` tant que `parcours.json`
// (story 11.1) n’existe pas : un champ null n’est simplement pas rendu.
//
// POINT DE BRANCHEMENT ÉPOPÉE 11 (story 11.1) : c’est ICI, et seulement ici,
// que `parcours.json` se raccordera — `getSectionParcours()` fusionnera les
// métriques et points de passage du JSON dans ce contrat, SANS toucher au
// composant de rendu (`components/section-parcours.tsx`), qui sait déjà
// afficher chaque champ non nul.
//
// Référentiel des kilométrages (UX-DR-31) : un point de passage partagé par
// les deux épreuves n’a pas le même kilomètre dans chacune. Les points vivent
// donc DANS chaque épreuve, avec leur kilomètre dans le référentiel de CETTE
// épreuve — le rendu ne montre jamais un kilométrage orphelin de l’épreuve
// active (il est dans le panneau de l’épreuve, sous son nom).

import { getParcoursPage, type ContenusServiceDeps, type EpreuveView } from './service';

/**
 * Synthèse chiffrée d’une épreuve. Tous les champs sont optionnels : la
 * story 11.1 les remplira depuis `parcours.json` ; tant qu’ils valent
 * `null`, la ligne correspondante n’est pas rendue (pas de tiret, pas de
 * valeur grisée — aucun chiffre inventé sur une page publique).
 */
export interface MetriquesEpreuve {
  /** Dénivelé positif cumulé, en mètres. */
  denivelePositifM: number | null;
  /** Dénivelé négatif cumulé, en mètres. */
  deniveleNegatifM: number | null;
  altitudeMinM: number | null;
  altitudeMaxM: number | null;
  /** Heure de départ déjà formatée pour affichage (ex. « 08 h 30 »). */
  heureDepart: string | null;
  /** Barrière horaire déjà formatée pour affichage. */
  barriereHoraire: string | null;
}

/**
 * Point de passage (ravitaillement, sommet, croisement…) VU PAR UNE ÉPREUVE :
 * `kilometre` est dans le référentiel de cette épreuve, pas un kilométrage
 * global. `id` porte l’identité unique du point sur la géométrie de base —
 * celle partagée avec l’entité CHECKPOINT de l’épopée 4.
 */
export interface PointDePassageEpreuve {
  id: string;
  nom: string;
  kilometre: number | null;
  altitudeM: number | null;
  /** Services en toutes lettres (ex. « Ravitaillement », « Point d’eau »). */
  services: readonly string[] | null;
}

/** Une épreuve de la section : la fiche `EpreuveView` + les champs épopée 11. */
export interface EpreuveSectionParcours extends EpreuveView {
  /** `null` tant que `parcours.json` n’existe pas (épopée 11). */
  metriques: MetriquesEpreuve | null;
  /** `null` tant que `parcours.json` n’existe pas (épopée 11). */
  pointsDePassage: readonly PointDePassageEpreuve[] | null;
}

export interface SectionParcoursView {
  /** Ordre de PARCOURS_SLUGS : la longue d’abord. */
  epreuves: readonly EpreuveSectionParcours[];
}

export const SECTION_PARCOURS_VIDE: SectionParcoursView = { epreuves: [] };

/**
 * Lecture de la section parcours de l’accueil. Réutilise la source de vérité
 * unique des épreuves (`getParcoursPage`, base au rechargement/ISR) : les
 * blocs sans épreuve associée sont ignorés — la section n’affiche jamais un
 * contenu qu’une épreuve ne porte pas. Une base indisponible dégrade en
 * `SECTION_PARCOURS_VIDE` (même convention que la page /parcours), le reste
 * de l’accueil ne dépend pas de Postgres pour s’afficher.
 */
export async function getSectionParcours(
  deps: ContenusServiceDeps = {},
): Promise<SectionParcoursView> {
  const { blocs } = await getParcoursPage(deps);
  return {
    epreuves: blocs
      .map((bloc) => bloc.epreuve)
      .filter((epreuve): epreuve is EpreuveView => epreuve !== null)
      .map((epreuve) => ({ ...epreuve, metriques: null, pointsDePassage: null })),
  };
}
