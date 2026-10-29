const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * id non-UUID : refus 404 propre AVANT le SQL. Sans ce garde, Postgres lève un
 * 22P02 qu'aucun mapper d'erreurs ne reconnaît, et la route répond 500.
 * Helper partagé par toutes les routes admin `[id]`.
 */
export function idInvalide(id: string): boolean {
  return !UUID_PATTERN.test(id);
}
