import Link from 'next/link';

import { CorpsContenu } from '@/components/corps-contenu';
import { Crete, Frise } from '@/components/frise';
import { getRegionPage } from '@/modules/contenus/service';

import '../vitrine-textes.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'La région',
  description:
    'Hébergement, restauration, événements annexes et consignes de sécurité pour venir courir à Aït Aïssi, au pied du Jurjura.',
};

export default async function RegionPage() {
  const { blocs } = await getRegionPage();

  return (
    <>
      <Frise />
      <section className="vitrine-bande" aria-labelledby="titre-region">
        <div className="aa-section">
          <p className="aa-eyebrow">Autour de la course</p>
          <h1 className="aa-h2" id="titre-region">
            La région
          </h1>
          <Crete />
          <p className="aa-lead">
            Aït Aïssi, la forêt de Yakouren et le massif du Jurjura : préparez
            votre week-end — hébergement, restauration, événements annexes et
            consignes de sécurité.
          </p>
          {blocs.length === 0 ? (
            <p className="aa-note">
              Les informations pratiques de l’édition 2027 seront publiées après
              confirmation par le comité.
            </p>
          ) : null}
          <div className="aa-region-sections">
            {blocs.map((bloc) => (
              <section
                className="aa-region-section"
                key={bloc.slug}
                aria-labelledby={`titre-${bloc.slug}`}
              >
                <h2 className="aa-h3" id={`titre-${bloc.slug}`}>
                  {bloc.titre}
                </h2>
                <CorpsContenu corps={bloc.corps} />
              </section>
            ))}
          </div>
          <p className="aa-liens-vitrine">
            <Link className="aa-lien-texte" href="/parcours">
              Découvrir les parcours
            </Link>
            <Link className="aa-lien-texte" href="/">
              Revenir à l’accueil
            </Link>
          </p>
        </div>
      </section>
      <Frise />
    </>
  );
}
