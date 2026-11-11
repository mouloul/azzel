import { formatLocalDateTime } from '@azzel/shared';
import type { Ref } from 'react';

import type { PreuveSummary } from '@/modules/inscriptions/proof-service';

/**
 * - premiere : aucun dépôt avant celui-ci ;
 * - remplacement : une nouvelle preuve a pris la place de la précédente ;
 * - deja-recue : même fichier que la preuve déjà enregistrée — le serveur l'a
 *   reconnue et n'a rien remplacé ; annoncer un remplacement serait faux.
 */
export type VarianteEnvoi = 'premiere' | 'remplacement' | 'deja-recue';

const MESSAGES: Record<VarianteEnvoi, string> = {
  premiere: 'Ta preuve de paiement a bien été reçue.',
  remplacement: 'Ta nouvelle preuve a bien été reçue. Elle remplace la précédente.',
  'deja-recue': 'Cette preuve était déjà enregistrée : rien n’a changé.',
};

/**
 * Accusé de réception d'une preuve : remplace le formulaire dès que le serveur
 * a confirmé le dépôt. Sans lui, le bouton d'envoi disparaissait sur un
 * formulaire inchangé et le coureur ne savait pas si sa preuve était partie.
 *
 * Annoncé par le focus (posé par le formulaire), pas par une région live :
 * une région insérée déjà remplie n'est pas lue de façon fiable, et les deux
 * mécanismes ensemble la font lire deux fois.
 */
export function PreuveEnvoyee({
  preuve,
  variante,
  onRemplacer,
  ref,
}: {
  preuve: PreuveSummary;
  variante: VarianteEnvoi;
  onRemplacer: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="confirmation-box"
      aria-labelledby="preuve-envoyee-message"
    >
      <p id="preuve-envoyee-message" className="confirmation-message">
        {MESSAGES[variante]}
      </p>
      <p>
        Ton dossier est <strong>en validation</strong> : l’organisation vérifie ton
        versement. Tu reçois un email dès sa décision — tu n’as rien d’autre à faire d’ici
        là.
      </p>
      <p className="meta">
        Déposée le {formatLocalDateTime(preuve.depositedAt)}
        {preuve.numeroTransaction !== null
          ? ` · N° de transaction : ${preuve.numeroTransaction}`
          : ''}
      </p>
      <div className="auth-alt">
        <a className="btn-action" href="/espace-coureur">
          Voir mon dossier
        </a>
        <button type="button" className="btn-contour" onClick={onRemplacer}>
          Remplacer ma preuve
        </button>
      </div>
    </div>
  );
}
