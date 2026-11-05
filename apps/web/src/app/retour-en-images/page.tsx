import Link from 'next/link';

import { AaPhoto } from '@/components/aa-photo';
import { Crete, Frise } from '@/components/frise';
import {
  RETOUR_IMAGES_PAGE_VIDE,
  type RetourImagesPageView,
} from '@/modules/retour-images/domain';
import { getRetourImagesPage } from '@/modules/retour-images/service';

import { TrailerBloc } from '@/components/trailer-bloc';

import '../vitrine-textes.css';

const PHOTOS = '/charte/photos-2026';

// Page dédiée (arborescence charte) — la matière 1ʳᵉ édition reste une question
// ouverte : trailer et témoignages se dégradent proprement (blocs absents),
// la page reste digne (intro + galerie) sans section vide ni « bientôt ».
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Retour en images',
  description:
    'Vidéo de la première édition, témoignages des coureurs et photos du Week-end Sportif Aït Aïssi 2026.',
};

export default async function RetourEnImagesPage() {
  // Page publique : aucune erreur ne doit casser la coquille (intro + galerie).
  // La panne de base est déjà dégradée en vue vide par le service (warning) ;
  // ici, toute erreur résiduelle (organisation absente, bug de code) rend
  // elle aussi la page sans matière — le bug reste tracé en console.error.
  let vue: RetourImagesPageView = RETOUR_IMAGES_PAGE_VIDE;
  try {
    vue = await getRetourImagesPage();
  } catch (error) {
    console.error(
      '[vitrine] page retour en images : lecture impossible, page rendue sans matière —',
      error instanceof Error ? error.message : error,
    );
  }
  const { trailer, temoignages } = vue;

  return (
    <>
      <Frise />
      <section className="vitrine-bande" aria-labelledby="titre-retour-images">
        <div className="aa-section">
          <p className="aa-eyebrow">Édition 2026</p>
          <h1 className="aa-h2" id="titre-retour-images">
            Retour en images
          </h1>
          <Crete />
          <p className="aa-lead">
            En 2026, la première édition a réuni coureurs, familles et bénévoles
            au village d’Aït Aïssi. Retrouvez ici la vidéo de l’édition, les mots
            des coureurs et quelques images du week-end.
          </p>

          {trailer !== null ? (
            <section className="aa-retour-section" aria-labelledby="titre-trailer">
              <h2 className="aa-h3" id="titre-trailer">
                Le film de la première édition
              </h2>
              <TrailerBloc player={trailer} />
            </section>
          ) : null}

          {temoignages.length > 0 ? (
            <section className="aa-retour-section" aria-labelledby="titre-temoignages">
              <h2 className="aa-h3" id="titre-temoignages">
                Ils ont couru en 2026
              </h2>
              <div className="aa-temoignages">
                {temoignages.map((temoignage) => (
                  <article className="aa-card aa-temoignage" key={temoignage.id}>
                    <div className="aa-temoignage__entete">
                      <span className="aa-temoignage__avatar" aria-hidden="true">
                        {temoignage.initiales}
                      </span>
                      <div>
                        <p className="aa-temoignage__prenom">{temoignage.prenom}</p>
                        <p className="aa-temoignage__edition">
                          {temoignage.editionReference}
                        </p>
                      </div>
                    </div>
                    <blockquote className="aa-temoignage__citation">
                      <p>« {temoignage.citation} »</p>
                    </blockquote>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="aa-retour-section" aria-labelledby="titre-galerie">
            <h2 className="aa-h3" id="titre-galerie">
              La galerie 2026
            </h2>
            <div className="aa-galerie">
              <AaPhoto
                src={`${PHOTOS}/aitaissi-2026-ligne-depart-640.webp`}
                srcLarge={`${PHOTOS}/aitaissi-2026-ligne-depart-1280.webp`}
                alt="Coureurs rassemblés sur la ligne de départ du trail, édition 2026"
                width={640}
                height={360}
              />
              <AaPhoto
                src={`${PHOTOS}/aitaissi-2026-celebration-montagne-640.webp`}
                srcLarge={`${PHOTOS}/aitaissi-2026-celebration-montagne-1280.webp`}
                alt="Coureurs en célébration sur le sentier, en montagne, édition 2026"
                width={640}
                height={360}
              />
              <AaPhoto
                src={`${PHOTOS}/aitaissi-2026-arrivee-groupe-medailles-640.webp`}
                srcLarge={`${PHOTOS}/aitaissi-2026-arrivee-groupe-medailles-1280.webp`}
                alt="Coureurs à l’arrivée, médailles au cou, édition 2026"
                width={640}
                height={360}
              />
            </div>
            <p className="aa-note">Photos officielles de l’édition 2026.</p>
          </section>

          <p className="aa-liens-vitrine">
            <Link className="aa-lien-texte" href="/parcours">
              Découvrir les parcours 2027
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
