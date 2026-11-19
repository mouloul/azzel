/**
 * Battements de cœur des crons VPS (épopée 12). Sans `HEARTBEAT_URL_<NOM>`,
 * aucun appel. Ne lève jamais : une panne du moniteur ne casse pas le cron.
 */

import { readEnv } from '@/modules/iam/env';

export const DELAI_BATTEMENT_MS = 5_000;

export type IssueBattement = 'succes' | 'echec';

export async function battement(nom: string, issue: IssueBattement): Promise<void> {
  try {
    const base = readEnv(`HEARTBEAT_URL_${nom}`);
    if (base === null) {
      return;
    }
    const url = issue === 'succes' ? base : `${base.replace(/\/+$/, '')}/fail`;
    const reponse = await fetch(url, { signal: AbortSignal.timeout(DELAI_BATTEMENT_MS) });
    await reponse.body?.cancel().catch(() => undefined);
  } catch {
    // battement avalé
  }
}

/**
 * Exécute le cron, puis envoie un seul battement : succès si `process.exitCode`
 * est resté nul, échec sinon ou si `main` lève (le code de sortie passe alors à 1).
 */
export async function terminerAvecBattement(
  nom: string,
  main: () => Promise<void>,
  libelle: string = nom,
): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(`${libelle} a échoué :`, error);
    process.exitCode = 1;
  }
  const echec = process.exitCode !== undefined && Number(process.exitCode) !== 0;
  await battement(nom, echec ? 'echec' : 'succes');
}
