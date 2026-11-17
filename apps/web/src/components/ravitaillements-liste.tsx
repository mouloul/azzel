import type { CSSProperties } from 'react';

import { Crete } from '@/components/frise';
import {
  BOUCLE_MOYENNE_DISTANCE_KM,
  RAVITAILLEMENTS_CONSEILS,
  RAVITAILLEMENTS_DISTANCE_KM,
  RAVITAILLEMENTS_INTRO,
  RAVITAILLEMENTS_NOTE,
  RAVITAILLEMENTS_POINTS,
  RAVITAILLEMENTS_POINTS_BOUCLE_MOYENNE,
} from '@/components/ravitaillements-parcours';

const NBSP = ' ';
const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatM = new Intl.NumberFormat('fr-FR');

function km(valeur: number): string {
  return `${formatKm.format(valeur)}${NBSP}km`;
}

/** Plus long tronçon sans ravitaillement, arrivée comprise. */
export function plusLongEcartKm(bornes: readonly number[], distanceKm: number): number {
  const jalons = [0, ...bornes, distanceKm];
  return Math.max(...jalons.slice(1).map((borne, i) => borne - (jalons[i] ?? 0)));
}

/** Ligne de course d'une épreuve : ses postes placés à leur kilomètre. */
function LigneEpreuve({
  bornes,
  distanceKm,
  titre,
}: {
  bornes: readonly number[];
  distanceKm: number;
  titre: string;
}) {
  return (
    <div className="aa-ravitos__ligne">
      <dl className="aa-ravitos__stats">
        <div className="aa-ravitos__stat">
          <dt>Épreuve</dt>
          <dd>{titre}</dd>
        </div>
        <div className="aa-ravitos__stat">
          <dt>Points</dt>
          <dd>{bornes.length}</dd>
        </div>
        <div className="aa-ravitos__stat">
          <dt>Plus long tronçon sans ravitaillement</dt>
          <dd>{km(plusLongEcartKm(bornes, distanceKm))}</dd>
        </div>
        <div className="aa-ravitos__stat">
          <dt>Distance</dt>
          <dd>{km(distanceKm)}</dd>
        </div>
      </dl>
      <ol
        className="aa-ravitos__piste"
        aria-label={`Position des ravitaillements sur le parcours — ${titre}`}
      >
        <li
          className="aa-ravitos__borne aa-ravitos__borne--depart"
          style={{ '--pos': '0%' } as CSSProperties}
        >
          <span className="aa-ravitos__borne-km">Départ</span>
        </li>
        {bornes.map((borne) => (
          <li
            className="aa-ravitos__borne"
            key={borne}
            style={{ '--pos': `${(borne / distanceKm) * 100}%` } as CSSProperties}
          >
            <span className="aa-ravitos__borne-km">{`Km ${formatKm.format(borne)}`}</span>
          </li>
        ))}
        <li
          className="aa-ravitos__borne aa-ravitos__borne--arrivee"
          style={{ '--pos': '100%' } as CSSProperties}
        >
          <span className="aa-ravitos__borne-km">Arrivée</span>
        </li>
      </ol>
    </div>
  );
}

/**
 * Pied de /parcours : les points de ravitaillement. Mêmes codes que la fiche
 * épreuve — bandeau forêt pour la ligne de course (tokens du lecteur de
 * parcours), cartes socle, rubriques en capitales accent.
 *
 * Retour comité 2027 : une ligne de course par épreuve, et chaque poste dit
 * s'il sert aussi la Boucle Moyenne, à quel kilomètre de CELLE-CI. Tous les
 * chiffres viennent de `parcours.json` (voir ravitaillements-parcours).
 */
