/** Taille de rendu des glyphes (charte : 20–24 px) — source unique des attributs SVG width/height. */
export const TAILLE_GLYPHE = 22;

const GLYPHE_COMMUN = {
  width: TAILLE_GLYPHE,
  height: TAILLE_GLYPHE,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
} as const;

type GlypheProps = { className?: string };

export function GlypheYaz({ className = 'aa-glyphe' }: GlypheProps) {
  return (
    <svg {...GLYPHE_COMMUN} className={className} data-glyphe="yaz">
      <path d="M12 21.5 V9 M12 9 L5.5 2.5 H2 M12 9 L18.5 2.5 H22" />
    </svg>
  );
}

export function GlypheTala({ className = 'aa-glyphe' }: GlypheProps) {
  return (
    <svg {...GLYPHE_COMMUN} className={className} data-glyphe="tala">
      <path d="M4.5 11.5 Q12 2.5 19.5 11.5 M3 11.5 H21 M12 11.5 V15 M7 20.5 Q12 18 17 20.5" />
    </svg>
  );
}

export function GlypheTabzimt({ className = 'aa-glyphe' }: GlypheProps) {
  return (
    <svg {...GLYPHE_COMMUN} className={className} data-glyphe="tabzimt">
      <path d="M12 3.5 L21 20.5 H3 Z" />
      <path d="M12 10.5 L16.5 17.5 H7.5 Z" />
    </svg>
  );
}

export function GlypheIngel({ className = 'aa-glyphe' }: GlypheProps) {
  return (
    <svg {...GLYPHE_COMMUN} className={className} data-glyphe="ingel">
      <path d="M12 2.5 L6.5 9.5 H17.5 Z" />
      <path d="M12 7.5 L4.5 17 H19.5 Z" />
      <path d="M12 17 V21.5" />
    </svg>
  );
}
