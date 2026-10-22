export const EGIDE_TEXTE = 'Sous l’égide de la Fédération et du ministère des Sports';

export function BandeauEgide() {
  return (
    <p className="egide">
      <span className="egide-texte">{EGIDE_TEXTE}</span>
    </p>
  );
}
