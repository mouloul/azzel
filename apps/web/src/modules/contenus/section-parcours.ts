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
import { construireProfilEpreuve, type ProfilEpreuve } from './parcours/profil';
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

/** Une épreuve de la section : la fiche `EpreuveView` + les champs épopée 11.
 *  Décision produit 2026-11-04 : `distanceKm` est écrasé par la distance du
 *  relevé (`distanceM / 1000`) quand l’épreuve est présente dans
 *  parcours.json — les chiffres affichés restent cohérents avec le profil. */
export interface EpreuveSectionParcours extends EpreuveView {
  /** `null` tant que `parcours.json` n’existe pas (épopée 11). */
  metriques: MetriquesEpreuve | null;
  /** `null` tant que `parcours.json` n’existe pas (épopée 11). */
  pointsDePassage: readonly PointDePassageEpreuve[] | null;
  /**
   * Story 11.4 — profil altimétrique/technicité, OPTIONNEL dans le contrat
   * pour ne pas casser les vues mockées sans profil (9.3) : absent/`null`
   * tant que l’épreuve n’a pas de tracé publié (l’annonce texte reste).
   */
  profil?: ProfilEpreuve | null;
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
 * pipeline) : carte, profil et vitrine lisent le même chiffre. Décision
 * produit 2026-11-04 : pour une épreuve PRÉSENTE dans parcours.json, la
 * distance affichée vient AUSSI du relevé (`distanceM / 1000`) et non de la
 * base éditoriale — les chiffres du panneau restent cohérents entre eux
 * (fiche = profil = relevé d’essai). Une épreuve ABSENTE du JSON garde la
 * distance de la base. L’heure de départ et la barrière horaire restent
 * `null` tant que l’organisation ne les a pas fournies — aucun chiffre
 * inventé. Les services inconnus restent `null`. Une épreuve ABSENTE du
 * JSON (ex. la moyenne, tracé non fourni) garde `metriques: null` /
 * `pointsDePassage: null` / `profil: null` : sa fiche n’affiche aucun chiffre.
 */
function fusionnerEpreuve(
  epreuve: EpreuveView,
  doc: ParcoursDoc | null,
): EpreuveSectionParcours {
  const vue: EpreuveDoc | undefined = doc?.epreuves[epreuve.slug];
  if (doc === null || vue === undefined) {
    return { ...epreuve, metriques: null, pointsDePassage: null, profil: null };
  }
  const nomParId = new Map(doc.pointsDePassage.map((point) => [point.id, point.nom]));
  const altitudeParId = new Map(doc.pointsDePassage.map((point) => [point.id, point.altitudeM]));
  const servicesParId = new Map(doc.pointsDePassage.map((point) => [point.id, point.services]));
  return {
    ...epreuve,
    // Décision produit 2026-11-04 : distance du RELEVÉ d’essai (ici 28,0 km),
    // pas la base (35) — le nom « La Longue — 35 km » reste éditorial.
    distanceKm: vue.distanceM / 1000,
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
    // Story 11.4 — profil décimé (serveur) ; géométrie exploitée par le SVG
    // de l’aside et l’île curseur, jamais par le HTML de base.
    profil: construireProfilEpreuve(doc, epreuve.slug),
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