export function RavitaillementsListe() {
  // Sans relevé publié, la section n'a aucun chiffre à montrer : elle s'efface
  // plutôt que d'afficher une ligne de course vide.
  if (RAVITAILLEMENTS_DISTANCE_KM === null || RAVITAILLEMENTS_POINTS.length === 0) {
    return null;
  }
  const bornesLongue = RAVITAILLEMENTS_POINTS.map((point) => point.kilometre);
  const bornesMoyenne = RAVITAILLEMENTS_POINTS.flatMap((point) =>
    point.kilometreBoucleMoyenne === null ? [] : [point.kilometreBoucleMoyenne],
  );
  return (
    <section className="aa-ravitos" aria-labelledby="titre-ravitaillements">
      <p className="aa-eyebrow">Ravitaillements</p>
      <h2 className="aa-h2" id="titre-ravitaillements">
        Où boire, où manger
      </h2>
      <Crete />
      <p className="aa-lead">{RAVITAILLEMENTS_INTRO}</p>

      <LigneEpreuve
        bornes={bornesLongue}
        distanceKm={RAVITAILLEMENTS_DISTANCE_KM}
        titre="La Grande Boucle"
      />
      {BOUCLE_MOYENNE_DISTANCE_KM !== null && bornesMoyenne.length > 0 ? (
        <LigneEpreuve
          bornes={bornesMoyenne}
          distanceKm={BOUCLE_MOYENNE_DISTANCE_KM}
          titre="La Boucle Moyenne"
        />
      ) : null}

      <ol className="aa-ravitos__liste">
        {RAVITAILLEMENTS_POINTS.map((point) => (
          <li className="socle-carte aa-ravito" key={point.id}>
            <header className="aa-ravito__tete">
              <p className="aa-ravito__surtitre">
                <span className="aa-chip aa-chip--phare">{`Km ${formatKm.format(point.kilometre)}`}</span>
                {/* Un poste partagé porte les DEUX kilomètres : un coureur de
                    la Boucle Moyenne ne cherche pas son repère au km 26. */}
                {point.kilometreBoucleMoyenne !== null ? (
                  <span className="aa-chip aa-chip--partage">
                    {`Boucle Moyenne · km ${formatKm.format(point.kilometreBoucleMoyenne)}`}
                  </span>
                ) : (
                  <span className="aa-ravito__seule">Grande Boucle seulement</span>
                )}
              </p>
              <h3 className="aa-ravito__titre">{point.nom}</h3>
              <dl className="aa-ravito__stats">
                <div>
                  <dt>Altitude</dt>
                  <dd>{`${formatM.format(point.altitudeM)} m`}</dd>
                </div>
                <div>
                  <dt>D+ depuis le point précédent</dt>
                  <dd>{`+${formatM.format(point.dplusDepuisPrecedentM)} m`}</dd>
                </div>
              </dl>
            </header>
            <p className="aa-ravito__texte">{point.detail}</p>
            <section className="aa-ravito__rubrique">
              <h4 className="aa-ravito__rubrique-titre">Au menu</h4>
              <ul className="aa-ravito__services">
                {point.services.map((service) => (
                  <li className="socle-chip" key={service}>
                    {service}
                  </li>
                ))}
              </ul>
            </section>
            <section className="aa-ravito__rubrique aa-ravito__rubrique--conseil">
              <h4 className="aa-ravito__rubrique-titre">Conseil</h4>
              <p className="aa-ravito__texte">{point.conseil}</p>
            </section>
          </li>
        ))}
      </ol>

      <section className="socle-carte aa-ravitos__sante" aria-labelledby="titre-ravitos-sante">
        <h3 className="aa-ravito__rubrique-titre" id="titre-ravitos-sante">
          {`Boire et manger sur ${km(RAVITAILLEMENTS_DISTANCE_KM)}`}
        </h3>
        <p className="aa-ravito__texte">
          {`Sur la Boucle Moyenne, ${
            RAVITAILLEMENTS_POINTS_BOUCLE_MOYENNE === 1 ? 'un seul poste' : 'deux postes'
          } : les mêmes conseils valent, sur une distance plus courte.`}
        </p>
        <ul className="aa-ravitos__conseils">
          {RAVITAILLEMENTS_CONSEILS.map((conseil) => (
            <li key={conseil}>{conseil}</li>
          ))}
        </ul>
      </section>
      <p className="aa-note">{RAVITAILLEMENTS_NOTE}</p>
    </section>
  );
}
