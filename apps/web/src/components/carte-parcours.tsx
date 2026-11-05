'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { EXAGERATION, webglDisponible } from '@/modules/contenus/parcours/carte';
import { chargerTrace } from '@/modules/contenus/parcours/trace-client';
import { ATTRIBUTION_COURTE, attributions } from '@/modules/contenus/parcours/fonds-carte';
import { couleursDuTheme } from '@/components/carte-couleurs';
import { EVENEMENT_CURSEUR } from '@/components/profil-curseur';
import type { PiloteCarte } from '@/components/carte-maplibre';

/* Story 11.3 — carte 3D du parcours (île cliente).
 *
 * Rien ne charge tant que l'utilisateur n'a pas cliqué : le moteur MapLibre
 * et les tuiles arrivent par `await import()` dans le gestionnaire du bouton.
 * Le bloc parcours textuel de la story 9.3 reste la source d'information ;
 * la carte est un supplément (NFR-13, UX-DR-30).
 *
 * Quand la carte ne peut pas s'afficher — pas de WebGL, tuiles injoignables,
 * JavaScript coupé — on le DIT. Jamais de cadre vide.
 */

type Etat = 'repos' | 'chargement' | 'ouverte' | 'indisponible';

export function CarteParcours({
  nomEpreuve,
  slug,
  version,
}: {
  nomEpreuve: string;
  /** Épreuve dont le tracé est réclamé à l'ouverture. */
  slug: string;
  /** Version publiée du document : elle est dans l'URL, donc dans le cache. */
  version: number;
}) {
  const [etat, setEtat] = useState<Etat>('repos');
  const [message, setMessage] = useState<string | null>(null);
  const [relief3d, setRelief3d] = useState(true);
  const [exageration, setExageration] = useState<number>(EXAGERATION.defaut);
  const conteneurRef = useRef<HTMLDivElement | null>(null);
  const piloteRef = useRef<PiloteCarte | null>(null);
  const idExageration = useId();

  const ouvrir = useCallback(async () => {
    const conteneur = conteneurRef.current;
    if (conteneur === null || piloteRef.current !== null) return;

    if (!webglDisponible(() => document.createElement('canvas'))) {
      setEtat('indisponible');
      setMessage(
        'Ce navigateur n’affiche pas de carte en relief (WebGL indisponible). Le détail du parcours reste donné ci-dessus, en texte et en profil.',
      );
      return;
    }

    setEtat('chargement');
    try {
      // Le tracé n'est PAS dans le HTML de la page : il serait parti à chaque
      // visite, carte ouverte ou non (993 points, ~30 Ko). Il est réclamé ici,
      // avec le moteur, au clic.
      const [{ trace, reperes }, { ouvrirCarte }] = await Promise.all([
        chargerTrace(slug, version),
        import('@/components/carte-maplibre'),
      ]);
      const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      piloteRef.current = await ouvrirCarte({
        conteneur,
        trace,
        couleurs: couleursDuTheme(),
        reperes,
        mouvementReduit,
      });
      setEtat('ouverte');
    } catch {
      setEtat('indisponible');
      setMessage(
        'La carte n’a pas pu se charger — fond de carte injoignable ou connexion interrompue. Le détail du parcours reste donné ci-dessus.',
      );
    }
  }, [slug, version]);

  // Bus de l'épopée 11 : le curseur du profil (story 11.4) déplace le repère
  // de la carte. L'écoute ne s'installe qu'une fois la carte ouverte, et
  // aucun événement n'est émis au montage — le repère reste donc absent tant
  // que personne n'a touché au profil.
  useEffect(() => {
    if (etat !== 'ouverte') return undefined;
    const suivre = (evenement: Event) => {
      const detail = (evenement as CustomEvent<{ sM?: number }>).detail;
      if (typeof detail?.sM === 'number') piloteRef.current?.placerCurseur(detail.sM);
    };
    document.addEventListener(EVENEMENT_CURSEUR, suivre);
    return () => document.removeEventListener(EVENEMENT_CURSEUR, suivre);
  }, [etat]);

  useEffect(
    () => () => {
      piloteRef.current?.detruire();
      piloteRef.current = null;
    },
    [],
  );

  const basculerRelief = useCallback(() => {
    const actif = !relief3d;
    setRelief3d(actif);
    piloteRef.current?.definirRelief(actif, exageration);
  }, [exageration, relief3d]);

  const changerExageration = useCallback((valeur: number) => {
    setExageration(valeur);
    piloteRef.current?.definirExageration(valeur);
  }, []);

  return (
    <section className="aa-carte" aria-labelledby="titre-carte-parcours">
      <p className="aa-eyebrow">Visualisation</p>
      <h3 className="aa-h3" id="titre-carte-parcours">
        Le relief en trois dimensions
      </h3>

      {etat === 'repos' ? (
        <>
          <p className="aa-carte__annonce">
            La carte du relief se charge à la demande : elle pèse lourd, et tout ce
            qu’elle montre est déjà écrit ci-dessus.
          </p>
          <button className="socle-action" onClick={ouvrir} type="button">
            Afficher la carte du relief
          </button>
        </>
      ) : null}

      {etat === 'chargement' ? (
        <p className="aa-carte__annonce" role="status">
          Chargement de la carte de {nomEpreuve}…
        </p>
      ) : null}

      {etat === 'indisponible' ? (
        <p className="aa-carte__indisponible" role="status">
          {message}
        </p>
      ) : null}

      {/* Le conteneur existe dès le départ : MapLibre a besoin d'un élément
          déjà dans le document, et sa hauteur est fixée par le CSS pour que
          l'ouverture ne fasse pas sauter la page. */}
      <div
        className={`aa-carte__cadre${etat === 'ouverte' ? ' aa-carte__cadre--ouverte' : ''}`}
        hidden={etat !== 'ouverte' && etat !== 'chargement'}
      >
        <div className="aa-carte__toile" ref={conteneurRef} />
      </div>

      {etat === 'ouverte' ? (
        <>
          <div className="aa-carte__controles">
            <button
              aria-pressed={relief3d}
              className="socle-chip aa-carte__chip"
              onClick={basculerRelief}
              type="button"
            >
              Relief 3D
            </button>
            <label className="aa-carte__reglage" htmlFor={idExageration}>
              <span>Accentuer le relief</span>
              <input
                aria-valuetext={`${exageration.toFixed(1)} fois`}
                id={idExageration}
                max={EXAGERATION.max}
                min={EXAGERATION.min}
                onChange={(evenement) => changerExageration(Number(evenement.target.value))}
                step={EXAGERATION.pas}
                type="range"
                value={exageration}
              />
              <output htmlFor={idExageration}>{exageration.toFixed(1)}×</output>
            </label>
          </div>
          <p className="aa-carte__mode-emploi">
            Glisser pour pivoter, deux doigts pour incliner, les boutons + et − pour
            zoomer. Le relief est accentué {exageration.toFixed(1)} fois ; à 1, il est
            à l’échelle réelle.
          </p>
          {/* FR-32 : attributions visibles en permanence, hors du canvas pour
              ne jamais recouvrir la carte ni être recouvertes. */}
          <ul className="aa-carte__attributions">
            {attributions().map((texte) => (
              <li key={texte}>{texte}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="aa-carte__attributions aa-carte__attributions--courte">
          {ATTRIBUTION_COURTE}
        </p>
      )}
    </section>
  );
}
