import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { outboxSuivi } from './outbox-sqlite';

// Story 6.2 — magasin du suivi : préférence opt-in (AsyncStorage, défausse
// « non »), jeton d'appareil du canal sync (SecureStore — secret), identifiant
// d'installation stable (AsyncStorage, UUID généré une fois). Purges :
// - oublierSession (401/AD-5) ne touche à RIEN d'ici — le jeton appareil et
//   la outbox SURVIVENT aux sessions ;
// - purgerSuivi (logout explicite / changement de compte) purge TOUT :
//   jeton, préférence, identifiant, outbox — rien du coureur précédent ne
//   fuit vers le suivant. Un échec de purge outbox REMONTE (booléen false)
//   pour un message honnête « déconnexion incomplète ».

const CLE_OPTIN = 'azzel.suivi.optin';
const CLE_JETON_APPAREIL = 'azzel.jeton_appareil';
const CLE_APPAREIL_CLIENT = 'azzel.appareil_client';

/** Opt-in EXPLICITE : rien n'est capturé tant que cette préférence n'est pas « 1 ». */
export async function lireOptin(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLE_OPTIN)) === '1';
  } catch {
    return false;
  }
}

/**
 * Pose la préférence — false si l'écriture échoue (l'écran ramène le toggle
 * à l'état réel et affiche le message : jamais un opt-in cru posé qui ne
 * l'est pas).
 */
export async function ecrireOptin(actif: boolean): Promise<boolean> {
  try {
    await AsyncStorage.setItem(CLE_OPTIN, actif ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

/** Jeton BRUT du canal sync (secret — SecureStore, jamais AsyncStorage). */
export async function lireJetonAppareil(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CLE_JETON_APPAREIL);
  } catch {
    return null;
  }
}

export async function ecrireJetonAppareil(jeton: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CLE_JETON_APPAREIL, jeton);
  } catch {
    // Refus keychain : la sync réessaiera l'enregistrement plus tard.
  }
}

/** Jeton jeté SANS purge de la outbox (ré-enregistrement propre). */
export async function oublierJetonAppareil(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CLE_JETON_APPAREIL);
  } catch {}
}

/**
 * UUID v4 de forme RFC 4122 (Math.random — unicité suffisante : ce n'est PAS
 * un secret, le jeton d'appareil 256 bits généré serveur l'est).
 */
function genererUuid(): string {
  const hexa = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hexa(8)}-${hexa(4)}-4${hexa(3)}-a${hexa(3)}-${hexa(12)}`;
}

/**
 * Repli STABLE en échec de stockage : mémoïsé en variable de module pour la
 * durée de vie de l'app — sinon chaque appel régénérerait un UUID différent
 * (clé de capture ≠ clé de sync → 400 permanent côté serveur).
 */
let uuidRepli: string | null = null;

/**
 * Identifiant d'installation STABLE : généré une fois, relu à l'identique
 * ensuite — il fonde la clé d'idempotence (appareil:capteA), le changer
 * casserait la continuité de la trace.
 */
export async function lireAppareilClient(generateur: () => string = genererUuid): Promise<string> {
  try {
    const existant = await AsyncStorage.getItem(CLE_APPAREIL_CLIENT);
    if (existant !== null && existant.trim().length > 0) {
      return existant;
    }
    const nouveau = generateur();
    await AsyncStorage.setItem(CLE_APPAREIL_CLIENT, nouveau);
    return nouveau;
  } catch {
    // Stockage refusé : identifiant de repli STABLE (mémoïsé) — la capture
    // ne doit pas planter l'app, et la clé reste cohérente capture ↔ sync.
    if (uuidRepli === null) {
      uuidRepli = generateur();
    }
    return uuidRepli;
  }
}

/** Tests uniquement : réinitialise le repli mémoïsé. */
export function reinitialiserUuidRepliPourTests(): void {
  uuidRepli = null;
}

/**
 * Purge TOTALE du suivi (logout explicite / changement de compte) : jeton,
 * préférence opt-in, identifiant d'installation, outbox ET journal.
 * Retourne false si la purge de l'outbox a ÉCHOUÉ — l'appelant affiche un
 * message honnête (« déconnexion incomplète ») au lieu d'un silence trompeur.
 */
export async function purgerSuivi(): Promise<boolean> {
  await oublierJetonAppareil();
  await Promise.allSettled([
    AsyncStorage.removeItem(CLE_OPTIN),
    AsyncStorage.removeItem(CLE_APPAREIL_CLIENT),
  ]);
  try {
    outboxSuivi.purgerOutbox();
    return true;
  } catch {
    return false;
  }
}
