import { useId } from 'react';

type FriseProps = {
  /** Hauteur en pixels, bornée 8–24 (charte : hauteur ≤ 24 px) ; non finie → 16. */
  hauteur?: number;
  /** Couleur unique du motif — currentColor par défaut (thémée via la classe). */
  couleur?: string;
  className?: string;
};

const HAUTEUR_DEFAUT = 16;

export function Frise({
  hauteur = HAUTEUR_DEFAUT,
  couleur = 'currentColor',
  className = 'aa-frise',
}: FriseProps) {
  const id = `frise-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const h = Math.max(
    8,
    Math.min(24, Math.round(Number.isFinite(hauteur) ? hauteur : HAUTEUR_DEFAUT)),
  );
  const base = h - 1.5;
  const sommetExterieur = Math.max(2, base * 0.17);
  const sommetInterieur = base * 0.58;
  const motif = `M1 ${base} L12 ${sommetExterieur} L23 ${base} Z M6.5 ${base} L12 ${sommetInterieur} L17.5 ${base} Z`;
  return (
    <svg
      className={className}
      data-frise=""
      aria-hidden="true"
      focusable="false"
      width="100%"
      height={h}
    >
      <defs>
        <pattern id={id} width="24" height={h} patternUnits="userSpaceOnUse">
          <path d={motif} fill={couleur} fillRule="evenodd" />
        </pattern>
      </defs>
      <rect width="100%" height={h} fill={`url(#${id})`} />
    </svg>
  );
}

export function Crete({ className = 'aa-crete' }: { className?: string }) {
  return (
    <svg
      className={className}
      data-crete=""
      aria-hidden="true"
      focusable="false"
      width="120"
      height="8"
      viewBox="0 0 120 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M0 6.5 L20 2 L40 5.5 L60 1 L82 5 L102 2.5 L120 6" />
    </svg>
  );
}
