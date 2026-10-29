import { redirect } from 'next/navigation';

import { ADMIN_HOME_PATH } from '@/modules/iam/constants';

export const dynamic = 'force-dynamic';

/**
 * `/admin` renvoyait 404 : le seul lien de l'application pointait en dur sur
 * `/admin/dossiers`. L'URL que tout le monde tape mène désormais quelque part.
 */
export default function AdminIndexPage() {
  redirect(ADMIN_HOME_PATH);
}
