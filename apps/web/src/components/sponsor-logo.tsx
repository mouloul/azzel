'use client';

import { useState } from 'react';

/**
 * Logo de sponsor rendu par URL fournie par l’admin (aucun upload, story 2.3).
 * Décoratif : alt vide — le nom du sponsor est rendu adjacemment (pas de double
 * annonce lecteur d’écran). Logo cassé (404…) : onError masque l’image — le nom
 * reste affiché, la mise en page tient. Jamais déformé : object-fit contain.
 */
export function SponsorLogo({ src }: { src: string }) {
  const [casse, setCasse] = useState(false);
  if (casse) {
    return null;
  }
  return (
    <img
      src={src}
      alt=""
      width={160}
      height={64}
      loading="lazy"
      decoding="async"
      className="aa-partenaire__logo"
      onError={() => setCasse(true)}
    />
  );
}
