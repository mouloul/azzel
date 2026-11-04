'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  avecLectureAutomatiqueMuette,
  avecLectureImmediate,
  type TrailerPlayer,
} from '@/modules/retour-images/domain';

/** Part visible à partir de laquelle le teaser se lance tout seul. */
const SEUIL_VISIBILITE = 0.5;

function mouvementReduit(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Bloc trailer public : poster dégradé forêt en pur CSS (zéro octet d'image) +
 * pastille de lecture. Le lecteur (natif <video> ou iframe selon l'URL) n'est
 * monté qu'AU CLIC : rien n'est chargé avant, jamais d'autoplay au chargement
 * de page, jamais de son sans geste. Au CONTRAIRE du chargement, la lecture
 * elle-même démarre dès le premier clic (geste de l'utilisateur) : autoplay=1
 * sur l'embed monté, play() après montage pour la vidéo native.
 *
 * `auto` (teaser de l'accueil) ouvre une seconde porte : le lecteur se monte
 * aussi quand le bloc arrive à l'écran, et démarre alors SANS LE SON. Le
 * chargement reste différé — rien ne part tant qu'on n'a pas scrollé jusque-là.
 * Respecte « mouvement réduit » : dans ce cas, le poster attend le clic.
 */
export function TrailerBloc({
  player,
  auto = false,
}: {
  player: TrailerPlayer;
  auto?: boolean;
}) {
  const [lance, setLance] = useState(false);
  const [muet, setMuet] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blocRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lance && player.kind === 'video') {
      videoRef.current?.play().catch(() => {
      });
    }
  }, [lance, player.kind]);

  useEffect(() => {
    const bloc = blocRef.current;
    if (!auto || lance || bloc === null || mouvementReduit()) {
      return;
    }
    // Pas d'IntersectionObserver (vieux navigateur) : on garde le poster,
    // le clic reste le chemin normal.
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observateur = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((entree) => entree.isIntersecting)) {
          observateur.disconnect();
          setMuet(true);
          setLance(true);
        }
      },
      { threshold: SEUIL_VISIBILITE },
    );
    observateur.observe(bloc);
    return () => observateur.disconnect();
  }, [auto, lance]);

  const lancerAuClic = useCallback(() => {
    setMuet(false);
    setLance(true);
  }, []);

  if (lance) {
    return (
      <div className="aa-trailer" ref={blocRef}>
        {player.kind === 'iframe' ? (
          <iframe
            className="aa-trailer__lecteur"
            src={
              muet
                ? avecLectureAutomatiqueMuette(player.url)
                : avecLectureImmediate(player.url)
            }
            title="Vidéo du trailer — première édition du Week-end Sportif Aït Aïssi"
            allow="fullscreen; picture-in-picture; encrypted-media; autoplay"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video
            ref={videoRef}
            className="aa-trailer__lecteur"
            controls
            muted={muet}
            playsInline
            preload="none"
            src={player.url}
          >
            La vidéo de l’édition 2026 n’a pas pu se charger. Retrouvez-la sur le
            site du Week-end Sportif Aït Aïssi.
          </video>
        )}
        {muet ? (
          <p className="aa-note">
            La vidéo démarre sans le son : activez-le avec les commandes du lecteur.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="aa-trailer" ref={blocRef}>
      <button
        type="button"
        className="aa-trailer__poster"
        onClick={lancerAuClic}
      >
        <span className="aa-trailer__play" aria-hidden="true">
          <svg width="26" height="30" viewBox="0 0 26 30" fill="none" role="presentation">
            <path d="M24.5 13.6C25.9 14.5 25.9 16.5 24.5 17.4L3.4 30.1C1.9 31 -1.7e-07 29.9 0 28.2L0 2.8C-1.7e-07 1.1 1.9 -0.03 3.4 0.9L24.5 13.6Z" fill="currentColor" />
          </svg>
        </span>
        <span className="aa-trailer__libelle">Voir la vidéo de l’édition 2026</span>
      </button>
      {/* Lancement automatique : le poster ne reste affiché qu'un instant, une
          mention sous lui n'aurait pas le temps d'être lue. La page qui attend
          le clic, elle, garde sa promesse écrite. */}
      {auto ? null : (
        <p className="aa-note">
          La vidéo se charge uniquement quand vous cliquez : rien n’est téléchargé
          avant.
        </p>
      )}
    </div>
  );
}
