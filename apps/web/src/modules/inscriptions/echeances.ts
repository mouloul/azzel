import type { OutboxStore } from '@/modules/notifications/outbox-store';
import {
  clampOutboxLimit,
  DEFAULT_OUTBOX_LIMIT,
  processOutbox,
  type OutboxProcessSummary,
  type ProcessOutboxDeps,
  type SendNotificationFn,
} from '@/modules/notifications/worker';

import type { InscriptionsStore } from './store';

/**
 * Balayage des échéances de preuve — logique unique, partagée par la commande
 * `inscriptions:echeances` (crontab du VPS de production) et la route
 * `GET /api/cron/echeances` (recette sur Vercel, sans crontab).
 *
 * Trois gestes, dans cet ordre : rappeler ceux dont l'échéance tombe dans les
 * 24 heures, puis expirer ceux qui l'ont dépassée, puis passer la file
 * d'envoi. L'ordre compte — l'inverse enverrait un rappel à quelqu'un qui
 * vient d'expirer.
 *
 * Entièrement idempotent : le passage en « expirée » ne retrouve plus les
 * lignes du passage précédent, et les index uniques partiels absorbent tout
 * doublon d'email. Un cron horaire, ou rejoué dix fois, donne le même état.
 */

export interface DepsEcheances {
  inscriptions: Pick<InscriptionsStore, 'enfilerRappelsPreuve' | 'expirerInscriptionsEchues'>;
  outbox: OutboxStore;
  /** Transport d'envoi ; défaut : celui du worker (SMTP). */
  send?: SendNotificationFn;
}

/** Étape achevée, signalée au fil de l'eau (chaque étape est commitée). */
export type ProgressionEcheances =
  | { etape: 'rappels'; rappels: number }
  | { etape: 'expirations'; expirees: number; emailsExpiration: number }
  | { etape: 'envoi'; envoi: OutboxProcessSummary };

export interface OptionsEcheances {
  /**
   * Plafond du passage de la file d'envoi. Ce qui dépasse reste en attente et
   * part au passage suivant — utile quand l'appelant a un temps d'exécution
   * borné (fonction serverless).
   */
  plafondEnvoi?: number;
  /** Rappelé après chaque étape : un échec plus loin ne fait pas perdre la trace des étapes faites. */
  progression?: (etape: ProgressionEcheances) => void;
}

export interface BilanEcheances {
  /** Emails de rappel enfilés par CE passage (un par dossier et par échéance). */
  rappels: number;
  /** Dossiers passés en « expirée » par CE passage — autant de places rendues. */
  expirees: number;
  /** Emails d'expiration enfilés par CE passage (les doublons sont absorbés). */
  emailsExpiration: number;
  /**
   * Passage de la file d'envoi. Il traite TOUTE la file en attente, pas
   * seulement les emails enfilés par ce balayage.
   */
  envoi: OutboxProcessSummary;
}

export async function balayerEcheances(
  deps: DepsEcheances,
  maintenant: Date,
  options: OptionsEcheances = {},
): Promise<BilanEcheances> {
  const signaler = options.progression ?? (() => undefined);

  const rappels = await deps.inscriptions.enfilerRappelsPreuve(maintenant);
  signaler({ etape: 'rappels', rappels });

  const expiration = await deps.inscriptions.expirerInscriptionsEchues(maintenant);
  signaler({
    etape: 'expirations',
    expirees: expiration.expirees,
    emailsExpiration: expiration.emailsEnfiles,
  });

  // La file couvre ce qui vient d'être enfilé PLUS la marge habituelle : pas
  // de goutte-à-goutte 20 par passage quand une vague d'échéances tombe.
  const besoin = rappels + expiration.emailsEnfiles + DEFAULT_OUTBOX_LIMIT;
  const limite = clampOutboxLimit(
    options.plafondEnvoi === undefined ? besoin : Math.min(besoin, options.plafondEnvoi),
  );
  const depsEnvoi: ProcessOutboxDeps = { store: deps.outbox };
  if (deps.send) {
    depsEnvoi.send = deps.send;
  }
  const envoi = await processOutbox(limite, depsEnvoi);
  signaler({ etape: 'envoi', envoi });

  return {
    rappels,
    expirees: expiration.expirees,
    emailsExpiration: expiration.emailsEnfiles,
    envoi,
  };
}
