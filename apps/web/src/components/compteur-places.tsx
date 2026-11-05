import type { PlacesState } from '@/modules/inscriptions/service';

/**
 * Compteur du contingent de dossards.
 *
 * Muet tant qu'il reste plus de places que le seuil réglé par l'organisation :
 * annoncer « 580 places restantes » le premier jour dit surtout que personne
 * ne s'est inscrit. Muet aussi quand la base ne répond pas — un compteur
 * absent vaut mieux qu'un chiffre faux.
 *
 * « Complet » n'est pas une fin de non-recevoir : les inscriptions continuent,
 * en liste d'attente. Le libellé le dit, sinon le visiteur repart.
 */
export function CompteurPlaces({ places }: { places: PlacesState }) {
  if (!places.afficher) {
    return null;
  }

  if (places.complet) {
    return (
      <p className="compteur-places compteur-places--complet">
        <strong>Complet</strong>
        {' — les inscriptions continuent en liste d’attente.'}
      </p>
    );
  }

  // Phrase assemblée en une seule chaîne : interpolée morceau par morceau,
  // React la découpe en nœuds séparés et elle devient introuvable dans le HTML.
  const pluriel = places.restantes > 1 ? 's' : '';
  return (
    <p className="compteur-places">
      <strong>{`${places.restantes} place${pluriel}`}</strong>
      {` sur ${places.capacite} encore disponible${pluriel}.`}
    </p>
  );
}
