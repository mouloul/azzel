'use client';

import { useEffect, useState } from 'react';

import type { PointProfil } from '@/modules/contenus/parcours/profil';

/* Story 11.4 — île MINUSCULE du curseur de profil.
 *
 * Côté serveur elle rend `null` : le profil complet (SVG + légende +
 * synthèse) est servi sans JavaScript, l’interactivité n’est qu’une
 * amélioration progressive. Le composant réel (profil-curseur.tsx) n’entre
 * que par import DYNAMIQUE APRÈS montage : son chunk reste hors du chemin
 * critique de l’accueil (budget < 300 Kio, mesuré par check-budget.sh). */

type CurseurCharge = typeof import('./profil-curseur').ProfilCurseur;

export function ProfilCurseurMontage({
  epreuve,
  points,
  distanceM,
}: {
  /** Slug de l’épreuve (porté par le CustomEvent az-parcours-curseur). */
  epreuve: string;
  /** Points décimés du profil (≈ 140 sur la longue, quelques Kio de RSC). */
  points: readonly PointProfil[];
  distanceM: number;
}) {
  const [Curseur, setCurseur] = useState<CurseurCharge | null>(null);

  useEffect(() => {
    let annule = false;
    void import('./profil-curseur')
      .then((module) => {
        if (!annule) {
          setCurseur(() => module.ProfilCurseur);
        }
      })
      // île absente : le profil complet servi reste autonome
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, []);

  if (Curseur === null || points.length < 2) {
    return null;
  }
  return <Curseur epreuve={epreuve} points={points} distanceM={distanceM} />;
}
