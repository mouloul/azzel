export const DELAI_REQUETE_MS = 15_000;

/**
 * Timeout réseau avec repli pour les navigateurs sans `AbortSignal.timeout`
 * (Safari < 16) : sur ceux-là, un appel direct à `AbortSignal.timeout` lève un
 * TypeError AVANT le `fetch`, et toute écriture échoue en affichant « connexion
 * impossible ». Le repli AbortController + setTimeout garde la requête bornée.
 *
 * Helper partagé : les trois managers d'administration en avaient chacun leur
 * copie, et celle de `sponsors` manquait, ce qui rendait l'écran inutilisable.
 */
export async function fetchAvecDelai(
  url: string,
  init: RequestInit,
  delaiMs: number = DELAI_REQUETE_MS,
): Promise<Response> {
  if (typeof AbortSignal.timeout === 'function') {
    return fetch(url, { ...init, signal: AbortSignal.timeout(delaiMs) });
  }
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    return await fetch(url, { ...init, signal: controleur.signal });
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Le repli AbortController rejette avec AbortError, `AbortSignal.timeout` avec
 * TimeoutError : les deux disent la même chose (« serveur trop lent »).
 */
export function estErreurDelai(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
