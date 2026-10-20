import { LocalClock } from '@/components/local-clock';

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <p className="surtitre">Fondation technique</p>
        <h1 className="display">Azzel</h1>
        <p className="lead">
          La plateforme clé en main du trail d’Aït-Aïssi : inscriptions, chronométrage hors-ligne
          et e-dossard — une course portée par son village.
        </p>
        <a className="btn-action" href="#structure">
          Voir la structure
        </a>
        <LocalClock />
      </section>
      <section id="structure" className="structure">
        <article className="card">
          <h2>Web</h2>
          <p>Vitrine, inscriptions, portail volontaires et administration.</p>
          <p className="mono">apps/web — Next.js 16.4.2</p>
        </article>
        <article className="card">
          <h2>Application coureurs</h2>
          <p>E-dossard, suivi GPS et dossier — hors-ligne d’abord.</p>
          <p className="mono">apps/runners — Expo SDK 58 / RN 0.88 (dev build)</p>
        </article>
        <article className="card">
          <h2>Contrat partagé</h2>
          <p>
            Tokens « Vert Djurdjura », enveloppe d’erreur versionnée et horodatages ISO 8601 UTC.
          </p>
          <p className="mono">packages/shared — TypeScript</p>
        </article>
      </section>
    </>
  );
}
