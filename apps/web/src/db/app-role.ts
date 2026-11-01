import type { Sql } from 'postgres';

import { createAppRoleGuard } from '@/modules/iam/store';

/**
 * Garde de rôle applicatif (story 1.9), appliquée aux stores `inscriptions`,
 * `iam` (via `createAppRoleGuard`), `sponsors`, `contenus`, `retour-images` et
 * `notifications/outbox`.
 *
 * Quatre stores y échappent encore — `missions`, `chrono`, `rapports`,
 * `tracking` — écart préexistant consigné dans
 * `_bmad-output/implementation-artifacts/deferred-work.md`.
 *
 * Elle n'était câblée que sur le store IAM : les autres modules ouvraient leur
 * propre connexion, si bien qu'une `DATABASE_URL` pointant sur le propriétaire
 * (BYPASSRLS) faisait refuser la connexion mais continuait de servir les
 * lectures vitrine et les écritures d'administration. « On refuse de servir
 * plutôt qu'avertir » n'était vrai qu'à moitié.
 *
 * Le proxy intercale la vérification devant chaque méthode du store. Le verdict
 * est mémorisé par connexion (un seul `SELECT current_user`).
 */
export function protegerStore<T extends object>(sql: Sql, store: T, production: boolean): T {
  const ensureAppRole = createAppRoleGuard(sql, { production });
  return new Proxy(store, {
    get(cible, propriete, recepteur) {
      const valeur = Reflect.get(cible, propriete, recepteur);
      if (typeof valeur !== 'function') {
        return valeur;
      }
      return async (...args: unknown[]) => {
        await ensureAppRole();
        return (valeur as (...a: unknown[]) => unknown).apply(cible, args);
      };
    },
  });
}
