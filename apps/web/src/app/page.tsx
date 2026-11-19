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
import { CompteurPlaces } from '@/components/compteur-places';
import { SectionPartenaires } from '@/components/section-partenaires';
import { PRESENTATIONS_EPREUVES } from '@/components/presentations-epreuves';
import { SectionParcours } from '@/components/section-parcours';
import { TrailerBloc } from '@/components/trailer-bloc';
import { readAssistancePhone } from '@/lib/assistance-phone';
import { lectureBornee } from '@/lib/lecture-bornee';
import { getParcoursDoc } from '@/modules/contenus/parcours/lecture';
import { getSectionParcours } from '@/modules/contenus/section-parcours';
import { RETOUR_IMAGES_PAGE_VIDE, resolveTrailerPlayer } from '@/modules/retour-images/domain';
import {
  DATE_COURSE_INCONNUE,
  getDateCourseVitrine,
  getPlacesVitrine,
  PLACES_MUETTES,
} from '@/modules/inscriptions/service';
import { getRetourImagesPage } from '@/modules/retour-images/service';
import { getPartenairesSection } from '@/modules/sponsors/service';


const PHOTOS = '/charte/photos-2026';

/** « au printemps 2027 » devient « Au printemps 2027 » en tête de phrase. */
function premiereMajuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Teaser de l'accueil : lien PROVISOIRE, posé en recette du 04/11/2026 en
 * attendant le montage définitif. Dès qu'une adresse est enregistrée dans
 * /admin/retour-images, c'est elle qui l'emporte — ce lien n'est qu'un repli.
 */
const TEASER_PROVISOIRE = 'https://www.youtube.com/watch?v=jpvFJ2vTPZA';

// Valeurs du dossier de partenariat 2027 (« Notre vision ») ; chiffres du
// bilan officiel de l'édition 2026 (réunion du 4 avril 2026).
const PILIERS = [
  {
    Glyphe: GlypheYaz,
    titre: 'Sport & santé',
    accroche: 'De 7 à 77 ans, l’envie de bouger.',
    texte:
      'Les traileurs confirmés côtoient les familles : pendant que le trail s’élance dans la forêt, le stade Agni Lhoudh accueille compétitions, initiations et découvertes.',
    chiffre: '96 %',
    legende: 'des coureurs au départ ont franchi l’arrivée en 2026',
  },
  {
    Glyphe: GlypheTala,
    titre: 'Jeunesse',
    accroche: 'Des disciplines nouvelles, le goût de l’effort.',
    texte:
      'Boxe, karaté, gymnastique, échecs : chaque discipline a sa zone sur le stade. Les jeunes regardent, s’essaient, et repartent parfois avec une passion.',
    chiffre: '116 enfants',
    legende: 'au départ de la Course Kids en 2026',
  },
  {
    Glyphe: GlypheTabzimt,
    titre: 'Liens entre générations',
    accroche: 'Un même rendez-vous pour toutes les générations.',
    texte:
      'Anciens, familles et sportifs se retrouvent au village d’Aït Aïssi. Chants, bendir et plats partagés accompagnent les athlètes du départ à l’arrivée : ici, une course est aussi une fête.',
    chiffre: '2 jours',
    legende: 'de sport et de fête au village',
  },
  {
    Glyphe: GlypheIngel,
    titre: 'Nature & territoire',
    accroche: 'La Kabylie, à travers ses sentiers.',
    texte:
      'Le trail traverse la forêt de Yakouren, l’un des grands massifs forestiers de la région, entre crêtes, sous-bois et ruelles du village. Une invitation à découvrir nos paysages.',
    chiffre: '8 disciplines',
    legende: 'sur le stade et dans la forêt en 2026',
  },
];

import './vue-parcours.css';

export const metadata = {
  title: 'Week-end Sportif Aït Aïssi',
  description:
    'Deux trails au départ du stade Agni Lhoudh, au village d’Aït Aïssi. Dates, épreuves, parcours et informations pratiques de l’édition 2027.',
};

