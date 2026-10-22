import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './constants';

// Story 3.1 — mots de passe volontaires : scrypt (node:crypto, zéro dépendance),
// format salé « scrypt$<saltHex>$<cleHex> », comparaison timingSafeEqual.
// La connexion coureur/organisateur reste par code email : ce module ne sert
// QUE au parcours volontaire (définition à l'activation + connexion).

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// Réexport des bornes : la source vit dans constants.ts (client-safe).
export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };

const KEY_LENGTH = 64;

const SALT_BYTES = 16;

export function estMotDePasseValide(motDePasse: string): boolean {
  return motDePasse.length >= PASSWORD_MIN_LENGTH && motDePasse.length <= PASSWORD_MAX_LENGTH;
}

/** Hash scrypt salé, format « scrypt$<saltHex>$<cleHex> » — jamais de sel partagé. */
export async function hashPassword(motDePasse: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const cle = await scrypt(motDePasse, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${cle.toString('hex')}`;
}

/**
 * Vérifie un mot de passe contre le hash stocké. Comparaison à temps constant
 * (timingSafeEqual sur les clés dérivées) ; hash illisible → false, jamais
 * d'exception (un format corrompu ne doit pas ouvrir de session ni casser la
 * connexion).
 */
export async function verifyPassword(motDePasse: string, hashStocke: string): Promise<boolean> {
  const parts = hashStocke.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1] ?? '', 'hex');
  const cleAttendue = Buffer.from(parts[2] ?? '', 'hex');
  if (salt.length === 0 || cleAttendue.length !== KEY_LENGTH) {
    return false;
  }
  const cle = await scrypt(motDePasse, salt, KEY_LENGTH);
  return timingSafeEqual(cle, cleAttendue);
}
