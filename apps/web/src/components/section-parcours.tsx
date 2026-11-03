import Link from 'next/link';

import { isHttpsUrl } from '@/modules/contenus/domain';
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
 * cibles (≥ 44 px via .socle-action). La visualisation (carte 3D + profil)
 * relève de l’épopée 11 : son emplacement est annoncé, jamais vide.
 *
 * Champs disponibles seuls (règle « aucun chiffre inventé ») : nom, distance,
 * lien GPX. Métriques et points de passage ne sont rendus QUE s’ils sont
 * fournis non nuls par le contrat — la story 11.1 branche `parcours.json`
 * côté données, ce rendu ne change pas.
 *
 * `@supports not selector(:has(*))` (globals.css) empile les panneaux : sur
 * un navigateur sans :has(), la section reste lisible, simplement non pliée. */

const NBSP = '\u202f';

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

/** Règles de bascule générées par épreuve (clé = rang, pas le slug : rien à échapper). */
function reglesBascule(nombre: number): string {
  return Array.from({ length: nombre }, (_, i) =>
    `.aa-parcours-accueil:has([data-bascule="${i}"]:checked) [data-panneau="${i}"]{display:block}` +
    `.aa-parcours-accueil:has([data-bascule="${i}"]:checked) [data-libelle="${i}"]{background:var(--az-action);border-color:transparent;color:var(--az-action-texte)}`,
  ).join('');
}

function PanneauEpreuve({ epreuve, rang }: { epreuve: EpreuveSectionParcours; rang: number }) {
  // Garde de rendu (défense en profondeur, même garde que /parcours) : une URL
  // non https échappée en base ne devient jamais un href.
  const gpxUrl =
    epreuve.gpxUrl !== null && isHttpsUrl(epreuve.gpxUrl) ? epreuve.gpxUrl : null;
  const points = epreuve.pointsDePassage;
  return (
    <article className="socle-carte aa-parcours-accueil__panneau" data-panneau={rang}>
      <h3 className="aa-card__title">{epreuve.nom}</h3>
      <dl className="aa-parcours-accueil__synthese">
        {lignesSynthese(epreuve).map(([label, valeur]) => (
          <div className="aa-parcours-accueil__ligne" key={label}>
            <dt>{label}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>
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

export function SectionParcours({ view }: { view: SectionParcoursView }) {
  const { epreuves } = view;
  return (
    <section className="vitrine-bande aa-parcours-accueil" aria-labelledby="titre-parcours-accueil">
      <div className="aa-section">
        <p className="aa-eyebrow">Les parcours</p>
        <h2 className="aa-h2" id="titre-parcours-accueil">
          Comparer les deux trails
        </h2>
        <p className="aa-lead">
          Choisissez une épreuve : la fiche affichée la suit entièrement, du
          kilométrage au tracé GPX.
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
                  <div className="aa-parcours-accueil__bascule" key={epreuve.slug}>
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
                <PanneauEpreuve epreuve={epreuve} key={epreuve.slug} rang={rang} />
              ))}
            </div>
            <aside className="aa-parcours-accueil__viz" aria-labelledby="titre-viz-parcours">
              {/* Annonce de la visualisation (épopée 11) : un bloc utile
                  aujourd’hui, jamais un cadre vide ni une erreur. */}
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
              <p className="aa-parcours-accueil__viz-surtitre">Visualisation</p>
              <h3 className="aa-parcours-accueil__viz-titre" id="titre-viz-parcours">
                Le relief de chaque épreuve, prochainement ici
              </h3>
              <p className="aa-parcours-accueil__viz-texte">
                La carte en relief et le profil altimétrique seront publiés avec
                le tracé officiel. En attendant, comparez les fiches ci-dessus et
                téléchargez les tracés GPX.
              </p>
            </aside>
          </>
        )}
        <p className="aa-liens-vitrine">
          <Link className="aa-lien-texte" href="/parcours">
            Voir le détail des parcours
          </Link>
        </p>
      </div>
    </section>
  );
}
