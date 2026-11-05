import type { CSSProperties } from 'react';

import { Crete } from '@/components/frise';
import {
  RAVITAILLEMENTS_CONSEILS,
  RAVITAILLEMENTS_DISTANCE_KM,
  RAVITAILLEMENTS_INTRO,
  RAVITAILLEMENTS_NOTE,
  RAVITAILLEMENTS_POINTS,
} from '@/components/ravitaillements-parcours';

/** Plus long tronçon sans ravitaillement, arrivée comprise. */
function plusLongEcartKm(): number {
  const bornes = [0, ...RAVITAILLEMENTS_POINTS.map((p) => p.kilometre), RAVITAILLEMENTS_DISTANCE_KM];
  return Math.max(...bornes.slice(1).map((km, i) => km - (bornes[i] ?? 0)));
}

/**
 * Pied de /parcours : les points de ravitaillement du Grand Trail. Mêmes codes
 * que la fiche épreuve — bandeau forêt pour la ligne de course (tokens du
 * lecteur de parcours), cartes socle, rubriques en capitales accent.
 */
export function RavitaillementsListe() {
  return (
    <section className="aa-ravitos" aria-labelledby="titre-ravitaillements">
      <p className="aa-eyebrow">Ravitaillements</p>
      <h2 className="aa-h2" id="titre-ravitaillements">
        Où boire, où manger
      </h2>
      <Crete />
      <p className="aa-lead">{RAVITAILLEMENTS_INTRO}</p>

      <div className="aa-ravitos__ligne">
        <dl className="aa-ravitos__stats">
          <div className="aa-ravitos__stat">
            <dt>Points</dt>
            <dd>{RAVITAILLEMENTS_POINTS.length}</dd>
          </div>
          <div className="aa-ravitos__stat">
            <dt>Plus long tronçon sans ravitaillement</dt>
            <dd>{`${plusLongEcartKm()} km`}</dd>
          </div>
          <div className="aa-ravitos__stat">
            <dt>Distance</dt>
            <dd>{`${RAVITAILLEMENTS_DISTANCE_KM} km`}</dd>
          </div>
        </dl>
        <ol className="aa-ravitos__piste" aria-label="Position des ravitaillements sur le parcours">
          <li className="aa-ravitos__borne aa-ravitos__borne--depart" style={{ '--pos': '0%' } as CSSProperties}>
            <span className="aa-ravitos__borne-km">Départ</span>
          </li>
          {RAVITAILLEMENTS_POINTS.map((point) => (
            <li
              className="aa-ravitos__borne"
              key={point.kilometre}
              style={{ '--pos': `${(point.kilometre / RAVITAILLEMENTS_DISTANCE_KM) * 100}%` } as CSSProperties}
            >
              <span className="aa-ravitos__borne-km">{`Km ${point.kilometre}`}</span>
            </li>
          ))}
          <li className="aa-ravitos__borne aa-ravitos__borne--arrivee" style={{ '--pos': '100%' } as CSSProperties}>
            <span className="aa-ravitos__borne-km">Arrivée</span>
          </li>
        </ol>
      </div>

      <ol className="aa-ravitos__liste">
        {RAVITAILLEMENTS_POINTS.map((point) => (
          <li className="socle-carte aa-ravito" key={point.kilometre}>
            <header className="aa-ravito__tete">
              <p className="aa-ravito__surtitre">
                <span className="aa-chip aa-chip--phare">{`Km ${point.kilometre}`}</span>
              </p>
              <h3 className="aa-ravito__titre">{point.nom}</h3>
              <dl className="aa-ravito__stats">
                <div>
                  <dt>Altitude</dt>
                  <dd>{`${point.altitudeM} m`}</dd>
                </div>
                <div>
                  <dt>D+ depuis le point précédent</dt>
                  <dd>{`+${point.dplusDepuisPrecedentM} m`}</dd>
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
          {`Boire et manger sur ${RAVITAILLEMENTS_DISTANCE_KM} km`}
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
