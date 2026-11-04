'use client';

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  LIBELLES_PALIERS,
  PAS_CURSEUR_M,
  deplacerCurseur,
  lecturePendantDeplacement,
  palierDePente,
  pointLePlusProche,
  sMDepuisFraction,
  sensPente,
  xCurseurPourcent,
  type PointProfil,
} from '@/modules/contenus/parcours/profil';

/* Story 11.4 — curseur de lecture du profil (pointeur ET clavier, UX-DR-27).
 *
 * Overlay absolu sur le SVG servi : la position se calcule dans la géométrie
 * partagée du module pur profil.ts (mêmes échelles que le serveur, positions
 * en % de la largeur rendue — aucun recalcul de layout).
 *
 * Aucune information ne dépend du survol : la lecture (kilomètre, altitude,
 * pente signée + palier en toutes lettres) est un texte VISIBLE ; l’annonce
 * au lecteur d’écran passe par aria-valuetext du slider (mécanisme natif) —
 * PAS de aria-live sur le paragraphe visible, qui doublerait l’annonce à
 * chaque flèche. La SOURIS lit au simple déplacement sans clic, le
 * tactile/stylet à l’appui puis au glissé (décision pure
 * `lecturePendantDeplacement`) ; le curseur est focusable role="slider"
 * (flèches ± 100 m, Début/Fin aux bornes).
 *
 * Contrat pour la story 11.5 (curseur partagé carte ↔ profil) : chaque
 * déplacement issu d’une INTERACTION (pointeur ou clavier) émet sur
 * `document` le CustomEvent « az-parcours-curseur » avec detail
 * { epreuve: string, sM: number } — l’abscisse curviligne de CETTE épreuve,
 * le bus d’état unique de l’épopée 11. L’événement n’est JAMAIS émis au
 * montage : sans interaction, la 11.5 ne doit pas déplacer le repère de la
 * carte au chargement. Ce curseur local n’écoute personne : la
 * synchronisation revient à la 11.5. */

const NBSP = '\u202f';

const formatKm = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatM = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const formatPct = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'always',
});

/** Nom de l’événement documenté — constante partagée, pas une chaîne perdue. */
export const EVENEMENT_CURSEUR = 'az-parcours-curseur';

/** Texte de lecture complet (visible ET aria-valuetext du slider). */
export function texteLecture(epreuve: string, point: PointProfil): string {
  const sens = sensPente(point.pentePct);
  const pente =
    sens === 'plat'
      ? 'plat'
      : `${sens} ${formatPct.format(point.pentePct)}${NBSP}%`;
  return (
    `km${NBSP}${formatKm.format(point.sM / 1000)} · ${formatM.format(point.altitudeM)}${NBSP}m · ` +
    `${pente} — ${LIBELLES_PALIERS[palierDePente(point.pentePct)].toLowerCase()}`
  );
}

export function ProfilCurseur({
  epreuve,
  points,
  distanceM,
}: {
  epreuve: string;
  points: readonly PointProfil[];
  distanceM: number;
}) {
  const [sM, setSM] = useState(0);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const saisieRef = useRef(false);
  const point = pointLePlusProche(points, sM);

  // Bus d’état de l’épopée 11 : `s` émis pour la 11.5 (voir bloc-note
  // ci-dessus) UNIQUEMENT depuis un gestionnaire d’interaction — jamais au
  // montage : sans useEffect, aucun événement ne part sans geste humain.
  const deplacerA = useCallback(
    (nouveauSM: number) => {
      setSM(nouveauSM);
      document.dispatchEvent(
        new CustomEvent(EVENEMENT_CURSEUR, { detail: { epreuve, sM: nouveauSM } }),
      );
    },
    [epreuve],
  );

  const deplacerDepuisPointeur = useCallback(
    (clientX: number) => {
      const zone = zoneRef.current;
      if (zone === null) return;
      const rect = zone.getBoundingClientRect();
      if (rect.width <= 0) return;
      deplacerA(sMDepuisFraction((clientX - rect.left) / rect.width, distanceM));
    },
    [deplacerA, distanceM],
  );

  const surTouche = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const grand = event.shiftKey ? 10 : 1;
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          deplacerA(deplacerCurseur(sM, distanceM, -PAS_CURSEUR_M * grand));
          event.preventDefault();
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          deplacerA(deplacerCurseur(sM, distanceM, PAS_CURSEUR_M * grand));
          event.preventDefault();
          break;
        case 'Home':
          deplacerA(0);
          event.preventDefault();
          break;
        case 'End':
          deplacerA(distanceM);
          event.preventDefault();
          break;
        default:
          break;
      }
    },
    [deplacerA, distanceM, sM],
  );

  const surPointeurBas = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      saisieRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      deplacerDepuisPointeur(event.clientX);
    },
    [deplacerDepuisPointeur],
  );

  const surPointeurDeplace = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // AC 11.4 : la souris lit au SURVOL (sans appui) ; le tactile/stylet
      // exige l’appui — décision pure testée dans profil.test.ts.
      if (lecturePendantDeplacement(event.pointerType, saisieRef.current)) {
        deplacerDepuisPointeur(event.clientX);
      }
    },
    [deplacerDepuisPointeur],
  );

  const finSaisie = useCallback(() => {
    saisieRef.current = false;
  }, []);

  if (point === null) {
    return null;
  }

  return (
    <>
      <div
        className="aa-profil__interaction"
        aria-label="Curseur de lecture du profil altimétrique"
        aria-orientation="horizontal"
        aria-valuemax={distanceM}
        aria-valuemin={0}
        aria-valuenow={sM}
        aria-valuetext={texteLecture(epreuve, point)}
        onPointerDown={surPointeurBas}
        onPointerMove={surPointeurDeplace}
        onPointerUp={finSaisie}
        onPointerCancel={finSaisie}
        onLostPointerCapture={finSaisie}
        onKeyDown={surTouche}
        ref={zoneRef}
        role="slider"
        tabIndex={0}
      >
        <span
          aria-hidden="true"
          className="aa-profil__ligne"
          style={{ left: `${xCurseurPourcent(sM, distanceM)}%` }}
        />
      </div>
      {/* Lecture VISIBLE ; l’annonce lecteur d’écran est portée par
          aria-valuetext du slider ci-dessus — pas de aria-live ici, qui
          doublerait chaque annonce (retour de revue 2026-11-04). */}
      <p className="aa-profil__lecture">
        {texteLecture(epreuve, point)}
      </p>
    </>
  );
}
