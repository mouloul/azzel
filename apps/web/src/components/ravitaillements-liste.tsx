import type { CSSProperties } from 'react';

import { Crete } from '@/components/frise';
import {
  type EpreuveRavitaillements,
  RAVITAILLEMENTS_CONSEILS,
  RAVITAILLEMENTS_EPREUVES,
  RAVITAILLEMENTS_INTRO,
  RAVITAILLEMENTS_NOTE,
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
function LigneEpreuve({ epreuve }: { epreuve: EpreuveRavitaillements }) {
  const bornes = epreuve.points.map((point) => point.kilometre);
  return (
    <div className="aa-ravitos__ligne">
      <dl className="aa-ravitos__stats">
        <div className="aa-ravitos__stat">
          <dt>Points</dt>
          <dd>{bornes.length}</dd>
        </div>
        <div className="aa-ravitos__stat">
          <dt>Plus long tronçon sans ravitaillement</dt>
          <dd>{km(plusLongEcartKm(bornes, epreuve.distanceKm))}</dd>
        </div>
        <div className="aa-ravitos__stat">
          <dt>Distance</dt>
          <dd>{km(epreuve.distanceKm)}</dd>
        </div>
      </dl>
      <ol
        className="aa-ravitos__piste"
        aria-label={`Position des ravitaillements sur le parcours — ${epreuve.nom}`}
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
            style={{ '--pos': `${(borne / epreuve.distanceKm) * 100}%` } as CSSProperties}
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

/** Fiches des postes d'une épreuve, précédées de sa ligne de course. */
function PostesEpreuve({ epreuve }: { epreuve: EpreuveRavitaillements }) {
  const idTitre = `titre-ravitos-${epreuve.slug}`;
  return (
    <section className="aa-ravitos__epreuve" aria-labelledby={idTitre}>
      <h3 className="aa-ravitos__epreuve-titre" id={idTitre}>
        {epreuve.nom}
      </h3>
      <LigneEpreuve epreuve={epreuve} />
      <ol className="aa-ravitos__liste">
        {epreuve.points.map((point) => (
          <li className="socle-carte aa-ravito" key={point.id}>
            <header className="aa-ravito__tete">
              <p className="aa-ravito__surtitre">
                <span className="aa-chip aa-chip--phare">{`Km ${formatKm.format(point.kilometre)}`}</span>
              </p>
              <h4 className="aa-ravito__titre">{point.nom}</h4>
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
              <h5 className="aa-ravito__rubrique-titre">Au menu</h5>
              <ul className="aa-ravito__services">
                {point.services.map((service) => (
                  <li className="socle-chip" key={service}>
                    {service}
                  </li>
                ))}
              </ul>
            </section>
            <section className="aa-ravito__rubrique aa-ravito__rubrique--conseil">
              <h5 className="aa-ravito__rubrique-titre">Conseil</h5>
              <p className="aa-ravito__texte">{point.conseil}</p>
            </section>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Pied de /parcours : les points de ravitaillement. Mêmes codes que la fiche
 * épreuve — bandeau forêt pour la ligne de course (tokens du lecteur de
 * parcours), cartes socle, rubriques en capitales accent.
 *
 * Retour comité 2027 : un bloc par épreuve (ligne de course puis fiches),
 * chacune avec SES postes à SON kilométrage. Tous les chiffres viennent de
 * `parcours.json` (voir ravitaillements-parcours).
 */
export function RavitaillementsListe() {
  // Sans relevé publié, la section n'a aucun chiffre à montrer : elle s'efface
  // plutôt que d'afficher une ligne de course vide.
  if (RAVITAILLEMENTS_EPREUVES.length === 0) {
    return null;
  }
  return (
    <section className="aa-ravitos" aria-labelledby="titre-ravitaillements">
      <p className="aa-eyebrow">Ravitaillements</p>
      <h2 className="aa-h2" id="titre-ravitaillements">
        Où boire, où manger
      </h2>
      <Crete />
      <p className="aa-lead">{RAVITAILLEMENTS_INTRO}</p>

      {RAVITAILLEMENTS_EPREUVES.map((epreuve) => (
        <PostesEpreuve epreuve={epreuve} key={epreuve.slug} />
      ))}

      <section className="socle-carte aa-ravitos__sante" aria-labelledby="titre-ravitos-sante">
        <h3 className="aa-ravito__rubrique-titre" id="titre-ravitos-sante">
          Boire et manger en course
        </h3>
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
