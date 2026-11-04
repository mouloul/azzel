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
import { SectionParcours } from '@/components/section-parcours';
import { TrailerBloc } from '@/components/trailer-bloc';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { getSectionParcours } from '@/modules/contenus/section-parcours';
import { resolveTrailerPlayer } from '@/modules/retour-images/domain';
import { getRetourImagesPage } from '@/modules/retour-images/service';
import { getPartenairesSection } from '@/modules/sponsors/service';


const PHOTOS = '/charte/photos-2026';

/**
 * Teaser de l'accueil : lien PROVISOIRE, posé en recette du 04/11/2026 en
 * attendant le montage définitif. Dès qu'une adresse est enregistrée dans
 * /admin/retour-images, c'est elle qui l'emporte — ce lien n'est qu'un repli.
 */
const TEASER_PROVISOIRE = 'https://youtu.be/ZLqzyLtao7A';

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

export const metadata = {
  title: 'Week-end Sportif Aït Aïssi',
  description:
    'Deux trails — 35 km et 12 km — au départ du stade Agni Lhoudh, au village d’Aït Aïssi. Dates, épreuves, parcours et informations pratiques de l’édition 2027.',
};

// Section partenaires lue en base (bascule A/B « sans dev », FR-22). La page
// est mise en cache 60 s au lieu d'être rendue à chaque requête : le hero, les
// chiffres 2026 et le CTA ne dépendent plus de Postgres pour s'afficher
// (budget : premier rendu lisible < 5 s en 3G lent). Les écritures de
// /admin/sponsors invalident la page immédiatement (revalidatePath).
export const revalidate = 60;

