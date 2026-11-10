import { DbUnavailableError } from '@/modules/iam/errors';

/** Au-delà, une lecture de page rend son repli (ou son état indisponible) au lieu d'attendre. */
export const DELAI_LECTURE_VITRINE_MS = 8_000;

function borner<T>(lecture: Promise<T>, delaiMs: number, auTerme: () => T): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<T>((resolve, reject) => {
    minuteur = setTimeout(() => {
      try {
        resolve(auTerme());
      } catch (error) {
        reject(error);
      }
    }, delaiMs);
  });
  return Promise.race([lecture, delai]).finally(() => clearTimeout(minuteur));
}

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
export function lectureBornee<T>(
  lecture: Promise<T>,
  repli: T,
  libelle: string,
  delaiMs: number = DELAI_LECTURE_VITRINE_MS,
): Promise<T> {
  return borner(lecture, delaiMs, () => {
    console.warn(`[vitrine] ${libelle} : pas de réponse en ${delaiMs} ms, section en repli`);
    return repli;
  });
}

/**
 * Variante sans repli, pour les lectures dont une valeur vide tromperait
 * (session, dossier, écrans d'administration) : passé le délai, la base muette
 * est traitée comme une base indisponible. Sur Vercel, une socket morte après
 * le gel d'une instance figeait sinon la page jusqu'au timeout de 300 s (504).
 */
export function lectureBorneeOuIndisponible<T>(
  lecture: Promise<T>,
  libelle: string,
  delaiMs: number = DELAI_LECTURE_VITRINE_MS,
): Promise<T> {
  return borner(lecture, delaiMs, () => {
    console.warn(`[base] ${libelle} : pas de réponse en ${delaiMs} ms, page indisponible`);
    throw new DbUnavailableError(new Error(`${libelle} : pas de réponse en ${delaiMs} ms`));
  });
}
