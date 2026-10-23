import type { ChecklistState, ReponseEdossardApi } from '@azzel/shared';

import { ApiErreur, type ClientApi, type SessionApi } from './api-client';
import { dossierValide, type Ecran } from './app-state';
import type { EtatSession } from './auth-store';
import type { EdossardCache, EntreeCache } from './offline-cache';

// Story 6.1 (revue) — orchestration de l'app : toute la logique de décision
// et de chargement (démarrage, connexion, chargement du dossier) vit ICI,
// avec des ports injectés (client API + lectures/écritures de stores) dans
// l'esprit du DI de creerClientApi({ fetchImpl }) — App.tsx ne fait que
// câbler les états aux écrans. Règles portées :
// - hors-ligne : cache servi (bandeau), dossier validé sans cache e-dossard
//   → checklist en cache (jamais un é-dossard vide ni « première connexion ») ;
// - 401 : session oubliée (AD-5) mais caches CONSERVÉS → reconnexion ;
// - dossier validé → e-dossard direct (étapes court-circuitées) ;
// - changement de compte : caches purgés AVANT le premier fetch (jamais
//   l'identité d'un autre coureur servie hors-ligne).

export interface PortsOrchestration {
  creerClient: (token: string | null) => ClientApi;
  lireToken: () => Promise<string | null>;
  ecrireToken: (token: string) => Promise<void>;
  lireEtatSession: () => Promise<EtatSession | null>;
  ecrireEtatSession: (etat: EtatSession) => Promise<void>;
  oublierSession: () => Promise<void>;
  purgerCache: () => Promise<void>;
  lireCacheDossier: () => Promise<EntreeCache<ChecklistState> | null>;
  ecrireCacheDossier: (dossier: ChecklistState) => Promise<void>;
  lireCacheEdossard: () => Promise<EntreeCache<EdossardCache> | null>;
  ecrireCacheEdossard: (reponse: ReponseEdossardApi) => Promise<void>;
}

export interface EtatApp {
  ecran: Ecran;
  token: string | null;
  sessionExpiree: boolean;
  dossier: ChecklistState | null;
  edossard: EdossardCache | null;
  depuisCache: boolean;
}

/** Mise à jour partielle appliquée par App.tsx sur son état. */
export type MiseAJourEcran = Partial<EtatApp>;

const RECONNEXION_401: MiseAJourEcran = {
  ecran: 'connexion',
  token: null,
  dossier: null,
  edossard: null,
  depuisCache: false,
  sessionExpiree: true,
};

/**
 * Sert le dossier (et l'e-dossard si présent) depuis le cache : bandeau
 * « hors-ligne ». Dossier validé sans cache e-dossard → checklist (lisible),
 * jamais un écran e-dossard vide.
 */
async function servirDepuisCache(ports: PortsOrchestration): Promise<MiseAJourEcran> {
  const cache = await ports.lireCacheDossier();
  if (cache === null) {
    return { ecran: 'hors-ligne' };
  }
  const base: MiseAJourEcran = { dossier: cache.donnees, depuisCache: true };
  if (!dossierValide(cache.donnees)) {
    return { ...base, ecran: 'dossier', edossard: null };
  }
  const cacheEdossard = await ports.lireCacheEdossard();
  if (cacheEdossard !== null) {
    return { ...base, ecran: 'edossard', edossard: cacheEdossard.donnees };
  }
  return { ...base, ecran: 'dossier', edossard: null };
}

/**
 * Charge le dossier puis route : validé → e-dossard direct ; sinon checklist.
 * 401 → session oubliée (token jeté, caches conservés) + reconnexion. Échec
 * réseau → cache, sinon écran première connexion.
 */
export async function chargerDossier(
  ports: PortsOrchestration,
  token: string,
): Promise<MiseAJourEcran> {
  const client = ports.creerClient(token);
  try {
    const checklist = await client.dossier();
    await ports.ecrireCacheDossier(checklist);
    if (!dossierValide(checklist)) {
      return { ecran: 'dossier', dossier: checklist, edossard: null, depuisCache: false };
    }
    try {
      const reponse = await client.edossard();
      if (reponse.disponible) {
        await ports.ecrireCacheEdossard(reponse);
        return {
          ecran: 'edossard',
          dossier: checklist,
          edossard: { ...reponse },
          depuisCache: false,
        };
      }
      return { ecran: 'dossier', dossier: checklist, edossard: null, depuisCache: false };
    } catch (erreurEdossard) {
      if (erreurEdossard instanceof ApiErreur && erreurEdossard.sessionExpiree) {
        throw erreurEdossard;
      }
      // E-dossard injoignable mais dossier frais : cache e-dossard si présent
      // (bandeau — le QR vient du cache), sinon la checklist reste lisible.
      const cacheEdossard = await ports.lireCacheEdossard();
      if (cacheEdossard !== null) {
        return {
          ecran: 'edossard',
          dossier: checklist,
          edossard: cacheEdossard.donnees,
          depuisCache: true,
        };
      }
      return { ecran: 'dossier', dossier: checklist, edossard: null, depuisCache: false };
    }
  } catch (erreur) {
    if (erreur instanceof ApiErreur && erreur.sessionExpiree) {
      await ports.oublierSession();
      return { ...RECONNEXION_401 };
    }
    return servirDepuisCache(ports);
  }
}

/**
 * Démarrage : token présent ? session valide (401 → reconnexion, cache
 * conservé) ? puis chargement du dossier. Réseau coupé au contrôle : cache
 * servi, sinon écran première connexion.
 */
export async function demarrer(ports: PortsOrchestration): Promise<MiseAJourEcran> {
  const tokenStocke = await ports.lireToken();
  if (tokenStocke === null) {
    return { ecran: 'connexion', token: null, sessionExpiree: false };
  }
  let session: SessionApi;
  try {
    session = await ports.creerClient(tokenStocke).session();
    await ports.ecrireEtatSession({ email: session.email, role: session.role });
  } catch (erreur) {
    if (erreur instanceof ApiErreur && erreur.sessionExpiree) {
      await ports.oublierSession();
      return { ...RECONNEXION_401 };
    }
    return { token: tokenStocke, ...(await servirDepuisCache(ports)) };
  }
  return { token: tokenStocke, ...(await chargerDossier(ports, tokenStocke)) };
}

/**
 * Connexion fraîche (verify natif réussi) : si un AUTRE compte s'était
 * connecté sur cet appareil, les caches sont purgés AVANT le premier fetch ;
 * puis token + état de session posés, puis chargement. Une erreur de stockage
 * du token (refus keychain) remonte à l'appelant pour l'écran connexion.
 */
export async function connecter(
  ports: PortsOrchestration,
  token: string,
  email: string,
): Promise<MiseAJourEcran> {
  const precedent = await ports.lireEtatSession();
  if (precedent !== null && precedent.email !== null && precedent.email !== email) {
    await ports.purgerCache();
  }
  await ports.ecrireToken(token);
  await ports.ecrireEtatSession({ email, role: null });
  return { token, sessionExpiree: false, ...(await chargerDossier(ports, token)) };
}
