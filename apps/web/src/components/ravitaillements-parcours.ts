import { PARCOURS_DOC } from '@/modules/contenus/parcours/lecture';

/**
 * Points de ravitaillement des deux épreuves.
 *
 * Retour comité 2027 : les chiffres (kilomètre, altitude, D+ depuis le point
 * précédent) ne sont plus recopiés à la main — ils viennent de
 * `parcours.json`, la même source que la fiche d'épreuve et le profil. Le
 * fichier ne garde que le texte rédigé. Un écart comme « +186 m » ici au-dessus
 * de « +144 m » dans les points de passage ne peut donc plus réapparaître.
 *
 * Emplacements et contenus INDICATIFS — le comité les confirme avant
 * publication.
 */
export interface PointRavitaillement {
  readonly id: string;
  readonly kilometre: number;
  readonly nom: string;
  readonly altitudeM: number;
  /** D+ cumulé depuis le point précédent (le départ pour le premier). */
  readonly dplusDepuisPrecedentM: number;
  readonly services: readonly string[];
  readonly detail: string;
  readonly conseil: string;
  /** Kilomètre du MÊME poste sur la Boucle Moyenne, `null` s'il ne la sert pas. */
  readonly kilometreBoucleMoyenne: number | null;
}

/** Texte rédigé de chaque poste, par id de point de passage (longue). */
const TEXTES: Readonly<Record<string, { nom: string; detail: string; conseil: string }>> = {
  'ravito-1': {
    nom: 'Le premier souffle',
    detail:
      'Le sentier descend depuis le stade (677 m) et continue de plonger vers le point le plus bas du parcours, 222 m au km 9,9. Le ravitaillement se trouve juste avant ce fond de vallée, dans la fraîcheur du sous-bois.',
    conseil:
      'Buvez ici sans vous presser, même si vous n’avez pas soif : la remontée qui suit gagne près de 400 m de dénivelé positif jusqu’au ravitaillement suivant, et le point haut du parcours est encore au-dessus. Partez avec les flasques pleines.',
  },
  'ravito-2': {
    nom: 'La montée du milieu',
    detail:
      'C’est le tronçon le plus exigeant du parcours : près de 400 m de montée depuis le point précédent. Le ravitaillement le plus complet, à un peu plus de trois kilomètres du sommet (836 m, au km 18,2).',
    conseil:
      'Un aliment salé (fromage, pomme de terre, bouillon) aide à compenser le sodium perdu en sueur. Évitez de boire de l’eau pure en grande quantité : mieux vaut alterner eau et boisson isotonique. Prenez de quoi tenir jusqu’au sommet.',
  },
  'ravito-3': {
    nom: 'La descente technique',
    detail:
      'Le sommet est derrière vous et la pente s’inverse : la descente qui suit perd 270 m jusqu’au point bas du km 24,4. Le ravitaillement est sur un replat, avant la portion la plus soutenue.',
    conseil:
      'Les cuisses ont déjà beaucoup travaillé : c’est le moment où les crampes arrivent. Mangez un peu, raccourcissez la foulée, gardez les genoux souples. Profitez de l’arrêt pour vérifier vos lacets et l’état de vos pieds.',
  },
  'ravito-4': {
    nom: 'Le dernier coup de collier',
    detail:
      'Dernier point avant l’arrivée, après le passage bas du km 24,4 (299 m). Il reste deux kilomètres, mais plus de 200 m de montée pour rejoindre le stade à 676 m.',
    conseil:
      'Ne vous fiez pas à la distance restante : la dernière montée est raide. Buvez quelques gorgées, mangez léger, et gardez de l’énergie pour monter à votre rythme. Inutile de remplir complètement : il n’y a plus de point d’eau après.',
  },
};

/**
 * Postes servant AUSSI la Boucle Moyenne : son relevé croise ces deux
 * emplacements à moins de dix mètres, un seul poste tient donc les deux
 * courses (id du point sur la longue → id sur la moyenne).
 */
const POSTES_PARTAGES: Readonly<Record<string, string>> = {
  'ravito-1': 'moyenne-ravito-1',
  'ravito-4': 'moyenne-ravito-2',
};

const EPREUVE_LONGUE = 'longue';
const EPREUVE_MOYENNE = 'moyenne';

function pointsDe(slug: string) {
  return PARCOURS_DOC?.epreuves[slug]?.pointsDePassage ?? [];
}

function servicesDe(id: string): readonly string[] {
  return PARCOURS_DOC?.pointsDePassage.find((point) => point.id === id)?.services ?? [];
}

/** Distance publiée d'une épreuve (km), `null` si son relevé n'existe pas. */
function distanceKm(slug: string): number | null {
  const distanceM = PARCOURS_DOC?.epreuves[slug]?.distanceM;
  return distanceM === undefined ? null : distanceM / 1000;
}

export const RAVITAILLEMENTS_DISTANCE_KM = distanceKm(EPREUVE_LONGUE);
export const BOUCLE_MOYENNE_DISTANCE_KM = distanceKm(EPREUVE_MOYENNE);

/** Les postes de la Grande Boucle, dans l'ordre du parcours. */
export const RAVITAILLEMENTS_POINTS: readonly PointRavitaillement[] = pointsDe(EPREUVE_LONGUE)
  .flatMap((point) => {
    const texte = TEXTES[point.id];
    if (texte === undefined) return [];
    const idMoyenne = POSTES_PARTAGES[point.id];
    const surMoyenne =
      idMoyenne === undefined
        ? undefined
        : pointsDe(EPREUVE_MOYENNE).find((p) => p.id === idMoyenne);
    return [
      {
        id: point.id,
        kilometre: point.kilometre,
        altitudeM: point.altitudeM ?? 0,
        dplusDepuisPrecedentM: point.dplusSegmentAmontM ?? 0,
        services: servicesDe(point.id),
        kilometreBoucleMoyenne: surMoyenne?.kilometre ?? null,
        ...texte,
      },
    ];
  });

/** Nombre de postes que la Boucle Moyenne rencontre sur son parcours. */
export const RAVITAILLEMENTS_POINTS_BOUCLE_MOYENNE = RAVITAILLEMENTS_POINTS.filter(
  (point) => point.kilometreBoucleMoyenne !== null,
).length;

export const RAVITAILLEMENTS_INTRO =
  'Quatre points de ravitaillement jalonnent la Grande Boucle, dont deux que la Boucle Moyenne rencontre aussi. Ils sont pensés pour le relief : on y repart rarement sur du plat, alors mieux vaut y arriver en ayant déjà bu et mangé un peu, sans attendre la soif.';

export const RAVITAILLEMENTS_CONSEILS: readonly string[] = [
  'Buvez par petites gorgées, régulièrement : comptez de 400 à 600 ml par heure, davantage s’il fait chaud. Votre urine doit rester claire.',
  'Mangez dès la première heure, avant d’avoir faim : un peu d’énergie toutes les 30 à 45 minutes vaut mieux qu’un gros apport tardif.',
  'Ne testez rien de nouveau le jour de la course : produits, boissons et aliments doivent avoir été essayés à l’entraînement.',
  'Prévoyez un gobelet ou une flasque souple : cela limite les déchets et accélère l’arrêt.',
  'Nausée persistante, vertiges, frissons malgré la chaleur, absence d’envie d’uriner : arrêtez-vous, signalez-le à un bénévole ou au poste de secours. Ces conseils généraux ne remplacent pas l’avis d’un médecin.',
];

export const RAVITAILLEMENTS_NOTE =
  'Emplacements, produits proposés et horaires de fermeture indicatifs, à confirmer par le comité avant la course.';
