import { readEnv } from '@/modules/iam/env';

export const DEFAULT_APP_URL = 'http://localhost:3000';

/**
 * URL absolue d'un chemin de l'app, construite sur `APP_URL` (lue serveur-side,
 * jamais codée dur). Une valeur absente, malformée ou dont le schéma n'est pas
 * cliquable retombe sur le défaut local : un lien d'email cassé ne se découvre
 * qu'une fois l'email parti.
 */
export function readAppUrl(path: string): string {
  const raw = readEnv('APP_URL');
  if (raw !== null) {
    try {
      const base = new URL(raw);
      if (base.protocol === 'http:' || base.protocol === 'https:') {
        return new URL(path, base).toString();
      }
    } catch {
    }
  }
  return `${DEFAULT_APP_URL}${path}`;
}
