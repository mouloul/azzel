// Story 4.1 — purge des caches du service worker coureur. L'appareil est
// partagé : le QR e-dossard ne survit pas au compte à la déconnexion (le SW
// lui-même n'est pas désenregistré ici — il ne détient plus rien, la page
// explication hors-ligne reste servie). Silencieuse par construction (sans
// caches, contexte non sécurisé, erreur) : la déconnexion ne doit jamais
// échouer pour ça.

/** Préfixe des caches du service worker coureur (voir public/sw-coureur.js). */
export const PREFIXE_CACHES_COUREUR = 'az-coureur-';

export async function purgerCachesCoureur(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    const noms = await caches.keys();
    await Promise.all(
      noms
        .filter((nom) => nom.startsWith(PREFIXE_CACHES_COUREUR))
        .map((nom) => caches.delete(nom)),
    );
  } catch {
    // caches indisponibles : rien à purger.
  }
}
