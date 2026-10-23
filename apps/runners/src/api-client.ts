import { isErrorEnvelope, type ChecklistState, type ErrorEnvelopeV1, type ReponseEdossardApi } from '@azzel/shared';

import { API_BASE_URL } from './config';

// Story 6.1 — client HTTP de l'app native : Bearer automatique dès qu'un
// token existe, enveloppes d'erreur ErrorEnvelopeV1 parsées telles quelles
// (message + action affichés par les écrans, jamais de code brut), échec
// réseau distingué (horsLigne) pour servir le cache au lieu d'un écran vide.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientApiConfig {
  baseUrl?: string;
  token?: string | null;
  fetchImpl?: FetchLike;
  /** Délai max par requête (ms) — 15 s par défaut, testé à basse valeur. */
  timeoutMs?: number;
}

/** Erreur serveur (enveloppe) ou réseau (horsLigne). Jamais de code brut à l'écran. */
export class ApiErreur extends Error {
  constructor(
    readonly statut: number,
    readonly enveloppe: ErrorEnvelopeV1 | null,
    readonly horsLigne: boolean,
  ) {
    super(enveloppe?.error.message ?? (horsLigne ? 'Connexion impossible.' : 'Erreur inattendue.'));
    this.name = 'ApiErreur';
  }

  /** 401 : session expirée ou révoquée (AD-5) → écran de reconnexion, cache conservé. */
  get sessionExpiree(): boolean {
    return this.statut === 401;
  }
}

export interface SessionApi {
  email: string;
  role: string;
  createdAt: string;
}

export interface ClientApi {
  /** Demande l'envoi d'un code à 6 chiffres par email (mêmes quotas que le web). */
  demanderCode(email: string): Promise<void>;
  /** Vérifie le code ; client natif → le token de session est renvoyé UNE fois. */
  verifierCode(email: string, code: string): Promise<{ token: string; email: string }>;
  /** Contrôle de validité du token au démarrage (401 → reconnexion). */
  session(): Promise<SessionApi>;
  /** Révoque la session côté serveur (le cache local est purgé par l'app). */
  deconnexion(): Promise<void>;
  /** Checklist du dossier (statut, pièces) — servie du cache si réseau absent. */
  dossier(): Promise<ChecklistState>;
  /** État e-dossard + payload QR (contrat shared) — null-safe quand indisponible. */
  edossard(): Promise<ReponseEdossardApi>;
}

const TIMEOUT_DEFAUT_MS = 15_000;

async function requete<T>(chemin: string, config: ClientApiConfig, init?: RequestInit): Promise<T> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (config.token) {
    // Le jeton ne passe JAMAIS dans un log — juste cet en-tête.
    headers.authorization = `Bearer ${config.token}`;
  }
  // AbortController + setTimeout (et pas AbortSignal.timeout, absent
  // d'Hermes) : une requête qui traîne ne laisse pas l'app sur « chargement ».
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), config.timeoutMs ?? TIMEOUT_DEFAUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl ?? API_BASE_URL}${chemin}`, {
      ...init,
      headers,
      signal: controleur.signal,
    });
  } catch {
    // Réseau coupé OU délai dépassé : même traitement hors-ligne (cache).
    throw new ApiErreur(0, null, true);
  } finally {
    clearTimeout(minuteur);
  }
  let corps: unknown = null;
  try {
    corps = await response.json();
  } catch {
    corps = null;
  }
  if (!response.ok) {
    throw new ApiErreur(response.status, isErrorEnvelope(corps) ? corps : null, false);
  }
  if (corps === null) {
    // 200 au corps absent/illisible : contrat rompu — jamais `null as T`.
    throw new ApiErreur(response.status, null, false);
  }
  return corps as T;
}

function corpsJson(corps: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  };
}

export function creerClientApi(config: ClientApiConfig = {}): ClientApi {
  return {
    async demanderCode(email: string): Promise<void> {
      await requete('/api/auth/code', config, corpsJson({ email }));
    },

    async verifierCode(email: string, code: string): Promise<{ token: string; email: string }> {
      return requete<{ ok: boolean; email: string; token?: string }>(
        '/api/auth/verify',
        config,
        corpsJson({ email, code, client: 'native' }),
      ).then((corps) => {
        if (typeof corps.token !== 'string' || corps.token.length === 0) {
          throw new ApiErreur(500, null, false);
        }
        return { token: corps.token, email: corps.email };
      });
    },

    async session(): Promise<SessionApi> {
      return requete<SessionApi>('/api/auth/session', config);
    },

    async deconnexion(): Promise<void> {
      await requete('/api/auth/logout', config, { method: 'POST' });
    },

    async dossier(): Promise<ChecklistState> {
      return requete<ChecklistState>('/api/coureur/dossier', config);
    },

    async edossard(): Promise<ReponseEdossardApi> {
      return requete<ReponseEdossardApi>('/api/coureur/e-dossard', config);
    },
  };
}
