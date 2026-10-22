import Link from 'next/link';

import { AaPhoto } from '@/components/aa-photo';
import { assistancePhoneHref } from '@/components/assistance-button';
import { readAssistancePhone } from '@/lib/assistance-phone';

const PHOTOS = '/charte/photos-2026';

export default function HomePage() {
  const telephone = readAssistancePhone();

  return (
    <>
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
    </>
  );
}
