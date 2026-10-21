import type { ReactNode } from 'react';

export function AdminIndisponible({
  titre,
  message,
  action,
  children,
}: {
  titre: string;
  message: string;
  action: string;
  children?: ReactNode;
}) {
  return (
    <section className="admin">
      <article className="card">
        <p className="surtitre">Administration</p>
        <h1>{titre}</h1>
        <div role="alert" aria-live="assertive" className="error-box">
          <p className="error-message">{message}</p>
          <p className="error-action">{action}</p>
        </div>
        {children}
      </article>
    </section>
  );
}
