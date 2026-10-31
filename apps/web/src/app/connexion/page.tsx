import { readAssistancePhone } from '@/lib/assistance-phone';

import { ConnexionForm } from './connexion-form';
import { lireParcours, type SearchParams } from './parcours';

// Page de connexion UNIQUE, tous rôles (code par email, story 1.2) : le rôle
// est lu sur le compte et décide de l'espace d'atterrissage. Rendue à la
// requête : le numéro d'assistance (ASSISTANCE_PHONE) est lu côté serveur.
export const dynamic = 'force-dynamic';

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
} = {}) {
  const parcours = lireParcours(searchParams ? await searchParams : undefined);
  // `key` : passer d'un parcours à l'autre en navigation client repart de
  // l'étape email (ni étape code ni adresse conservées).
  return (
    <ConnexionForm key={parcours} assistancePhone={readAssistancePhone()} parcours={parcours} />
  );
}
