import Link from 'next/link';

import { Crete, Frise } from '@/components/frise';
import { PRESENTATIONS_EPREUVES } from '@/components/presentations-epreuves';
import { RavitaillementsListe } from '@/components/ravitaillements-liste';
import { SectionParcours } from '@/components/section-parcours';
import { lectureBornee } from '@/lib/lecture-bornee';
import { getParcoursDoc } from '@/modules/contenus/parcours/lecture';
import { getSectionParcours, SECTION_PARCOURS_VIDE } from '@/modules/contenus/section-parcours';

import '../vitrine-textes.css';
import '../vue-parcours.css';

const CHAPEAU =
  'Deux trails au départ du stade Agni Lhoudh, sur les sentiers de la forêt de Yakouren. Les détails de l’édition 2027 sont confirmés par le comité avant publication.';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Parcours',
  description:
    'Parcours, dénivelés, horaires et ravitaillements des deux trails du Week-end Sportif Aït Aïssi — édition 2027.',
};

export default async function ParcoursPage() {
  // Lecture bornée (lib/lecture-bornee) : une base muette rendait la page
  // jusqu'au timeout de 300 s de la fonction Vercel (504) au lieu du repli
  // déjà appliqué sur l'accueil pour cette même lecture.
  const parcours = await lectureBornee(getSectionParcours(), SECTION_PARCOURS_VIDE, 'parcours');

  if (parcours.epreuves.length === 0) {
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
            <p className="aa-lead">{CHAPEAU}</p>
            <p className="aa-note">
              Les parcours détaillés de l’édition 2027 seront publiés après
              confirmation par le comité.
            </p>
            <LiensVitrine />
          </div>
        </section>
        <Frise />
      </>
    );
  }

  return (
    <>
      <Frise />
      {/* Même vue que l'accueil (sélecteur Longue / Moyenne, carte en relief,
          profil) : une seule composition pour les deux pages. */}
      <SectionParcours
        entete={{
          id: 'titre-parcours',
          surtitre: 'Se préparer',
          titre: 'Les parcours',
          chapeau: CHAPEAU,
          h1: true,
        }}
        pied={
          <>
            <RavitaillementsListe />
            <LiensVitrine />
          </>
        }
        presentations={PRESENTATIONS_EPREUVES}
        sansLienDetail
        version={getParcoursDoc()?.version ?? 0}
        view={parcours}
      />
      <Frise />
    </>
  );
}

function LiensVitrine() {
  return (
    <p className="aa-liens-vitrine">
      <Link className="aa-lien-texte" href="/region">
        Préparez votre séjour dans la région
      </Link>
      <Link className="aa-lien-texte" href="/">
        Revenir à l’accueil
      </Link>
    </p>
  );
}
