/** Au-delà, une lecture de la vitrine rend son repli au lieu d'attendre. */
export const DELAI_LECTURE_VITRINE_MS = 8_000;

/**
 * Borne une lecture en base de la vitrine. Les services dégradent déjà sur une
 * base INDISPONIBLE (erreur de connexion, délai serveur), mais pas sur une base
 * MUETTE : une requête qui n'aboutit jamais laissait le prérendu de l'accueil
 * dépasser les 60 s du build Vercel, trois tentatives de suite, et le
 * déploiement échouait. Passé le délai, on rend le repli — le même que celui de
 * la base indisponible — et l'ISR complète la page dès que la base répond.
 *
 * Une erreur qui n'est pas un délai (bug de code) continue d'éclater.
 */
export async function lectureBornee<T>(
  lecture: Promise<T>,
  repli: T,
  libelle: string,
  delaiMs: number = DELAI_LECTURE_VITRINE_MS,
): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<T>((resolve) => {
    minuteur = setTimeout(() => {
      console.warn(`[vitrine] ${libelle} : pas de réponse en ${delaiMs} ms, section en repli`);
      resolve(repli);
    }, delaiMs);
  });
  try {
    return await Promise.race([lecture, delai]);
  } finally {
    clearTimeout(minuteur);
  }
}
