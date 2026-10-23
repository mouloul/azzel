import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createErrorEnvelope } from '@azzel/shared';

import { ApiErreur } from './api-client';
import { purgerCache } from './offline-cache';

// Story 6.1 — état d'authentification de l'app : le token de session (secret)
// vit dans expo-secure-store (chiffré, jamais AsyncStorage), l'état de session
// (email/rôle — non sensible) en AsyncStorage pour un démarrage rapide.
// Deux purges distinctes :
// - oublierSession : 401/session révoquée → token jeté, CACHE CONSERVÉ ;
// - purgerAuth : logout explicite → token + état + caches.

const CLE_TOKEN = 'azzel.token';
const CLE_SESSION = 'azzel.session';

export interface EtatSession {
  email: string | null;
  role: string | null;
}

export async function lireToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CLE_TOKEN);
  } catch {
    return null;
  }
}

export async function ecrireToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CLE_TOKEN, token);
  } catch {
    // Refus keychain : erreur EXPLOITABLE (message + action) remontée à
    // l'écran connexion — jamais un rejet silencieux qui laisserait l'app
    // bloquée sur « chargement ».
    throw new ApiErreur(
      500,
      createErrorEnvelope({
        code: 'app.stockage_token_refuse',
        message: 'Impossible de garder ta session sur ce téléphone.',
        action: 'Réessaie de te connecter — si ça persiste, appelle l’équipe.',
      }),
      false,
    );
  }
}

export async function lireEtatSession(): Promise<EtatSession | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_SESSION);
    if (brut === null) {
      return null;
    }
    const valeur = JSON.parse(brut) as EtatSession;
    if (typeof valeur !== 'object' || valeur === null) {
      return null;
    }
    return valeur;
  } catch {
    return null;
  }
}

export async function ecrireEtatSession(etat: EtatSession): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_SESSION, JSON.stringify(etat));
  } catch {
    // Non bloquant : l'état se resynchronisera à la prochaine requête.
  }
}

/** Session expirée/révoquée (AD-5) : on jette le token, on GARDE le cache. */
export async function oublierSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CLE_TOKEN);
  } catch {}
  try {
    await AsyncStorage.removeItem(CLE_SESSION);
  } catch {}
}

/** Logout explicite : token + état de session + caches locaux. */
export async function purgerAuth(): Promise<void> {
  await oublierSession();
  await purgerCache();
}
