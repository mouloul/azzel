import { CODE_DOSSIER_EN_VALIDATION } from '@/modules/inscriptions/errors';

/**
 * Après un refus du serveur, faut-il rafraîchir la page /preuve ?
 *
 * 403 et 409 signalent un état serveur qui a changé (rôle, statut du dossier) :
 * la page rafraîchie affiche le bon écran. Sauf pour un dossier passé en
 * validation : la page basculerait sur sa vue en lecture seule et démonterait
 * le formulaire avec son message — le coureur croirait sa nouvelle preuve
 * acceptée. Le formulaire passe alors dans un état terminal qui garde l'erreur.
 */
export function doitRafraichirApresErreur(status: number, code: unknown): boolean {
  return (status === 403 || status === 409) && code !== CODE_DOSSIER_EN_VALIDATION;
}

/** Refus terminal : le dossier est en validation, plus aucun dépôt possible. */
export function estRefusDossierEnValidation(status: number, code: unknown): boolean {
  return status === 409 && code === CODE_DOSSIER_EN_VALIDATION;
}
