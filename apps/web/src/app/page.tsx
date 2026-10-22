import Link from 'next/link';

import { AaPhoto } from '@/components/aa-photo';
import { assistancePhoneHref } from '@/components/assistance-button';
import { Crete, Frise } from '@/components/frise';
import {
  GlypheIngel,
  GlypheTabzimt,
  GlypheTala,
  GlypheYaz,
} from '@/components/glyphes-piliers';
import { SectionPartenaires } from '@/components/section-partenaires';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { getPartenairesSection } from '@/modules/sponsors/service';

const PHOTOS = '/charte/photos-2026';

const PILIERS = [
  {
    Glyphe: GlypheYaz,
    titre: 'Sport',
    texte: 'Deux trails — 35 km et 12 km — au départ du stade Agni Lhoudh.',
  },
  {
    Glyphe: GlypheTala,
    titre: 'Santé',
    texte: '116 enfants ont couru la Course Kids lors de l’édition 2026.',
  },
  {
    Glyphe: GlypheTabzimt,
    titre: 'Citoyenneté',
    texte: 'Coureurs, familles et bénévoles se retrouvent au village d’Aït Aïssi.',
  },
  {
    Glyphe: GlypheIngel,
    titre: 'Écologie',
    texte: 'Les sentiers traversent la forêt de Yakouren.',
  },
];

// Section partenaires lue en base à chaque requête (bascule A/B « sans dev »,
// FR-22) : l’accueil passe du prérendu statique au dynamique — la section est
// rendue serveur à chaque requête (voir Design Notes 2.3), le reste de la page
// est inchangé (texte).
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [telephone, partenaires] = await Promise.all([
    readAssistancePhone(),
    getPartenairesSection(),
  ]);

  return (
    <>
      <Frise />
      <section className="aa-hero">
        <AaPhoto
          variant="couverture"
          priority
          src={`${PHOTOS}/aitaissi-2026-celebration-montagne-640.webp`}
          srcLarge={`${PHOTOS}/aitaissi-2026-celebration-montagne-1280.webp`}
          alt="Coureurs en célébration sur le sentier, en montagne, édition 2026"
          width={640}
          height={360}
        />
        <div className="aa-hero__veil" aria-hidden="true" />
        <div className="aa-hero__body">
          <p className="aa-hero__eyebrow">2ᵉ édition — 26 mars 2027</p>
          <h1 className="aa-hero__title">
            Week-end Sportif <em>Aït Aïssi</em>
          </h1>
          <Crete />
          <p className="aa-hero__meta">
            Trail en forêt au départ du stade Agni Lhoudh — Aït Aïssi, commune de Yakouren.
          </p>
          <div className="aa-hero__actions">
            <Link className="aa-btn aa-btn--primary" href="/connexion">
              S’inscrire
            </Link>
            <a className="aa-btn aa-btn--on-forest" href={assistancePhoneHref(telephone)}>
              Appeler l’équipe
            </a>
          </div>
        </div>
      </section>

      <section className="vitrine-bande" aria-labelledby="titre-bilan-2026">
        <div className="aa-section">
          <p className="aa-eyebrow">Bilan 2026</p>
          <h2 className="aa-h2" id="titre-bilan-2026">
            Une première édition réussie
          </h2>
          <p className="aa-lead">
            En 2026, la première édition a réuni coureurs, familles et bénévoles au village
            d’Aït Aïssi. Voici les chiffres officiels.
          </p>
          <div className="aa-stats">
            <div className="aa-stat">
              <p className="aa-stat__value">279</p>
              <p className="aa-stat__label">Inscrits</p>
            </div>
            <div className="aa-stat">
              <p className="aa-stat__value">222</p>
              <p className="aa-stat__label">Dossards distribués</p>
            </div>
            <div className="aa-stat">
              <p className="aa-stat__value">214</p>
              <p className="aa-stat__label">Finishers au trail</p>
              <p className="aa-stat__note">dont 36 femmes</p>
            </div>
            <div className="aa-stat">
              <p className="aa-stat__value">116</p>
              <p className="aa-stat__label">Enfants à la Course Kids</p>
            </div>
          </div>
          <p className="aa-note">Chiffres officiels de l’édition 2026.</p>
        </div>
      </section>

      <section className="vitrine-bande" aria-labelledby="titre-epreuves-2027">
        <div className="aa-section">
          <p className="aa-eyebrow">Les épreuves</p>
          <h2 className="aa-h2" id="titre-epreuves-2027">
            Deux trails au départ du stade
          </h2>
          <p className="aa-lead">
            Le 26 mars 2027, deux courses de trail partent du stade Agni Lhoudh, sur les
            sentiers de la forêt de Yakouren.
          </p>
          <div className="aa-cards">
            <article className="aa-card">
              <span className="aa-chip aa-chip--phare">Épreuve phare</span>
              <h3 className="aa-card__title">Trail long — 35 km</h3>
              <p className="aa-card__text">
                La grande course de l’édition 2027, au départ du stade Agni Lhoudh.
              </p>
            </article>
            <article className="aa-card">
              <h3 className="aa-card__title">Trail moyen — 12 km</h3>
              <p className="aa-card__text">
                Une distance plus courte, le même jour, sur les mêmes sentiers.
              </p>
            </article>
          </div>
          <div className="aa-galerie">
            <AaPhoto
              src={`${PHOTOS}/aitaissi-2026-ligne-depart-640.webp`}
              srcLarge={`${PHOTOS}/aitaissi-2026-ligne-depart-1280.webp`}
              alt="Coureurs rassemblés sur la ligne de départ du trail, édition 2026"
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
        </div>
      </section>

      <section
        className="vitrine-bande"
        aria-labelledby="titre-piliers"
      >
        <div className="aa-section">
          <p className="aa-eyebrow">Le village</p>
          <h2 className="aa-h2" id="titre-piliers">
            Une course portée par son village
          </h2>
          <p className="aa-lead">
            Sport, santé, citoyenneté, écologie : quatre piliers ancrent la
            course dans la vie du village d’Aït Aïssi.
          </p>
          <div className="aa-piliers">
            {PILIERS.map(({ Glyphe, titre, texte }) => (
              <article className="aa-card aa-pilier" key={titre}>
                <Glyphe />
                <h3 className="aa-pilier__titre">{titre}</h3>
                <p className="aa-pilier__texte">{texte}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SectionPartenaires view={partenaires} />

      <section
        className="vitrine-bande vitrine-bande--foret"
        aria-labelledby="titre-contact"
      >
        <div className="aa-section">
          <p className="aa-eyebrow">Contact</p>
          <h2 className="aa-h2" id="titre-contact">
            Appelez l’équipe
          </h2>
          <p className="aa-lead">
            Une question sur les inscriptions ou les épreuves ? L’équipe du Week-end
            Sportif Aït Aïssi vous répond au téléphone.
          </p>
          <div className="aa-section__actions">
            <a className="aa-btn aa-btn--on-forest" href={assistancePhoneHref(telephone)}>
              Appeler l’équipe
            </a>
            <p className="aa-contact-numero">{telephone}</p>
          </div>
        </div>
      </section>
      <Frise />
    </>
  );
}
