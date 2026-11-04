'use client';

import { useEffect, useRef, useState } from 'react';

import { avecLectureImmediate, type TrailerPlayer } from '@/modules/retour-images/domain';

/**
 * Bloc trailer public : poster dégradé forêt en pur CSS (zéro octet d'image) +
 * pastille de lecture. Le lecteur (natif <video> ou iframe selon l'URL) n'est
 * monté qu'AU CLIC : rien n'est chargé avant, jamais d'autoplay au chargement
 * de page, jamais de son sans geste. Au CONTRAIRE du chargement, la lecture
 * elle-même démarre dès le premier clic (geste de l'utilisateur) : autoplay=1
 * sur l'embed monté, play() après montage pour la vidéo native.
 */
export function TrailerBloc({ player }: { player: TrailerPlayer }) {
  const [lance, setLance] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (lance && player.kind === 'video') {
      videoRef.current?.play().catch(() => {
        // Lecture automatique refusée par le navigateur : les contrôles natifs
        // restent là, l'utilisateur appuie sur lecture.
      });
    }
  }, [lance, player.kind]);

  if (lance) {
    return (
      <div className="aa-trailer">
        {player.kind === 'iframe' ? (
          <iframe
            className="aa-trailer__lecteur"
            src={avecLectureImmediate(player.url)}
            title="Vidéo du trailer — première édition du Week-end Sportif Aït Aïssi"
            allow="fullscreen; picture-in-picture; encrypted-media; autoplay"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video
            ref={videoRef}
            className="aa-trailer__lecteur"
            controls
            preload="none"
            src={player.url}
          >
            La vidéo de l’édition 2026 n’a pas pu se charger. Retrouvez-la sur le
            site du Week-end Sportif Aït Aïssi.
          </video>
        )}
      </div>
    );
  }

  return (
    <div className="aa-trailer">
      <button
        type="button"
        className="aa-trailer__poster"
        onClick={() => setLance(true)}
      >
        <span className="aa-trailer__play" aria-hidden="true">
          <svg width="26" height="30" viewBox="0 0 26 30" fill="none" role="presentation">
            <path d="M24.5 13.6C25.9 14.5 25.9 16.5 24.5 17.4L3.4 30.1C1.9 31 -1.7e-07 29.9 0 28.2L0 2.8C-1.7e-07 1.1 1.9 -0.03 3.4 0.9L24.5 13.6Z" fill="currentColor" />
          </svg>
        </span>
        <span className="aa-trailer__libelle">Voir la vidéo de l’édition 2026</span>
      </button>
      <p className="aa-note">
        La vidéo se charge uniquement quand vous cliquez : rien n’est téléchargé avant.
      </p>
    </div>
  );
}
