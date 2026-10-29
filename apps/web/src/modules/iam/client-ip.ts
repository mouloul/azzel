import { TRUSTED_PROXY_HOPS_ENV_NAME } from './constants';
import { readEnv } from './env';

/**
 * IP de l'appelant pour le quota anti-abus.
 *
 * `x-forwarded-for` est une liste que le client peut préfixer lui-même : lire
 * la première entrée revenait à laisser l'auteur d'un déni de service choisir
 * son identifiant de quota, donc à le contourner par simple rotation d'en-tête.
 *
 * On ne fait confiance qu'aux entrées ajoutées par NOS proxies :
 * `AZZEL_TRUSTED_PROXY_HOPS` dit combien il y en a (1 derrière un reverse proxy
 * unique). L'adresse retenue est la n-ième en partant de la DROITE, la seule
 * que le client ne peut pas forger. Sans variable, on n'utilise pas l'en-tête
 * du tout : pas de quota par IP plutôt qu'un quota qui ne borne personne.
 */
export function readTrustedClientIp(headers: {
  get(name: string): string | null;
}): string | null {
  const hops = readTrustedProxyHops();
  if (hops <= 0) {
    return null;
  }
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) {
    // Un proxy de confiance pose toujours l'en-tête : son absence signale un
    // appel direct, qui ne doit pas se voir attribuer l'IP d'un autre.
    return null;
  }
  const entrees = forwarded
    .split(',')
    .map((entree) => entree.trim())
    .filter((entree) => entree.length > 0);
  const candidat = entrees[entrees.length - hops];
  return candidat ? normaliserIp(candidat) : null;
}

function readTrustedProxyHops(): number {
  const brut = readEnv(TRUSTED_PROXY_HOPS_ENV_NAME);
  if (!brut) {
    return 0;
  }
  const valeur = Number.parseInt(brut, 10);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : 0;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Normalise l'adresse avant hachage : sans cela « 203.0.113.7 »,
 * « 203.0.113.7:443 » et « 2001:DB8::1 » donnaient trois empreintes pour un
 * seul client. Les adresses IPv6 sont regroupées par /64 — un abonné en
 * dispose légitimement de 2^64, et compter chacune séparément annule le quota.
 */
export function normaliserIp(brut: string): string | null {
  let valeur = brut.trim().toLowerCase();
  if (valeur.startsWith('[')) {
    // Forme [2001:db8::1]:443
    const fin = valeur.indexOf(']');
    if (fin === -1) {
      return null;
    }
    valeur = valeur.slice(1, fin);
  } else if (valeur.includes('.') && valeur.includes(':')) {
    // IPv4 avec port
    valeur = valeur.slice(0, valeur.indexOf(':'));
  }
  if (valeur.length === 0) {
    return null;
  }
  const v4 = IPV4.exec(valeur);
  if (v4) {
    const octets = v4.slice(1).map((octet) => Number.parseInt(octet, 10));
    return octets.every((octet) => octet >= 0 && octet <= 255) ? octets.join('.') : null;
  }
  if (!valeur.includes(':')) {
    return null;
  }
  return prefixeIpv6(valeur);
}

/** Préfixe /64 d'une adresse IPv6, sous forme de 4 groupes. */
function prefixeIpv6(adresse: string): string | null {
  const parts = adresse.split('::');
  if (parts.length > 2) {
    return null;
  }
  const gauche = (parts[0] ?? '').split(':').filter((g) => g.length > 0);
  const droite = parts.length === 2 ? (parts[1] ?? '').split(':').filter((g) => g.length > 0) : [];
  const groupes =
    parts.length === 2
      ? [...gauche, ...Array(Math.max(0, 8 - gauche.length - droite.length)).fill('0'), ...droite]
      : gauche;
  if (groupes.length !== 8 || groupes.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) {
    return null;
  }
  return groupes
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':');
}
