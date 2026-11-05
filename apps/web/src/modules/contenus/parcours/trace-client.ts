import type { PointTrace, TraceCarte } from './carte';
import type { Repere } from './reperes';

/**
 * Chargement du tracé d'une épreuve, côté navigateur, à l'ouverture de la
 * carte.
 *
 * Module PUR et sans dépendance à React ni à MapLibre : il est partagé par la
 * carte de la page /parcours et par la vue de l'accueil, et se teste sans
 * navigateur. Ce que le serveur renvoie est VALIDÉ ici avant d'atteindre la
 * carte : un JSON tronqué par une connexion qui flanche ne doit pas devenir un
 * `TypeError` au fond de MapLibre.
 */

export class TraceIndisponibleError extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = 'TraceIndisponibleError';
  }
}

export interface DonneesTrace {
  trace: TraceCarte;
  reperes: Repere[];
}

/** La version est DANS l'URL : un nouveau tracé publié change l'adresse, et
 *  l'ancienne, cachée « à vie », n'est simplement plus demandée. */
export function urlTrace(slug: string, version: number): string {
  return `/api/parcours/${encodeURIComponent(slug)}/trace?v=${version}`;
}

function estNombre(valeur: unknown): valeur is number {
  return typeof valeur === 'number' && Number.isFinite(valeur);
}

function estPoint(valeur: unknown): valeur is PointTrace {
  return Array.isArray(valeur) && valeur.length === 3 && valeur.every(estNombre);
}

function estRepere(valeur: unknown): valeur is Repere {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const r = valeur as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.nom === 'string' &&
    typeof r.libelle === 'string' &&
    estNombre(r.lon) &&
    estNombre(r.lat)
  );
}

export async function chargerTrace(
  slug: string,
  version: number,
  chercher: typeof fetch = fetch,
): Promise<DonneesTrace> {
  let reponse: Response;
  try {
    reponse = await chercher(urlTrace(slug, version));
  } catch {
    throw new TraceIndisponibleError('réseau injoignable');
  }
  if (!reponse.ok) {
    throw new TraceIndisponibleError(`réponse ${reponse.status}`);
  }
  let corps: unknown;
  try {
    corps = await reponse.json();
  } catch {
    throw new TraceIndisponibleError('JSON illisible');
  }

  const trace = (corps as { trace?: { points?: unknown; distancesM?: unknown } } | null)?.trace;
  const points = trace?.points;
  const distances = trace?.distancesM;
  if (
    !Array.isArray(points) ||
    points.length === 0 ||
    !points.every(estPoint) ||
    !Array.isArray(distances) ||
    distances.length !== points.length ||
    !distances.every(estNombre)
  ) {
    throw new TraceIndisponibleError('tracé mal formé');
  }

  const brutes = (corps as { reperes?: unknown }).reperes;
  // Des repères invalides n'empêchent pas la carte : on les écarte, on ne
  // refuse pas un tracé parfaitement bon pour des pastilles.
  const reperes = Array.isArray(brutes) ? brutes.filter(estRepere) : [];

  return { trace: { points, distancesM: distances }, reperes };
}
