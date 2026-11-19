'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation vitrine (en-tête ≥ 960 px, pied de page en dessous). Retour
 * comité 2027 : en passant de l'accueil à /parcours, rien dans l'en-tête ne
 * signalait la page courante. Le lien de la rubrique ouverte porte
 * `aria-current="page"` — le style (filet cuivre) s'y accroche, jamais la
 * couleur seule.
 */
export const LIENS_VITRINE = [
  { href: '/parcours', label: 'Parcours' },
  { href: '/region', label: 'La région' },
  { href: '/retour-en-images', label: 'Retour en images' },
  { href: '/resultats', label: 'Résultats' },
] as const;

/** La rubrique est courante sur sa page et sur ses sous-pages. */
export function rubriqueCourante(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavVitrine({ className, label }: { className: string; label: string }) {
  const pathname = usePathname();
  return (
    <nav className={className} aria-label={label}>
      {LIENS_VITRINE.map((lien) => (
        <Link
          key={lien.href}
          href={lien.href}
          aria-current={rubriqueCourante(pathname, lien.href) ? 'page' : undefined}
        >
          {lien.label}
        </Link>
      ))}
    </nav>
  );
}
