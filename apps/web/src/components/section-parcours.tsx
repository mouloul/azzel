import Link from 'next/link';

import { isHttpsUrl } from '@/modules/contenus/domain';
import { VueParcours } from '@/components/vue-parcours';
import {
  analyserProfil,
  redigerFicheTechnique,
} from '@/modules/contenus/parcours/fiche-technique';
import type { ReactNode } from 'react';

import type {
  EpreuveSectionParcours,
  MetriquesEpreuve,
  SectionParcoursView,
} from '@/modules/contenus/section-parcours';

/* Story 9.3 — coquille de la section parcours sur l’accueil.
 *
 * Sélecteur SANS JavaScript : des radios natifs (un groupe = une seule
 * variable d’état, possédée par le navigateur) + des règles `:has()` générées
 * côté serveur — cocher un radio affiche le panneau de SON épreuve et lui
 * seul. Le clavier (tabulation + flèches) est natif, les labels sont les
 * cibles (≥ 44 px via .socle-action). Story 11.4 : l’aside viz suit la même
 * bascule ([data-viz]) — profil altimétrique si données, annonce sinon.
 *
 * Champs disponibles seuls (règle « aucun chiffre inventé ») : nom, distance,
 * lien GPX. Métriques et points de passage ne sont rendus QUE s’ils sont
 * fournis non nuls par le contrat — la story 11.1 branche `parcours.json`
 * côté données, ce rendu ne change pas.
 *
 * `@supports not selector(:has(*))` (globals.css) empile les panneaux : sur
 * un navigateur sans :has(), la section reste lisible, simplement non pliée. */

const NBSP = '\u202f';

/**
 * Décision produit 2026-11-04 : le relevé GPX publié est un relevé D’ESSAI
 * (« essai trail ait ainsi 2027 ») — le tracé définitif n’existe pas. Toute
 * épreuve affichant des chiffres issus de ce relevé porte cette mention,
 * sobre et factuelle, JAMAIS présentée comme officielle. Une seule source :
 * la retirer ici (une ligne) le jour du tracé officiel.
 */
export const MENTION_TRACE_PROVISOIRE =
  'Tracé provisoire, issu d’un relevé d’essai : distance, dénivelé et profil pourront évoluer.';

const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatM = new Intl.NumberFormat('fr-FR');

function nomCourt(nom: string): string {
  return nom.split(' — ')[0] ?? nom;
}

/** Lignes de synthèse : seules les valeurs connues produisent une ligne. */
function lignesSynthese(epreuve: EpreuveSectionParcours): [label: string, valeur: string][] {
  const lignes: [string, string][] = [['Distance', `${formatKm.format(epreuve.distanceKm)}${NBSP}km`]];
  const m: MetriquesEpreuve | null = epreuve.metriques;
  if (m !== null) {
    if (m.denivelePositifM !== null) lignes.push(['Dénivelé positif', `${formatM.format(m.denivelePositifM)}${NBSP}m`]);
    if (m.deniveleNegatifM !== null) lignes.push(['Dénivelé négatif', `${formatM.format(m.deniveleNegatifM)}${NBSP}m`]);
    if (m.altitudeMinM !== null && m.altitudeMaxM !== null) {
      lignes.push(['Altitude', `${formatM.format(m.altitudeMinM)}–${formatM.format(m.altitudeMaxM)}${NBSP}m`]);
    }
    if (m.heureDepart !== null) lignes.push(['Heure de départ', m.heureDepart]);
    if (m.barriereHoraire !== null) lignes.push(['Barrière horaire', m.barriereHoraire]);
  }
  return lignes;
}

/** Règles de bascule générées par épreuve (clé = rang, pas le slug : rien à échapper).
 *  Story 11.4 : la bascule pilote AUSSI le bloc viz ([data-viz]) de l’aside —
 *  profil SVG pour l’épreuve active si elle a des données, annonce sinon. */
function reglesBascule(nombre: number): string {
  return Array.from({ length: nombre }, (_, i) =>
    `.aa-parcours-accueil:has([data-bascule="${i}"]:checked) [data-panneau="${i}"]{display:block}` +
    `.aa-parcours-accueil:has([data-bascule="${i}"]:checked) [data-libelle="${i}"]{background:var(--az-action);border-color:transparent;color:var(--az-action-texte)}`,
  ).join('');
}

/** Texte d'accroche d'une épreuve, affiché en tête de son panneau. */
export interface PresentationEpreuve {
  phare?: boolean;
  /** Titre d'affichage de l'épreuve ; son nom sinon. */
  titre?: string;
  texte: string;
}

