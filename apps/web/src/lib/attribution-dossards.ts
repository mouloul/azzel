// Story 3.4 (revue) — libellés du lot de dossards, client-safe : le composant
// /admin/dossiers les importe directement (service.ts est inimportable côté
// client). La garde de forme protège l'affichage d'une réponse 200 malformée.

export interface ResultatAttributionDossards {
  attribues: number;
  premier: number | null;
  dernier: number | null;
}

/**
 * Réponse du lot : attribues entier, et des bornes cohérentes — null/null
 * quand rien n'a été attribué, deux entiers sinon.
 */
export function estResultatAttributionValide(
  valeur: unknown,
): valeur is ResultatAttributionDossards {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const candidat = valeur as Record<string, unknown>;
  if (typeof candidat.attribues !== 'number' || !Number.isInteger(candidat.attribues)) {
    return false;
  }
  if (candidat.attribues === 0) {
    return candidat.premier === null && candidat.dernier === null;
  }
  return (
    typeof candidat.premier === 'number' &&
    Number.isInteger(candidat.premier) &&
    typeof candidat.dernier === 'number' &&
    Number.isInteger(candidat.dernier)
  );
}

/** Libellé du résultat d'un lot — « 12 dossard(s) attribué(s) (101–112). » */
export function libelleAttributionDossards(resultat: ResultatAttributionDossards): string {
  if (resultat.attribues === 0) {
    return 'Rien à attribuer : aucun dossier validé sans dossard.';
  }
  return `${resultat.attribues} dossard(s) attribué(s) (${resultat.premier}–${resultat.dernier}).`;
}
