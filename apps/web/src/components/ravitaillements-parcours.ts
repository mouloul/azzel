/**
 * Points de ravitaillement du Grand Trail (28 km), calés sur le relevé d'essai
 * du 31/10/2026 : altitudes et dénivelés lus sur le profil. Emplacements et
 * contenus INDICATIFS — le comité les confirme avant publication.
 */
export interface PointRavitaillement {
  readonly kilometre: number;
  readonly nom: string;
  readonly altitudeM: number;
  /** D+ cumulé depuis le point précédent (le départ pour le premier). */
  readonly dplusDepuisPrecedentM: number;
  readonly services: readonly string[];
  readonly detail: string;
  readonly conseil: string;
}

/** Distance du relevé d'essai, arrondie (28,0 km). */
export const RAVITAILLEMENTS_DISTANCE_KM = 28;

export const RAVITAILLEMENTS_INTRO =
  'Quatre points de ravitaillement jalonnent le Grand Trail. Ils sont pensés pour le relief : on y repart rarement sur du plat, alors mieux vaut y arriver en ayant déjà bu et mangé un peu, sans attendre la soif.';

export const RAVITAILLEMENTS_POINTS: readonly PointRavitaillement[] = [
  {
    kilometre: 8,
    nom: 'Le premier souffle',
    altitudeM: 345,
    dplusDepuisPrecedentM: 186,
    services: ['Eau', 'Boisson isotonique', 'Fruits secs'],
    detail:
      'Le sentier descend depuis le départ et continue de plonger vers le point le plus bas du parcours, à 222 m vers le km 10. Le ravitaillement se trouve juste avant le fond de vallée, dans la fraîcheur du sous-bois.',
    conseil:
      'Buvez ici sans vous presser, même si vous n’avez pas soif : la remontée qui suit gagne plus de 600 m de dénivelé positif jusqu’au point haut. Partez avec les flasques pleines.',
  },
  {
    kilometre: 15,
    nom: 'La montée du milieu',
    altitudeM: 578,
    dplusDepuisPrecedentM: 411,
    services: ['Eau', 'Boisson isotonique', 'Salé', 'Sucré'],
    detail:
      'C’est le tronçon le plus exigeant depuis le précédent point : 411 m de montée en 7 km. Le ravitaillement le plus complet du parcours, à trois kilomètres du sommet (836 m, vers le km 18).',
    conseil:
      'Un aliment salé (fromage, pomme de terre, bouillon) aide à compenser le sodium perdu en sueur. Évitez de boire de l’eau pure en grande quantité : mieux vaut alterner eau et boisson isotonique. Prenez de quoi tenir jusqu’au sommet.',
  },
  {
    kilometre: 21,
    nom: 'La descente technique',
    altitudeM: 569,
    dplusDepuisPrecedentM: 282,
    services: ['Eau', 'Boisson sucrée', 'Salé', 'Fruits'],
    detail:
      'Le sommet est derrière vous et la pente s’inverse : près de 180 m de descente dans les deux kilomètres qui suivent. Le ravitaillement est sur un replat, avant la descente la plus soutenue.',
    conseil:
      'Les cuisses ont déjà beaucoup travaillé : c’est le moment où les crampes arrivent. Mangez un peu, raccourcissez la foulée, gardez les genoux souples. Profitez de l’arrêt pour vérifier vos lacets et l’état de vos pieds.',
  },
  {
    kilometre: 26,
    nom: 'Le dernier coup de collier',
    altitudeM: 475,
    dplusDepuisPrecedentM: 184,
    services: ['Eau', 'Fruits', 'Boisson sucrée'],
    detail:
      'Dernier point avant l’arrivée, après un passage bas vers le km 25. Il reste deux kilomètres, mais environ 200 m de montée pour rejoindre le stade à 676 m.',
    conseil:
      'Ne vous fiez pas à la distance restante : la dernière montée est raide. Buvez quelques gorgées, mangez léger, et gardez de l’énergie pour monter à votre rythme. Inutile de remplir complètement : il n’y a plus de point d’eau après.',
  },
];

export const RAVITAILLEMENTS_CONSEILS: readonly string[] = [
  'Buvez par petites gorgées, régulièrement : comptez de 400 à 600 ml par heure, davantage s’il fait chaud. Votre urine doit rester claire.',
  'Mangez dès la première heure, avant d’avoir faim : un peu d’énergie toutes les 30 à 45 minutes vaut mieux qu’un gros apport tardif.',
  'Ne testez rien de nouveau le jour de la course : produits, boissons et aliments doivent avoir été essayés à l’entraînement.',
  'Prévoyez un gobelet ou une flasque souple : cela limite les déchets et accélère l’arrêt.',
  'Nausée persistante, vertiges, frissons malgré la chaleur, absence d’envie d’uriner : arrêtez-vous, signalez-le à un bénévole ou au poste de secours. Ces conseils généraux ne remplacent pas l’avis d’un médecin.',
];

export const RAVITAILLEMENTS_NOTE =
  'Emplacements, produits proposés et horaires de fermeture indicatifs, à confirmer par le comité avant la course.';
