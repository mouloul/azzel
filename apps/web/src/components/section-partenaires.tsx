import type { SponsorView } from '@/modules/sponsors/domain';

import { SponsorLogo } from './sponsor-logo';

const TITRE = 'Ils soutiennent le week-end';

function LienOuNom({ sponsor, className }: { sponsor: SponsorView; className: string }) {
  if (sponsor.url !== null) {
    return (
      <a
        className={className}
        href={sponsor.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visiter le site de ${sponsor.nom}`}
      >
        {sponsor.nom}
      </a>
    );
  }
  return <p className={className}>{sponsor.nom}</p>;
}

function Logo({ sponsor }: { sponsor: SponsorView }) {
  if (sponsor.logoUrl === null) {
    return null;
  }
  return <SponsorLogo src={sponsor.logoUrl} />;
}

function Emplacement({ sponsor }: { sponsor: SponsorView }) {
  return (
    <li className="aa-partenaire">
      <Logo sponsor={sponsor} />
      <LienOuNom sponsor={sponsor} className="aa-partenaire__nom" />
    </li>
  );
}

/**
 * Section partenaires de l’accueil (story 2.3), rendue dynamiquement à chaque
 * requête — la bascule A/B et les créations sont visibles au rechargement.
 * Option A : un emplacement signature sur bande forêt, nom en Barlow capitales,
 * mention « Partenaire signature ». Option B : grille sobre d’emplacements
 * équivalents. Vue null (aucun sponsor) : section absente, jamais de vide.
 */
export function SectionPartenaires({
  view,
}: {
  view: { mode: 'A' | 'B'; signature: SponsorView | null; sponsors: SponsorView[] } | null;
}) {
  if (view === null || view.sponsors.length === 0) {
    return null;
  }
  if (view.mode === 'A' && view.signature !== null) {
    const signature = view.signature;
    return (
      <section
        className="vitrine-bande vitrine-bande--foret"
        aria-labelledby="titre-partenaires"
      >
        <div className="aa-section">
          <p className="aa-eyebrow">Partenaires</p>
          <h2 className="aa-h2" id="titre-partenaires">
            {TITRE}
          </h2>
          <div className="aa-signature">
            <p className="aa-signature__mention">Partenaire signature</p>
            <Logo sponsor={signature} />
            <LienOuNom sponsor={signature} className="aa-signature__nom" />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="vitrine-bande" aria-labelledby="titre-partenaires">
      <div className="aa-section">
        <p className="aa-eyebrow">Partenaires</p>
        <h2 className="aa-h2" id="titre-partenaires">
          {TITRE}
        </h2>
        <ul className="aa-partenaires">
          {view.sponsors.map((sponsor) => (
            <Emplacement key={sponsor.id} sponsor={sponsor} />
          ))}
        </ul>
      </div>
    </section>
  );
}