export default async function HomePage() {
  const [telephone, partenaires, parcours, retourImages] = await Promise.all([
    readAssistancePhone(),
    getPartenairesSection(),
    getSectionParcours(),
    getRetourImagesPage(),
  ]);
  // La vidéo de l'admin prime ; sans elle, le teaser provisoire. Le bloc ne
  // charge rien avant le clic : le budget de premier chargement est intact.
  const teaser = retourImages.trailer ?? resolveTrailerPlayer(TEASER_PROVISOIRE);

  return (
    <>
      <Frise />
      {/* Hero plein écran (story 9.2) : photo de la ligne de départ 2026
          conservée (LCP), en-tête du site posé dessus (body:has(.aa-hero--plein),
          sans JS), titre condensé à très grande échelle à gauche, rail de
          chiffres clés cloisonné à droite (sous le titre en mobile). Le bandeau
          de date et le badge des épreuves se fondent dans le rail. Les chiffres
          du rail sont les seuls officiels : date, épreuves, départ, cadre —
          D+ et tracés 2027 attendent la confirmation du comité (page /parcours).
          Recette du 04/11/2026 : la date exacte n'est pas encore publique — la
          vitrine ne dit que « printemps 2027 », ici comme dans l'accroche et la
          section des épreuves. */}
      <section className="aa-hero aa-hero--plein" aria-labelledby="titre-accueil">
        <AaPhoto
          variant="couverture"
          priority
          src={`${PHOTOS}/aitaissi-2026-ligne-depart-640.webp`}
          srcLarge={`${PHOTOS}/aitaissi-2026-ligne-depart-1280.webp`}
          alt="Coureurs rassemblés au départ du trail, au stade Agni Lhoudh, édition 2026"
          width={640}
          height={360}
        />
        <div className="aa-hero__veil" aria-hidden="true" />
        <div className="aa-hero__body">
          <h1 className="aa-hero__title" id="titre-accueil">
            Week-end Sportif <em>Aït Aïssi</em>
          </h1>
          <Crete />
          {/* Recette du 04/11/2026 : les quatre clés formaient un tableau cloisonné
              sans hiérarchie. La date passe en vedette (crête ocre dessous), les trois
              autres clés suivent sur une rangée — mêmes faits, même ordre. */}
          <dl className="aa-hero__rail">
            <div className="aa-hero__rail-vedette">
              <dt>Date</dt>
              <dd>
                <span className="aa-hero__rang">2ᵉ édition</span>
                Printemps 2027
              </dd>
            </div>
            <div className="aa-hero__rail-cles">
              <div className="aa-hero__cle">
                <dt>Épreuves</dt>
                <dd>35 km · 12 km</dd>
              </div>
              <div className="aa-hero__cle">
                <dt>Départ</dt>
                <dd>Stade Agni Lhoudh</dd>
              </div>
              <div className="aa-hero__cle">
                <dt>Cadre</dt>
                <dd>Forêt de Yakouren</dd>
              </div>
            </div>
          </dl>
          {/* Accroche (recette 04/11/2026) : la phrase descriptive ne disait rien
              que le rail ne dise déjà. Elle s’appuie désormais sur la première
              édition — sans chiffre ici, le bilan 2026 plus bas porte les chiffres
              officiels. */}
          <p className="aa-hero__meta">
            Une première édition qui a dépassé toutes les attentes : le village
            mobilisé, les sentiers de Yakouren pris d’assaut, une ambiance qu’on
            n’oublie pas. Le trail d’Aït Aïssi revient au printemps 2027.
          </p>
          <div className="aa-hero__actions">
            <Link className="socle-action" href="/connexion?parcours=inscription">
              S’inscrire
            </Link>
            <a
              className="socle-action socle-action--contour"
              href={assistancePhoneHref(telephone)}
            >
              Appeler l’équipe
            </a>
          </div>
        </div>
      </section>

      {/* Bilan 2026 — recette du 04/11/2026 : le teaser porte la section. Gros
          encart vidéo pleine largeur, les quatre chiffres officiels en rangée
          juste dessous. Rien n'est chargé avant le clic sur le poster. */}
      {/* Recette du 04/11/2026 : surtitre et titre retirés — la vidéo et les
          chiffres disent la première édition mieux qu'un intertitre. La section
          garde un nom accessible (plus de h2 à référencer). */}
      <section
        className="vitrine-bande vitrine-bande--foret aa-bilan"
        aria-label="Bilan de l’édition 2026"
      >
        <div className="aa-section">
          {teaser !== null ? (
            <div className="aa-bilan__teaser">
              <TrailerBloc player={teaser} auto />
            </div>
          ) : null}

          <dl className="aa-bilan__rail">
            <div className="aa-bilan__stat">
              <dt>Inscrits</dt>
              <dd>279</dd>
            </div>
            <div className="aa-bilan__stat">
              <dt>Dossards distribués</dt>
              <dd>222</dd>
            </div>
            <div className="aa-bilan__stat">
              <dt>Finishers au trail</dt>
              <dd>214</dd>
              <dd>dont 36 femmes</dd>
            </div>
            <div className="aa-bilan__stat">
              <dt>Enfants à la Course Kids</dt>
              <dd>116</dd>
            </div>
          </dl>
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
            Au printemps 2027, deux courses de trail partent du stade Agni Lhoudh, sur les
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
          <p className="aa-liens-vitrine">
            <Link className="aa-lien-texte" href="/parcours">
              Parcours, horaires et consignes
            </Link>
            <Link className="aa-lien-texte" href="/region">
              Hébergement et infos pratiques dans la région
            </Link>
          </p>
          <div className="aa-galerie">
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
        </div>
      </section>

      {/* Section parcours (story 9.3) : coquille de comparaison des deux
          épreuves — sélecteur sans JS, champs réels seulement (nom, distance,
          GPX), emplacement de la visualisation annoncé (épopée 11). Après le
          hero et la section épreuves : jamais le premier écran. */}
      <SectionParcours view={parcours} />

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
            <a
              className="socle-action socle-action--contour"
              href={assistancePhoneHref(telephone)}
            >
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
