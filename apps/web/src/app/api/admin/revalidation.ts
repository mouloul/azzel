import { revalidatePath } from 'next/cache';

/**
 * L'accueil est servi depuis le cache (ISR 60 s) pour tenir le budget de
 * premier rendu. Une écriture d'administration qui change la section
 * partenaires l'invalide tout de suite : la bascule A/B reste « sans dev » ET
 * immédiate, sans rendre la page dynamique à chaque visite.
 */
export function revaliderAccueil(): void {
  try {
    revalidatePath('/');
  } catch (error) {
    // L'écriture est déjà validée en base : une invalidation de cache qui
    // échoue ne doit pas transformer un succès en erreur. L'accueil se
    // rafraîchira au plus tard au bout de `revalidate` secondes.
    console.warn('[cache] invalidation de l’accueil impossible :', error);
  }
}
