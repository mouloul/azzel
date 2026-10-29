'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation de l'espace d'administration. Sans elle, cinq écrans (contenus,
 * sponsors, retour en images, secteurs, rapports) n'étaient atteignables qu'en
 * tapant leur URL : aucune page admin ne pointait vers une autre.
 */
const SECTIONS = [
  { href: '/admin/dossiers', label: 'Dossiers' },
  { href: '/admin/volontaires', label: 'Volontaires' },
  { href: '/admin/missions', label: 'Secteurs et missions' },
  { href: '/admin/course', label: 'PC course' },
  { href: '/admin/rapports', label: 'Rapports' },
  { href: '/admin/contenus', label: 'Contenus' },
  { href: '/admin/sponsors', label: 'Sponsors' },
  { href: '/admin/retour-images', label: 'Retour en images' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Administration">
      <ul className="admin-nav__liste">
        {SECTIONS.map((section) => {
          const courant = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className="admin-nav__lien"
                aria-current={courant ? 'page' : undefined}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
