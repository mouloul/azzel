import { splitParagraphes } from '@/modules/contenus/domain';

/**
 * Rendu public d’un corps de bloc : texte simple échappé par React (aucun
 * HTML n’est jamais interprété), paragraphes séparés par lignes vides, sauts
 * de ligne simples conservés.
 */
export function CorpsContenu({ corps, className }: { corps: string; className?: string }) {
  const paragraphes = splitParagraphes(corps);
  return (
    <div className={className ?? 'aa-corps'}>
      {paragraphes.map((paragraphe, index) => (
        <p key={index}>
          {paragraphe.split('\n').map((ligne, indexLigne, lignes) => (
            <span key={indexLigne}>
              {ligne}
              {indexLigne < lignes.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
