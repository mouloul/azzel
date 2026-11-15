import type { PresentationEpreuve } from '@/components/section-parcours';

/** Accroche de chaque épreuve : la même sur l'accueil et sur /parcours. */
export const PRESENTATIONS_EPREUVES: Readonly<Record<string, PresentationEpreuve>> = {
  longue: {
    phare: true,
    titre: 'Le Grand Trail d’Aït Aïssi',
    texte:
      'Une boucle au départ du stade Agni Lhoudh, sur les sentiers de la forêt de Yakouren.',
  },
  moyenne: {
    titre: 'La Boucle Moyenne',
    texte: 'Le même départ et les mêmes sentiers, sur une distance plus courte.',
  },
};
