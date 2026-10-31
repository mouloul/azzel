export type Parcours = 'connexion' | 'inscription';

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `?parcours=inscription` (bouton « M'inscrire » de l'onglet Mon trail, CTA de
 * l'accueil) : même flux email + code, seul l'habillage change. Toute autre
 * valeur est ignorée. La destination reste décidée par le serveur (rôle,
 * puis étape du dossier coureur).
 */
export function lireParcours(params: SearchParams | undefined): Parcours {
  return params?.parcours === 'inscription' ? 'inscription' : 'connexion';
}
