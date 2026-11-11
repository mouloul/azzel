import { formatLocalDateTime } from '@azzel/shared';
import type { Ref } from 'react';

import { AssistanceButton } from '@/components/assistance-button';
import type { PreuveSummary } from '@/modules/inscriptions/proof-service';

/**
 * Accusé de réception d'une preuve : remplace le formulaire dès que le serveur
 * a confirmé le dépôt. Sans lui, le bouton d'envoi disparaissait sur un
 * formulaire inchangé et le coureur ne savait pas si sa preuve était partie.
 *
 * Un seul message : le dépôt n'est possible qu'en constitution, c'est donc
 * toujours le premier. Aucun remplacement proposé — le dossier passe en
 * validation, figé jusqu'à la décision (PO, 11/11/2026).
 *
 * Annoncé par le focus (posé par le formulaire), pas par une région live :
 * une région insérée déjà remplie n'est pas lue de façon fiable, et les deux
 * mécanismes ensemble la font lire deux fois.
 */
export function PreuveEnvoyee({
  preuve,
  assistancePhone,
  ref,
}: {
  preuve: PreuveSummary;
  assistancePhone: string;
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
        Ta preuve de paiement a bien été reçue.
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
      <p className="hint">
        Tu t’es trompé de fichier ? Appelle l’organisation : elle refusera ton dossier, que tu
        pourras ensuite reprendre avec « Modifier mon inscription ».
      </p>
      <div className="auth-alt">
        <a className="btn-action" href="/espace-coureur">
          Voir mon dossier
        </a>
        <AssistanceButton phone={assistancePhone} />
      </div>
    </div>
  );
}
