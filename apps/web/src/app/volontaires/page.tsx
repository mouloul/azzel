import { nowIsoUtc } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';
import { toMissionsApiError } from '@/modules/missions/errors';
import { getMissionsVolontaireState } from '@/modules/missions/service';

import { VolontairesPwa } from './volontaires-pwa';

import './volontaires.css';

// Story 3.3 — page serveur de la PWA volontaires : requireRolePage volontaire,
// état initial assemblé côté serveur (rendu SSR = plan A), puis le composant
// client revalide à chaque ouverture en ligne et persiste en IndexedDB
// (la poche). L'annuaire (3.4) viendra se greffer ici : ne rien verrouiller.

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace volontaire',
};

export default async function VolontairesPage() {
  const assistancePhone = readAssistancePhone();
  const guard = await requireRolePage('volontaire');
  if (guard.status === 'db-unavailable') {
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">Connexion indisponible.</p>
            <p className="error-action">Réessaie dans un instant.</p>
          </div>
        </article>
      </section>
    );
  }
  const session = guard.session;

  let state: Awaited<ReturnType<typeof getMissionsVolontaireState>>;
  try {
    state = await getMissionsVolontaireState(session);
  } catch (error) {
    const { envelope } = toMissionsApiError(error);
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace volontaire</p>
          <h1>Tu es connecté</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{envelope.error.message}</p>
            <p className="error-action">{envelope.error.action}</p>
          </div>
          <p className="hint">
            Ta fiche mission reste lisible hors-ligne si tu l’avais déjà ouverte une fois en
            ligne.
          </p>
          <div className="auth-alt">
            <LogoutButton />
            <AssistanceButton phone={assistancePhone} />
          </div>
        </article>
      </section>
    );
  }

  return (
    <VolontairesPwa
      email={session.email}
      etatInitial={{
        editionNom: state.editionNom,
        assistancePhone,
        mesMissions: state.mesMissions,
        missions: state.missions,
        generéA: nowIsoUtc(),
      }}
    />
  );
}
