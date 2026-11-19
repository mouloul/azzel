/**
 * Masquage RGPD des événements d'observabilité (épopée 12). Générique et sans
 * dépendance : le web (Sentry Node) et, plus tard, Expo le partagent.
 */

export const MASQUE = '[masqué]';

/** Une clé (normalisée) qui CONTIENT l'un de ces fragments est masquée. */
const FRAGMENTS_SENSIBLES = [
  'token',
  'secret',
  'password',
  'motdepasse',
  'cookie',
  'session',
  'mail',
  'phone',
  'telephone',
  'authorization',
  'jeton',
] as const;

/** Une clé (normalisée) qui VAUT l'un de ces noms est masquée. */
const NOMS_SENSIBLES = new Set([
  'nom',
  'prenom',
  'name',
  'firstname',
  'lastname',
  'adresse',
  'address',
  'ip',
  'ipaddress',
  'datenaissance',
  'latitude',
  'longitude',
  'lat',
  'lon',
]);

/** Minuscules, sans accents, sans `_` ni `-`. */
function normaliserCle(cle: string): string {
  return cle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]/g, '');
}

function cleSensible(cle: string): boolean {
  const normalisee = normaliserCle(cle);
  return (
    NOMS_SENSIBLES.has(normalisee) ||
    FRAGMENTS_SENSIBLES.some((fragment) => normalisee.includes(fragment))
  );
}

const MOTIFS_VALEUR: readonly RegExp[] = [
  // JWT (trois segments base64url)
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  // Bearer <jeton>
  /\bBearer\s+[\w.~+/=-]+/gi,
  // clé de preuve : <uuid>.<ext>
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}\b/gi,
  // email
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}/g,
  // téléphone algérien (+213 / 0213 / 0X…) et français (+33 / 0033 / 0X…)
  /(?<![\w.])(?:\+|00)(?:213|33)[\s.-]?\(?0?\)?[\s.-]?[1-9](?:[\s.-]?\d{2}){3,4}(?![\w])/g,
  /(?<![\w.])0[1-9](?:[\s.-]?\d{2}){4}(?![\w])/g,
  /(?<![\w.])0[5-7]\d{2}(?:[\s.-]?\d{2}){3}(?![\w])/g,
];

function masquerTexte(texte: string): string {
  let sortie = texte;
  for (const motif of MOTIFS_VALEUR) {
    sortie = sortie.replace(motif, MASQUE);
  }
  return sortie;
}

function masquer(valeur: unknown, vus: WeakMap<object, unknown>): unknown {
  if (typeof valeur === 'string') {
    return masquerTexte(valeur);
  }
  if (valeur === null || typeof valeur !== 'object') {
    return valeur;
  }
  if (valeur instanceof Date) {
    return new Date(valeur.getTime());
  }
  if (vus.has(valeur)) {
    return vus.get(valeur);
  }
  if (Array.isArray(valeur)) {
    const copie: unknown[] = [];
    vus.set(valeur, copie);
    for (const element of valeur) {
      copie.push(masquer(element, vus));
    }
    return copie;
  }
  if (valeur instanceof Error) {
    const copie = Object.create(Object.getPrototypeOf(valeur)) as Record<string, unknown>;
    vus.set(valeur, copie);
    for (const cle of Object.getOwnPropertyNames(valeur)) {
      const brut = (valeur as unknown as Record<string, unknown>)[cle];
      copie[cle] = cleSensible(cle) ? MASQUE : masquer(brut, vus);
    }
    return copie;
  }
  const copie: Record<string, unknown> = {};
  vus.set(valeur, copie);
  for (const [cle, brut] of Object.entries(valeur as Record<string, unknown>)) {
    copie[cle] = cleSensible(cle) ? MASQUE : masquer(brut, vus);
  }
  return copie;
}

/**
 * Copie `valeur` en remplaçant par `[masqué]` : toute valeur de clé sensible
 * (email, telephone, nom, prenom, latitude/longitude, password, token,
 * cookie, authorization…) et, dans les chaînes, emails, téléphones, clés de
 * preuve et jetons. Récursif, sans muter l'entrée.
 */
export function masquerDonneesPersonnelles<T>(valeur: T): T {
  return masquer(valeur, new WeakMap()) as T;
}
