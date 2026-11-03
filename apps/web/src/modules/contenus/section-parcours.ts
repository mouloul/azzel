// Story 9.3 — contrat de données de la section parcours de l’accueil.
//
// Cette section vit côté vitrine mais ne possède AUCUNE source de vérité
// propre : les épreuves (slug, nom, distance, GPX) viennent de
// `getParcoursPage()` (mêmes lignes que la page /parcours, même store). Les
// métriques et points de passage viennent de `parcours.json` (story 11.1,
// branché CI-DESSOUS dans `fusionnerEpreuve`) : un champ null n’est
// simplement pas rendu — une épreuve absente du JSON n’affiche AUCUN chiffre.
//
// POINT DE BRANCHEMENT ÉPOPÉE 11 (story 11.1, réalisé) : la fusion se fait
// ICI, et seulement ici — le composant de rendu (`components/section-parcours.tsx`)
// n’a PAS été modifié, il sait déjà afficher chaque champ non nul.
//
// Référentiel des kilométrages (UX-DR-31) : un point de passage partagé par
// les deux épreuves n’a pas le même kilomètre dans chacune. Les points vivent
// donc DANS chaque épreuve, avec leur kilomètre dans le référentiel de CETTE
// épreuve — le rendu ne montre jamais un kilométrage orphelin de l’épreuve
// active (il est dans le panneau de l’épreuve, sous son nom).

import { getParcoursPage, type ContenusServiceDeps, type EpreuveView } from './service';
import { getParcoursDoc } from './parcours/lecture';
import type { EpreuveDoc, ParcoursDoc } from './parcours/construire';

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
 * Story 11.1 — fusion d’une épreuve avec sa vue parcours.json.
 *
 * Les métriques viennent du D+/D− PUBLIÉ (hystérésis, constante unique du
 * pipeline) : carte, profil et vitrine lisent le même chiffre. L’heure de
 * départ et la barrière horaire restent `null` tant que l’organisation ne
 * les a pas fournies — aucun chiffre inventé. Les services inconnus restent
 * `null`. Une épreuve ABSENTE du JSON (ex. la moyenne, tracé non fourni)
 * garde `metriques: null` / `pointsDePassage: null` : sa fiche n’affiche
 * aucun chiffre.
 */
function fusionnerEpreuve(
  epreuve: EpreuveView,
  doc: ParcoursDoc | null,
): EpreuveSectionParcours {
  const vue: EpreuveDoc | undefined = doc?.epreuves[epreuve.slug];
  if (doc === null || vue === undefined) {
    return { ...epreuve, metriques: null, pointsDePassage: null };
  }
  const nomParId = new Map(doc.pointsDePassage.map((point) => [point.id, point.nom]));
  const altitudeParId = new Map(doc.pointsDePassage.map((point) => [point.id, point.altitudeM]));
  const servicesParId = new Map(doc.pointsDePassage.map((point) => [point.id, point.services]));
  return {
    ...epreuve,
    metriques: {
      denivelePositifM: vue.dplusM,
      deniveleNegatifM: vue.dmoinsM,
      altitudeMinM: vue.altitudeMinM,
      altitudeMaxM: vue.altitudeMaxM,
      heureDepart: null,
      barriereHoraire: null,
    },
    pointsDePassage: vue.pointsDePassage.map((point) => ({
      id: point.id,
      nom: nomParId.get(point.id) ?? point.id,
      // FR-38 : kilométrage dans le référentiel de CETTE épreuve.
      kilometre: point.kilometre,
      altitudeM: point.altitudeM ?? altitudeParId.get(point.id) ?? null,
      // FR-39 : services inconnus ⇒ null (jamais inventés).
      services: servicesParId.get(point.id) ?? null,
    })),
  };
}

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
  const doc = getParcoursDoc();
  return {
    epreuves: blocs
      .map((bloc) => bloc.epreuve)
      .filter((epreuve): epreuve is EpreuveView => epreuve !== null)
      .map((epreuve) => fusionnerEpreuve(epreuve, doc)),
  };
}
