import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChecklistState, EdossardState, ReponseEdossardApi } from '@azzel/shared';

// Story 6.1 — cache local (AsyncStorage) du dossier et de l'e-dossard : la
// course vit dans des zones blanches, l'app doit rester lisible réseau coupé
// (l'e-dossard doit survivre 30 jours). L'écriture se fait après chaque
// succès réseau ; la lecture sert les écrans quand le réseau manque ; la
// purge n'a lieu qu'au logout explicite — un 401 ne vide JAMAIS ce cache.

const CLE_DOSSIER = 'azzel.cache.dossier';
const CLE_EDOSSARD = 'azzel.cache.edossard';

export interface EntreeCache<T> {
  /** ISO 8601 UTC de la dernière synchronisation réussie. */
  recuLe: string;
  donnees: T;
}

/** E-dossard cachable : uniquement l'état disponible (le QR doit rester lisible). */
export type EdossardCache = EdossardState & { payloadQr: string };

function maintenantIso(): string {
  return new Date().toISOString();
}

async function lire<T>(cle: string): Promise<EntreeCache<T> | null> {
  try {
    const brut = await AsyncStorage.getItem(cle);
    if (brut === null) {
      return null;
    }
    const valeur = JSON.parse(brut) as EntreeCache<T>;
    if (
      typeof valeur !== 'object' ||
      valeur === null ||
      typeof valeur.recuLe !== 'string' ||
      valeur.donnees === undefined ||
      valeur.donnees === null
    ) {
      return null;
    }
    return valeur;
  } catch {
    // Cache corrompu : considéré absent, jamais d'écran bloqué.
    return null;
  }
}

async function ecrire<T>(cle: string, donnees: T): Promise<void> {
  const entree: EntreeCache<T> = { recuLe: maintenantIso(), donnees };
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(entree));
  } catch {
    // Écriture impossible (stockage plein) : le cache précédent reste en place.
  }
}

export async function lireCacheDossier(): Promise<EntreeCache<ChecklistState> | null> {
  return lire<ChecklistState>(CLE_DOSSIER);
}

export async function ecrireCacheDossier(dossier: ChecklistState): Promise<void> {
  await ecrire(CLE_DOSSIER, dossier);
}

export async function lireCacheEdossard(): Promise<EntreeCache<EdossardCache> | null> {
  return lire<EdossardCache>(CLE_EDOSSARD);
}

/**
 * Ne met en cache QUE l'e-dossard disponible : « pas encore validé » n'a pas
 * de valeur hors-ligne (le QR prêt, si).
 */
export async function ecrireCacheEdossard(reponse: ReponseEdossardApi): Promise<void> {
  if (!reponse.disponible) {
    return;
  }
  const { disponible: _disponible, ...etat } = reponse;
  await ecrire(CLE_EDOSSARD, etat);
}

/** Purge explicite (logout uniquement) — jamais sur un simple 401. */
export async function purgerCache(): Promise<void> {
  await Promise.allSettled([AsyncStorage.removeItem(CLE_DOSSIER), AsyncStorage.removeItem(CLE_EDOSSARD)]);
}
