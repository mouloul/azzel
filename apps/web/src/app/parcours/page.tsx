import Link from 'next/link';

import { CITATION_BATTERIE_SOURCE } from '@azzel/shared';

import { CorpsContenu } from '@/components/corps-contenu';
import { Crete, Frise } from '@/components/frise';
import { isHttpsUrl } from '@/modules/contenus/domain';
import { getParcoursPage } from '@/modules/contenus/service';

import '../vitrine-textes.css';

// Citation kabyle exclusivement aux ravitaillements (charte) : jamais sur
// l'accueil, jamais en zone critique, source notée (Hanoteau, 1867). La
// source vit dans packages/shared (formulation canonique, partagée avec la
// rubrique batterie de l'app coureurs — story 6.4).
const CITATION_AMAN = 'Aman d laman — l’eau est sûre';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Parcours',
  description:
    'Parcours, dénivelés, horaires et ravitaillements des deux trails du Week-end Sportif Aït Aïssi — édition 2027.',
};

export default async function ParcoursPage() {
  const { blocs } = await getParcoursPage();

  return (
    <>
      <Frise />
      <section className="vitrine-bande" aria-labelledby="titre-parcours">
        <div className="aa-section">
          <p className="aa-eyebrow">Se préparer</p>
          <h1 className="aa-h2" id="titre-parcours">
            Les parcours
          </h1>
          <Crete />
          <p className="aa-lead">
            Deux trails au départ du stade Agni Lhoudh, sur les sentiers de la
            forêt de Yakouren. Les détails de l’édition 2027 sont confirmés par
            le comité avant publication.
          </p>
          {blocs.length > 0 ? (
            <div className="aa-cards aa-parcours">
              {blocs.map((bloc) => {
                // Garde de rendu (défense en profondeur) : une URL non https
                // échappée en base ne devient jamais un href — « Tracé à venir ».
                const gpxUrl =
                  bloc.epreuve?.gpxUrl !== null &&
                  bloc.epreuve?.gpxUrl !== undefined &&
                  isHttpsUrl(bloc.epreuve.gpxUrl)
                    ? bloc.epreuve.gpxUrl
                    : null;
                return (
                  <article className="aa-card" key={bloc.slug}>
                    {bloc.epreuve !== null ? (
                      <span className="aa-chip aa-chip--phare">
                        {`${bloc.epreuve.distanceKm} km`}
                      </span>
                    ) : null}
                    <h2 className="aa-card__title">{bloc.titre}</h2>
                    <CorpsContenu corps={bloc.corps} className="aa-card__corps" />
                    {gpxUrl !== null ? (
                      // Chargement différé structurel : rien n'est téléchargé avant
                      // l'ouverture du <details> — le tracé lui-même reste un simple
                      // lien (la carte interactive relève de l'épopée 7).
                      <details className="aa-gpx">
                        <summary>Voir le tracé GPX</summary>
                        <a href={gpxUrl} rel="noopener noreferrer">
                          Télécharger le tracé GPX
                        </a>
                      </details>
                    ) : (
                      <p className="aa-note">Tracé à venir</p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="aa-note">
              Les parcours détaillés de l’édition 2027 seront publiés après
              confirmation par le comité.
            </p>
          )}
          {blocs.length > 0 ? (
            <aside className="aa-citation" aria-labelledby="titre-ravitaillements">
              <p className="aa-eyebrow">Ravitaillements</p>
              <h2 className="aa-h3" id="titre-ravitaillements">
                L’eau des ravitaillements
              </h2>
              <blockquote className="aa-citation__bloc">
                <p>« {CITATION_AMAN}. »</p>
                <footer>— {CITATION_BATTERIE_SOURCE}</footer>
              </blockquote>
            </aside>
          ) : null}
          <p className="aa-liens-vitrine">
            <Link className="aa-lien-texte" href="/region">
              Préparez votre séjour dans la région
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
