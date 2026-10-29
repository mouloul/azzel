import { readAssistancePhone } from '@/lib/assistance-phone';

import { ConnexionForm } from './connexion-form';

// Page de connexion UNIQUE, tous rôles (code par email, story 1.2) : le rôle
// est lu sur le compte et décide de l'espace d'atterrissage. Rendue à la
// requête : le numéro d'assistance (ASSISTANCE_PHONE) est lu côté serveur.
export const dynamic = 'force-dynamic';

export default function ConnexionPage() {
  return <ConnexionForm assistancePhone={readAssistancePhone()} />;
}
