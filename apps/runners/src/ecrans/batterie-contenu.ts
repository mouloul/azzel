import { CITATION_BATTERIE, CITATION_BATTERIE_SOURCE } from '@azzel/shared';

// Story 6.4 — contenu pédagogique batterie : exactement TROIS conseils
// concrets tutoyés, CONCLUS par la citation kabyle. La citation vit dans
// packages/shared (formulation canonique partagée avec la page parcours) et
// n'apparaît QUE dans cette rubrique (point d'usage, UX-DR-5/17), jamais
// dans un autre écran ni dans l'email J-7.

/** Les trois conseils batterie (ordre canonique : départ, app, powerbank). */
export const CONSEILS_BATTERIE: readonly string[] = [
  'Pars avec une batterie pleine : charge ton téléphone à 100 % le matin du départ.',
  'Ne tue pas l’application Azzel pendant la course — verrouille l’écran, mais laisse l’app ouverte.',
  'Batterie fragile ? Une powerbank est en vente au village des partenaires.',
];

export { CITATION_BATTERIE, CITATION_BATTERIE_SOURCE };
