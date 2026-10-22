// Story 4.1 (FR-7, AD-8) — contrat versionné du payload QR e-dossard. Le QR
// encode TOUJOURS `azzel-e1:<jeton>` : jamais le dossard nu (le jeton est
// unique par coureur/édition, résolu via l'annuaire v2 par le scanneur de
// l'épopée 4). Unique source de vérité inter-apps : la page coureur encode,
// le scanneur décode — jamais réinventé localement.
//
// Défensif par construction côté décode : un payload invalide donne null,
// jamais d'exception (le scanneur affichera DOSSARD INCONNU sur ce null).

export const EDOSSARD_PAYLOAD_VERSION = 'e1' as const;

/** Préfixe complet du payload : `azzel-e1:`. */
export const EDOSSARD_PAYLOAD_PREFIX = `azzel-${EDOSSARD_PAYLOAD_VERSION}:` as const;

/**
 * Longueur du jeton — symétrie exacte avec le CHECK SQL (migration 0023) :
 * randomBytes(16) en base64url = 22 caractères (128 bits d'entropie).
 */
export const JETON_EDOSSARD_LENGTH = 22;

// Garde de forme du jeton (base64url, 22 caractères) — construite par
// interpolation : un literal regex n'interprète pas {JETON_EDOSSARD_LENGTH}.
const JETON_EDOSSARD_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${JETON_EDOSSARD_LENGTH}}$`);

/** Garde de forme du jeton (base64url, 22 caractères). */
export function estJetonEdossardValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && JETON_EDOSSARD_PATTERN.test(valeur);
}

/**
 * Encode le payload QR : `azzel-e1:<jeton>`. Échoue fort sur un jeton invalide
 * (violation de contrat = bug serveur à attraper) — le décodeur, lui, est total.
 */
export function encoderPayloadEdossard(jeton: string): string {
  if (!estJetonEdossardValide(jeton)) {
    throw new TypeError('jeton e-dossard invalide : base64url de 22 caractères attendu');
  }
  return `${EDOSSARD_PAYLOAD_PREFIX}${jeton}`;
}

/**
 * Décode un payload scanné : retrouve le jeton derrière `azzel-e1:`. Total :
 * payload non-chaîne, préfixe inconnu (autre version), jeton mal formé →
 * null, jamais d'exception.
 */
export function decoderPayloadEdossard(payload: unknown): string | null {
  if (typeof payload !== 'string' || !payload.startsWith(EDOSSARD_PAYLOAD_PREFIX)) {
    return null;
  }
  const jeton = payload.slice(EDOSSARD_PAYLOAD_PREFIX.length);
  return estJetonEdossardValide(jeton) ? jeton : null;
}
