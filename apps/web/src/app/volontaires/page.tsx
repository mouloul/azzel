import { nowIsoUtc, type AnnuaireEdition } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';
import { toMissionsApiError } from '@/modules/missions/errors';
import { getAnnuaireEdition, getMissionsVolontaireState } from '@/modules/missions/service';

import { VolontairesPwa } from './volontaires-pwa';

import './volontaires.css';

// Stories 3.3/3.4 — page serveur de la PWA volontaires : requireRolePage
// volontaire, état initial assemblé côté serveur (rendu SSR = plan A), puis le
// composant client revalide à chaque ouverture en ligne et persiste en
// IndexedDB (la poche). L'annuaire (3.4) suit le même paradigme : son échec
// n'entrave JAMAIS la fiche mission (annuaireInitial null → préchargement
// seul, tranché par l'effet client).

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

  // Annuaire (3.4) : dégradation isolée — une erreur ici ne casse pas la page,
  // la revalidation client tranche (null = état « en cours de préchargement »).
  let annuaireInitial: AnnuaireEdition | null = null;
  try {
    annuaireInitial = (await getAnnuaireEdition(session)) ?? null;
  } catch {
    annuaireInitial = null;
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
      annuaireInitial={annuaireInitial}
    />
  );
}
