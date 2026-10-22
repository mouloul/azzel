import { Suspense } from 'react';

import { InvitationForm } from './invitation-form';

export const metadata = {
  title: 'Ton accès volontaire',
};

export default function InvitationPage() {
  return (
    <section className="auth">
      <article className="card">
        <p className="surtitre">Espace volontaire</p>
        <h1>Définis ton mot de passe</h1>
        <Suspense
          fallback={<p className="lead">Chargement de ton invitation…</p>}
        >
          <InvitationForm />
        </Suspense>
      </article>
    </section>
  );
}