/** Intitulés des trois paragraphes de `redigerFicheTechnique`, dans l'ordre. */
const RUBRIQUES_FICHE = ['Relief', 'Effort', 'Pentes'] as const;

function PanneauEpreuve({
  epreuve,
  rang,
  version,
  presentation,
}: {
  epreuve: EpreuveSectionParcours;
  rang: number;
  version: number;
  presentation?: PresentationEpreuve;
}) {
  // Garde de rendu (défense en profondeur, même garde que /parcours) : une URL
  // non https échappée en base ne devient jamais un href.
  const gpxUrl =
    epreuve.gpxUrl !== null && isHttpsUrl(epreuve.gpxUrl) ? epreuve.gpxUrl : null;
  const points = epreuve.pointsDePassage;
  // Données issues du relevé d’essai (parcours.json) : métriques ou profil.
  // La moyenne (aucun tracé fourni) ne porte JAMAIS la mention.
  const profil = epreuve.profil ?? null;
  const duReleve = epreuve.metriques !== null || profil !== null;
  return (
    <article className="socle-carte aa-parcours-accueil__panneau" data-panneau={rang}>
      <header className="aa-parcours-accueil__tete">
        <p className="aa-parcours-accueil__surtitre">
          {presentation?.phare === true ? (
            <span className="aa-chip aa-chip--phare">Épreuve phare</span>
          ) : null}
          <span>
            {nomCourt(epreuve.nom)} · {formatKm.format(epreuve.distanceKm)}
            {NBSP}km
          </span>
        </p>
        <h3 className="aa-parcours-accueil__titre">{presentation?.titre ?? epreuve.nom}</h3>
        {presentation !== undefined ? (
          <p className="aa-parcours-accueil__accroche">{presentation.texte}</p>
        ) : null}
      </header>
      {profil !== null ? (
        <div className="aa-parcours-accueil__fiche">
          {redigerFicheTechnique(analyserProfil(profil)).map((paragraphe, i) => (
            <section className="aa-parcours-accueil__rubrique" key={RUBRIQUES_FICHE[i]}>
              <h4 className="aa-parcours-accueil__rubrique-titre">{RUBRIQUES_FICHE[i]}</h4>
              <p>{paragraphe}</p>
            </section>
          ))}
        </div>
      ) : null}
      {profil !== null ? (
        // La vue du POC : chiffres, carte en relief, commandes et profil
        // coloré par pente. Elle remplace la fiche chiffrée ET l'ancien
        // profil, qui disaient la même chose en moins lisible.
        <VueParcours
          nom={epreuve.nom}
          profil={profil}
          slug={epreuve.slug}
          // Les métriques publiées d'abord ; à défaut, ce que le profil sait
          // lui-même (D+ et altitudes). Une vue avec profil ne retombe jamais
          // sur « sera publié » : la donnée est là.
          stats={{
            distanceKm: epreuve.distanceKm,
            denivelePositifM: epreuve.metriques?.denivelePositifM ?? profil.dplusM,
            deniveleNegatifM: epreuve.metriques?.deniveleNegatifM ?? null,
            altitudeMinM: epreuve.metriques?.altitudeMinM ?? profil.altitudeMinM,
            altitudeMaxM: epreuve.metriques?.altitudeMaxM ?? profil.altitudeMaxM,
          }}
          version={version}
        />
      ) : (
        <>
          <dl className="aa-parcours-accueil__synthese">
            {lignesSynthese(epreuve).map(([label, valeur]) => (
              <div className="aa-parcours-accueil__ligne" key={label}>
                <dt>{label}</dt>
                <dd>{valeur}</dd>
              </div>
            ))}
          </dl>
          <div className="aa-parcours-accueil__annonce">
            <svg
              aria-hidden="true"
              data-parcours-viz=""
              focusable="false"
              viewBox="0 0 120 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="120"
              height="24"
            >
              <path d="M0 20 L18 8 L30 14 L44 4 L60 13 L76 6 L90 15 L104 9 L120 20" />
            </svg>
            <p className="aa-parcours-accueil__viz-texte">
              La carte en relief et le profil altimétrique seront publiés avec le tracé
              officiel. En attendant, comparez les fiches et téléchargez les tracés GPX.
            </p>
          </div>
        </>
      )}
      {/* Servi SANS JavaScript : la mention fait partie du markup de base
          (décision produit 2026-11-04, texte en constante unique). */}
      {duReleve ? (
        <p className="aa-parcours-accueil__provisoire">{MENTION_TRACE_PROVISOIRE}</p>
      ) : null}
      {gpxUrl !== null ? (
        <a className="aa-lien-texte aa-parcours-accueil__gpx" href={gpxUrl} rel="noopener noreferrer">
          Télécharger le tracé GPX
        </a>
      ) : null}
      {points !== null && points.length > 0 ? (
        <div className="aa-parcours-accueil__passages">
          <h4 className="aa-parcours-accueil__passages-titre">Points de passage</h4>
          {/* Kilomètre rendu DANS le panneau de son épreuve : jamais orphelin
              de son référentiel (UX-DR-31), même sur la portion commune. */}
          <ul>
            {points.map((point) => (
              <li key={point.id}>
                <span className="aa-parcours-accueil__passage-nom">{point.nom}</span>
                {point.kilometre !== null ? (
                  <span className="aa-parcours-accueil__passage-km">km{NBSP}{formatKm.format(point.kilometre)}</span>
                ) : null}
                {point.altitudeM !== null ? (
                  <span className="aa-parcours-accueil__passage-km">{formatM.format(point.altitudeM)}{NBSP}m</span>
                ) : null}
                {point.services !== null && point.services.length > 0 ? (
                  <span className="aa-parcours-accueil__passage-services">{point.services.join(' · ')}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function SectionParcours({
  view,
  version = 0,
  entete,
  presentations,
  pied,
  sansLienDetail = false,
}: {
  view: SectionParcoursView;
  /** Version publiée du document : elle est dans l'URL du tracé servi à la carte. */
  version?: number;
  /** Surtitre, titre et chapeau de la section ; ceux par défaut sinon. */
  entete?: {
    id: string;
    surtitre: string;
    titre: string;
    chapeau: ReactNode;
    /** Titre de niveau 1 : la section est alors le sujet de la page. */
    h1?: boolean;
  };
  /** Accroche de chaque épreuve, par slug. */
  presentations?: Readonly<Record<string, PresentationEpreuve>>;
  /** Contenu sous le sélecteur (liens, galerie…). */
  pied?: ReactNode;
  /** Masque le lien vers la page Parcours quand la section est cette page. */
  sansLienDetail?: boolean;
}) {
  const { epreuves } = view;
  const idTitre = entete?.id ?? 'titre-parcours-accueil';
  const Titre = entete?.h1 === true ? 'h1' : 'h2';
  return (
    <section className="vitrine-bande aa-parcours-accueil" aria-labelledby={idTitre}>
      <div className="aa-section">
        <p className="aa-eyebrow">{entete?.surtitre ?? 'Les parcours'}</p>
        <Titre className="aa-h2" id={idTitre}>
          {entete?.titre ?? 'Comparer les deux trails'}
        </Titre>
        <p className="aa-lead">
          {entete?.chapeau ??
            'Choisissez une épreuve : la fiche affichée la suit entièrement, du kilométrage au tracé GPX.'}
        </p>
        {epreuves.length === 0 ? (
          <p className="aa-note">
            Les fiches des épreuves sont publiées sur la{' '}
            <Link className="aa-lien-texte" href="/parcours">
              page Parcours
            </Link>
            .
          </p>
        ) : (
          <>
            <fieldset className="aa-parcours-accueil__selecteur">
              <legend className="aa-parcours-accueil__legende">Épreuve affichée</legend>
              <div className="aa-parcours-accueil__choix">
                {epreuves.map((epreuve, rang) => (
                  <div key={epreuve.slug}>
                    <input
                      className="aa-parcours-accueil__radio"
                      data-bascule={rang}
                      defaultChecked={rang === 0}
                      id={`parcours-accueil-${epreuve.slug}`}
                      name="epreuve-parcours-accueil"
                      type="radio"
                      value={epreuve.slug}
                    />
                    <label
                      className="socle-action socle-action--contour aa-parcours-accueil__libelle"
                      data-libelle={rang}
                      htmlFor={`parcours-accueil-${epreuve.slug}`}
                    >
                      {nomCourt(epreuve.nom)}
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
            <style dangerouslySetInnerHTML={{ __html: reglesBascule(epreuves.length) }} />
            <div className="aa-parcours-accueil__panneaux">
              {epreuves.map((epreuve, rang) => (
                <PanneauEpreuve
                  epreuve={epreuve}
                  key={epreuve.slug}
                  presentation={presentations?.[epreuve.slug]}
                  rang={rang}
                  version={version}
                />
              ))}
            </div>
          </>
        )}
        {sansLienDetail ? null : (
          <p className="aa-liens-vitrine">
            <Link className="aa-lien-texte" href="/parcours">
              Voir le détail des parcours
            </Link>
          </p>
        )}
        {pied}
      </div>
    </section>
  );
}
