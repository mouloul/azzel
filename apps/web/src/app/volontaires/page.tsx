import { formatLocalDateTime } from '@azzel/shared';

import { AssistanceButton } from '@/components/assistance-button';
import { LogoutButton } from '@/components/logout-button';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { requireRolePage } from '@/modules/iam/session';

// Story 3.1 — placeholder espace volontaire (tutoiement). Les missions, la
// fiche hors-ligne et l’annuaire arrivent avec les stories 3.2 à 3.4 : ne rien
// verrouiller qui empêche l’épopée 4 de greffer la PWA ici.

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

  return (
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace volontaire</p>
        <h1>Tu es connecté</h1>
        <p className="lead">
          Ton accès volontaire est lié à <strong>{session.email}</strong>.
        </p>
        <p className="meta">
          Session ouverte le {formatLocalDateTime(session.createdAt.toISOString())}
        </p>
        <p className="hint">
          Ton espace mission arrive : secteurs, fiche mission et annuaire se
          chargeront ici. En attendant, garde ce lien — on te préviendra par
          email quand ta mission sera affectée.
        </p>
        <div className="auth-alt">
          <LogoutButton />
          <AssistanceButton phone={assistancePhone} />
        </div>
      </article>
    </section>
  );
}