// Section partenaires lue en base (bascule A/B « sans dev », FR-22). La page
// est mise en cache 60 s au lieu d'être rendue à chaque requête : le hero, les
// chiffres 2026 et le CTA ne dépendent plus de Postgres pour s'afficher
// (budget : premier rendu lisible < 5 s en 3G lent). Les écritures de
// /admin/sponsors invalident la page immédiatement (revalidatePath).
export const revalidate = 60;

export default async function HomePage() {
  // Chaque lecture en base est bornée (lib/lecture-bornee) : une base muette
  // ne doit ni bloquer le build, ni figer l'accueil.
  const [telephone, partenaires, parcours, retourImages, places, dateCourse] = await Promise.all([
    readAssistancePhone(),
    lectureBornee(getPartenairesSection(), null, 'partenaires'),
    lectureBornee(getSectionParcours(), { epreuves: [] }, 'parcours'),
    lectureBornee(getRetourImagesPage(), RETOUR_IMAGES_PAGE_VIDE, 'retour en images'),
    lectureBornee(getPlacesVitrine(), PLACES_MUETTES, 'places'),
    lectureBornee(getDateCourseVitrine(), DATE_COURSE_INCONNUE, 'date de course'),
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
          Revue visuelle du 04/11/2026 (B1) : la clé « Épreuves » annonçait
          « 35 km · 12 km » alors que la section parcours, plus bas sur la même
          page, publie les 28 km du relevé d'essai. Aucune distance n'est plus
          figée ici : elles viennent toutes de parcours.json, avec leur mention
          « tracé provisoire ».
          Recette du 04/11/2026 : la date exacte n'est publique que si
          l'organisation l'a décidé (réglage d'administration). Tant que non, la
          vitrine ne dit que la saison, ici comme dans l'accroche et la section
          des épreuves — une seule source, getDateCourseVitrine. */}
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
                {premiereMajuscule(dateCourse.libelle)}
              </dd>
            </div>
            <div className="aa-hero__rail-cles">
              <div className="aa-hero__cle">
                <dt>Épreuves</dt>
                <dd>Deux trails</dd>
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
            n’oublie pas. Le trail d’Aït Aïssi revient {dateCourse.phrase}.
          </p>
          <CompteurPlaces places={places} />
          <div className="aa-hero__actions">
            {/* Recette du 04/11/2026 : « Participer » plutôt que « S'inscrire » —
                le parcours derrière (connexion puis inscription) est inchangé. */}
            <Link className="socle-action" href="/connexion?parcours=inscription">
              Participer
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
      {/* Recette du 04/11/2026 : plus de surtitre ni d'intertitre au-dessus de la
          vidéo — elle ouvre la section seule. Le titre revient juste avant les
          chiffres, qu'il introduit littéralement. */}
      <section
        className="vitrine-bande vitrine-bande--foret aa-bilan"
        aria-labelledby="titre-bilan-2026"
      >
        <div className="aa-section">
          {teaser !== null ? (
            <div className="aa-bilan__teaser">
              <TrailerBloc player={teaser} auto />
            </div>
          ) : null}

          <h2 className="aa-h2 aa-bilan__titre" id="titre-bilan-2026">
            La première édition, c’est
          </h2>
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
        </div>
      </section>

      {/* Section « épreuves » et section « parcours » FUSIONNÉES (recette du
          05/11/2026) : l'accueil montrait d'abord deux cartes d'accroche, puis,
          plus bas, un sélecteur et une fiche. Un seul bloc désormais — on choisit
          Grande Boucle ou Boucle Moyenne, et le détail de l'épreuve (chiffres, carte en relief,
          profil) s'affiche juste en dessous. Reprise de la vue du POC 3D. */}
      <SectionParcours
        entete={{
          id: 'titre-epreuves-2027',
          surtitre: 'Les épreuves',
          titre: 'Deux trails au départ du stade',
          chapeau: `${premiereMajuscule(dateCourse.phrase)}, deux courses de trail partent du stade Agni Lhoudh, sur les sentiers de la forêt de Yakouren.`,
        }}
        presentations={PRESENTATIONS_EPREUVES}
        sansLienDetail
        pied={
          <>
            {/* Retour comité 2027 : le lien texte « Parcours, horaires et
                consignes » passait inaperçu et promettait des horaires que la
                page ne publie pas. Un vrai bouton, qui dit ce qu'on y trouve. */}
            <p className="aa-liens-vitrine">
              <Link className="socle-action socle-action--contour" href="/parcours">
                Voir les parcours en détail : carte, profil et ravitaillements
              </Link>
            </p>
            <div className="aa-galerie">
              <article className="aa-galerie__carte">
                <AaPhoto
                  src={`${PHOTOS}/aitaissi-2026-celebration-montagne-640.webp`}
                  srcLarge={`${PHOTOS}/aitaissi-2026-celebration-montagne-1280.webp`}
                  alt="Coureurs en célébration sur le sentier, en montagne, édition 2026"
                  width={640}
                  height={360}
                />
                <div className="aa-galerie__corps">
                  <p className="aa-galerie__surtitre">L’ambiance</p>
                  <h3 className="aa-galerie__titre">Une arrivée qui tourne à la fête</h3>
                  <p className="aa-galerie__texte">
                    Chants, bendir et applaudissements : tout le village attend
                    les coureurs sur la ligne. Ici, on ne franchit pas l’arrivée
                    seul.
                  </p>
                  <Link className="aa-lien-texte" href="/retour-en-images">
                    Revivre l’édition 2026 en images
                  </Link>
                </div>
              </article>
              <article className="aa-galerie__carte">
                <AaPhoto
                  src={`${PHOTOS}/aitaissi-2026-arrivee-groupe-medailles-640.webp`}
                  srcLarge={`${PHOTOS}/aitaissi-2026-arrivee-groupe-medailles-1280.webp`}
                  alt="Coureurs à l’arrivée, médailles au cou, édition 2026"
                  width={640}
                  height={360}
                />
                <div className="aa-galerie__corps">
                  <p className="aa-galerie__surtitre">La région et la nature</p>
                  <h3 className="aa-galerie__titre">Au cœur de la forêt de Yakouren</h3>
                  <p className="aa-galerie__texte">
                    Chênes, crêtes et villages perchés de Kabylie : venir courir à
                    Aït Aïssi, c’est aussi découvrir un territoire. Où dormir, comment
                    venir, que voir autour.
                  </p>
                  <Link className="aa-lien-texte" href="/region">
                    Découvrir la région et préparer son séjour
                  </Link>
                </div>
              </article>
            </div>
          </>
        }
        version={getParcoursDoc()?.version ?? 0}
        view={parcours}
      />

      <section
        className="vitrine-bande"
        aria-labelledby="titre-piliers"
      >
        <div className="aa-section">
          <p className="aa-eyebrow">Nos valeurs</p>
          <h2 className="aa-h2" id="titre-piliers">
            Le sport comme trait d’union
          </h2>
          <p className="aa-lead">
            Né d’une idée simple, réunir tout un village et bien au-delà autour
            du sport, le Week-end Sportif est porté par le comité de village, le
            club sportif de jeunes et les associations d’Aït Aïssi. Une
            conviction le guide : le sport rassemble les générations et fait
            vivre un territoire.
          </p>
          <ol className="aa-piliers">
            {PILIERS.map(({ Glyphe, titre, accroche, texte, chiffre, legende }) => (
              <li className="aa-piliers__item" key={titre}>
                <article className="aa-card aa-pilier">
                  <Glyphe />
                  <h3 className="aa-pilier__titre">{titre}</h3>
                  <p className="aa-pilier__accroche">{accroche}</p>
                  <p className="aa-pilier__texte">{texte}</p>
                  <p className="aa-pilier__fait">
                    <span className="aa-pilier__chiffre">{chiffre}</span>
                    <span className="aa-pilier__legende">{legende}</span>
                  </p>
                </article>
              </li>
            ))}
          </ol>
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
