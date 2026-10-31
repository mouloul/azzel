// Revue 3.3 — plomberie navigateur de la PWA volontaires, extraite pour être
// testée en node : enregistrement du service worker (chemin + scope croisés
// avec le manifeste et l'en-tête Service-Worker-Allowed de next.config),
// demande de stockage persistant, réchauffage du shell après une purge de
// changement de compte. Tout est silencieux par construction : la page
// serveur reste le plan A, aucun échec ici ne casse la fiche.

/** Script du SW (public/) — doit rester servi avec Service-Worker-Allowed. */
export const SW_VOLONTAIRES_URL = '/sw-volontaires.js';
/** Scope du SW = scope du manifeste : la vitrine n'est jamais interceptée. */
export const SW_VOLONTAIRES_SCOPE = '/volontaires';
/** Message compris par le SW : re-précacher le shell de la session courante. */
export const MESSAGE_RECHAUFFER_SHELL = 'az-volontaires-rechauffer-shell';

type ConteneurSw = Pick<ServiceWorkerContainer, 'register'>;

/**
 * Enregistre le SW volontaires. Renvoie false (jamais d'exception) si le
 * navigateur n'a pas de SW ou refuse ; l'échec est journalisé (console) au
 * lieu d'être avalé — il réessaiera à la prochaine ouverture.
 */
export async function enregistrerSwVolontaires(
  conteneur: ConteneurSw | undefined = typeof navigator !== 'undefined'
    ? navigator.serviceWorker
    : undefined,
): Promise<boolean> {
  if (conteneur === undefined) {
    return false;
  }
  try {
    await conteneur.register(SW_VOLONTAIRES_URL, { scope: SW_VOLONTAIRES_SCOPE });
    return true;
  } catch (erreur) {
    console.warn('[pwa-volontaires] enregistrement du service worker refusé', erreur);
    return false;
  }
}

type GestionnaireStockage = Partial<Pick<StorageManager, 'persist' | 'persisted'>>;

/**
 * Demande un stockage persistant (limite l'éviction de la poche IndexedDB et
 * des caches). iOS non installé reste soumis à l'éviction des 7 jours : d'où
 * la consigne « ajoute cette page à ton écran d'accueil ».
 */
export async function demanderStockagePersistant(
  stockage: GestionnaireStockage | undefined = typeof navigator !== 'undefined'
    ? navigator.storage
    : undefined,
): Promise<boolean> {
  if (stockage?.persist === undefined) {
    return false;
  }
  try {
    if ((await stockage.persisted?.()) === true) {
      return true;
    }
    return await stockage.persist();
  } catch {
    return false;
  }
}

/**
 * Après une purge de changement de compte (D1), le shell du nouveau compte —
 * mis en cache par le SW juste avant la purge — a disparu : le SW actif le
 * re-précache (cookie de la session courante, marqueur de fiche vérifié).
 */
export function rechaufferShellVolontaires(
  controleur: Pick<ServiceWorker, 'postMessage'> | null | undefined = typeof navigator !==
    'undefined'
    ? navigator.serviceWorker?.controller
    : undefined,
): boolean {
  if (controleur == null) {
    return false;
  }
  try {
    controleur.postMessage({ type: MESSAGE_RECHAUFFER_SHELL });
    return true;
  } catch {
    return false;
  }
}
