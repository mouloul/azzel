import * as Sentry from '@sentry/nextjs';
import type { ErrorEvent } from '@sentry/nextjs';
import { masquerDonneesPersonnelles } from '@azzel/shared';

/**
 * Observabilité serveur (épopée 12). Tout est inerte sans `SENTRY_DSN` : le
 * SDK n'est pas initialisé, donc `captureException` ne fait aucun appel réseau.
 */

function lire(nom: string): string | undefined {
  const valeur = process.env[nom];
  return valeur === undefined || valeur === '' ? undefined : valeur;
}

/** Supprime ce qui ne doit jamais sortir (corps, cookies, jetons) puis masque le reste. */
export function nettoyerEvenement<E extends ErrorEvent>(evenement: E): E {
  const copie = { ...evenement } as E;
  if (copie.request) {
    // Aucun en-tête (x-forwarded-for, set-cookie, x-api-key… portent IP et
    // jetons), ni corps, cookies ou chaîne de requête ; l'URL perd sa partie `?…`.
    const { cookies: _c, data: _d, headers: _h, query_string: _q, url, ...requete } = copie.request;
    copie.request =
      typeof url === 'string' ? { ...requete, url: url.split(/[?#]/, 1)[0] } : requete;
  }
  if (copie.user) {
    copie.user = copie.user.id === undefined ? {} : { id: copie.user.id };
  }
  return masquerDonneesPersonnelles(copie);
}

/** Réglages imposés par la règle cardinale : pas de PII, pas de traces, pas de replay. */
export function optionsSentry() {
  return {
    dsn: lire('SENTRY_DSN'),
    environment: lire('SENTRY_ENVIRONMENT'),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: nettoyerEvenement,
  };
}

/**
 * Une erreur non classée devient un 500 générique côté client : sans trace
 * côté serveur, la cause est perdue. On journalise (stdout) et on signale à
 * Sentry avec l'étiquette `module`. Les messages d'erreur du dépôt nomment les
 * variables fautives, jamais leurs valeurs.
 */
export function signalerErreurInattendue(module: string, error: unknown): void {
  console.error('[%s] erreur inattendue (500) :', module, error);
  try {
    Sentry.captureException(error, { tags: { module } });
  } catch {
    // L'observabilité ne casse jamais le métier.
  }
}
