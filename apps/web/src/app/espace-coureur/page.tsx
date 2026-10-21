import { formatLocalDateTime } from '@azzel/shared';

import { LogoutButton } from '@/components/logout-button';
import { DbUnavailableError, toApiError } from '@/modules/iam/errors';
import { requireSession } from '@/modules/iam/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Espace coureur',
};

export default async function EspaceCoureurPage() {
  const result = await requireSession();
  if (result.status === 'db-unavailable') {
    const { envelope } = toApiError(new DbUnavailableError());
    return (
      <section className="auth">
        <article className="card">
          <p className="surtitre">Espace coureur</p>
          <h1>Connexion indisponible</h1>
          <div role="alert" aria-live="assertive" className="error-box">
            <p className="error-message">{envelope.error.message}</p>
            <p className="error-action">{envelope.error.action}</p>
          </div>
        </article>
      </section>
    );
  }
  const session = result.session;
  return (
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace coureur</p>
        <h1>Tu es connecté</h1>
        <p className="lead">
          Ton accès est lié à <strong>{session.email}</strong>.
        </p>
        <p className="meta">
          Session ouverte le {formatLocalDateTime(session.createdAt.toISOString())}
        </p>
        <p className="hint">
          Session unique : te connecter sur un autre appareil déconnecte automatiquement
          celui-ci.
        </p>
        <div className="auth-alt">
          <LogoutButton />
        </div>
      </article>
    </section>
  );
}
