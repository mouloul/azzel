'use client';

import { useState } from 'react';

type AaPhotoProps = {
  /** Variante mobile / défaut (640) — chemin mesuré par le budget. */
  src: string;
  /** Variante grand écran (≥ 700 px) servie via <picture>. */
  srcLarge?: string;
  alt: string;
  width: number;
  height: number;
  variant?: 'couverture' | 'cadre';
  /** Photo au-dessus de la ligne de flottaison : eager + fetchpriority high. */
  priority?: boolean;
};

export function AaPhoto({
  src,
  srcLarge,
  alt,
  width,
  height,
  variant = 'cadre',
  priority = false,
}: AaPhotoProps) {
  const [chargee, setChargee] = useState(false);

  const image = (
    <img
      className={`aa-photo__img${chargee ? ' aa-photo__img--chargee' : ''}`}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'low'}
      data-hero-photo={priority ? '' : undefined}
      onLoad={() => setChargee(true)}
    />
  );

  return (
    <figure
      className={`aa-photo${variant === 'couverture' ? ' aa-photo--couverture' : ''}`}
      style={variant === 'cadre' ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      {srcLarge ? (
        <picture>
          <source media="(min-width: 700px)" srcSet={srcLarge} />
          {image}
        </picture>
      ) : (
        image
      )}
    </figure>
  );
}
