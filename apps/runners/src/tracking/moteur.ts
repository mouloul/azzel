import * as Location from 'expo-location';
import { INTERVALLE_POSITION_MS, POSITION_SCHEMA_VERSION, estPositionValide, type PositionTerrain } from '@azzel/shared';

import type { OutboxSuivi } from './outbox-sqlite';
import { outboxSuivi } from './outbox-sqlite';

// Story 6.2 — moteur de capture du suivi GPS. Opt-in EXPLICITE seulement :
// AUCUN watcher, AUCUNE insertion outbox tant que demarrerSuivi n'est pas
// appelé (l'écran ne l'appelle qu'après activation par le coureur —
// « Désactivé : rien n'est enregistré » est littéral). Fréquence FIXE 7 min,
// précision équilibrée (SM-C2 — jamais augmentée), deferredUpdates pour
// l'arrière-plan (dev build, plugin expo-location). Permission refusée →
// suivi silencieusement inactif : aucune culpabilisation, rétablissement
// possible depuis l'écran (et le guide 6.3 à venir).

export type EtatSuivi =
  | 'actif'
  /** Avant-plan SEUL accordé : capture tant que l'app vit, pas écran verrouillé. */
  | 'actif-avant-plan'
  /**
   * 6.3 — piège iOS « Autoriser une fois » : le suivi TOURNAIT et la
   * permission a expiré au verrouillage. Posé par l'orchestration (le
   * moteur seul ne peut pas le savoir) après arrêt du watcher mort.
   */
  | 'interrompu'
  | 'permission-refusee'
  | 'inactif';

/** Verdict des permissions : l'avant-plan seul n'est PAS un refus. */
export type PermissionsSuivi = 'accordees' | 'avant-plan' | 'refusees';

/** Lecture non intrusive (get* SANS request*) — détection premier plan 6.3. */
export interface PermissionsLues {
  avantPlanAccordee: boolean;
  arrierePlanAccordee: boolean;
}

export interface PositionCapturee {
  lat: number;
  lon: number;
  /** Heure appareil ISO UTC (donnée brute — AD-3). */
  capteA: string;
}

/** Options du watcher — deferredUpdates (batch arrière-plan iOS) incluses. */
export interface OptionsWatcherSuivi extends Location.LocationOptions {
  deferredUpdatesInterval?: number;
  deferredUpdatesTimeout?: number;
}

export interface DepsMoteurSuivi {
  /** Demande (foreground + arrière-plan) et rend le verdict réel. */
  demanderPermissions(): Promise<PermissionsSuivi>;
  /** watchPositionAsync natif — retourne un abonnement { remove() }. */
  watcher(
    options: OptionsWatcherSuivi,
    callback: (position: PositionCapturee) => void,
  ): Promise<{ remove(): void }>;
  lireAppareilId(): Promise<string>;
  outbox: OutboxSuivi;
  /** Déclenché APRÈS chaque insertion réussie (sync au retour capture). */
  surCapture?: () => void;
}

/** Position natif expo-location → position du contrat shared. */
export function versPositionTerrain(capture: PositionCapturee): PositionTerrain {
  return {
    version: POSITION_SCHEMA_VERSION,
    lat: capture.lat,
    lon: capture.lon,
    capteA: capture.capteA,
  };
}

export interface MoteurSuivi {
  demarrer(): Promise<EtatSuivi>;
  /**
   * 6.3 — reprise SANS demande de permission (aucun pop-up système) :
   * pose le watcher directement, l'appelant a DÉJÀ lu (get*) les
   * permissions accordées. Arrière-plan accordé → 'actif', sinon
   * 'actif-avant-plan'.
   */
  demarrerSansDemande(arrierePlanAccordee: boolean): Promise<EtatSuivi>;
  arreter(): void;
  /** True si un watcher vit (l'écran affiche l'état réel). */
  estActif(): boolean;
}

/** Timeout des deferred updates : garde-fou si le batch tarde (5 min). */
export const DEFERRED_UPDATES_TIMEOUT_MS = 5 * 60_000;

/**
 * Moteur pur (deps injectées — testé sans expo-location). La garde
 * estPositionValide précède TOUTE insertion : une position hors contrat
 * (lat 999, horodatage exotique) reste HORS outbox, elle n'existe pas.
 * Courses durcies : promesse de démarrage MÉMOÏSÉE (deux appels concurrents
 * = UN watcher), enCours réinitialisé sur rejet du watcher, abonnement
 * arrivé APRÈS un arreter() retiré immédiatement (jamais mémorisé).
 */
export function creerMoteurSuivi(deps: DepsMoteurSuivi): MoteurSuivi {
  let abonnement: { remove(): void } | null = null;
  // True du démarrage du watcher à l'arrêt : un callback qui arrive APRÈS un
  // arreter() (course native) ne doit plus RIEN insérer — et un callback qui
  // arrive AVANT la fin de l'await watcher doit être traité.
  let enCours = false;
  let dernierEtat: EtatSuivi | null = null;
  let demarrageEnCours: Promise<EtatSuivi> | null = null;

  /** Pose du watcher pour des permissions DÉJÀ accordées (chemin commun démarrer/demarrerSansDemande). */
  async function poserWatcher(
    permissions: Exclude<PermissionsSuivi, 'refusees'>,
  ): Promise<EtatSuivi> {
    const appareilId = await deps.lireAppareilId();
    enCours = true;
    let abonnementArrive: { remove(): void };
    try {
      abonnementArrive = await deps.watcher(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: INTERVALLE_POSITION_MS,
          deferredUpdatesInterval: INTERVALLE_POSITION_MS,
          deferredUpdatesTimeout: DEFERRED_UPDATES_TIMEOUT_MS,
        },
        (capture) => {
          if (!enCours) {
            return;
          }
          const position = versPositionTerrain(capture);
          if (!estPositionValide(position)) {
            // Position hors contrat : JAMAIS insérée — elle n'existe ni
            // côté app ni côté serveur.
            return;
          }
          let inseree = false;
          try {
            inseree = deps.outbox.enregistrerPosition(appareilId, position);
          } catch {
            // Exception SQLite native (stockage corrompu, disque plein) :
            // absorbée — le callback d'un watcher ne doit JAMAIS devenir
            // une exception non gérée au milieu de l'app.
            return;
          }
          if (inseree && deps.surCapture) {
            deps.surCapture();
          }
        },
      );
    } catch (erreur) {
      // Rejet du watcher : la porte est refermée — un prochain demarrer
      // repartira proprement au lieu de croire « enCours » à jamais.
      enCours = false;
      throw erreur;
    }
    if (!enCours) {
      // arreter() a été appelé PENDANT l'attente du watcher : cet
      // abonnement arrivé après l'arrêt est retiré immédiatement,
      // JAMAIS mémorisé.
      abonnementArrive.remove();
      return 'inactif';
    }
    abonnement = abonnementArrive;
    dernierEtat = permissions === 'avant-plan' ? 'actif-avant-plan' : 'actif';
    return dernierEtat;
  }

  /**
   * Démarrage MÉMOÏSÉ (deux appels concurrents = UN watcher) ; watcher
   * déjà vivant : son état est la vérité, jamais un second watcher.
   */
  async function enVol(travail: () => Promise<EtatSuivi>): Promise<EtatSuivi> {
    if (demarrageEnCours !== null) {
      return demarrageEnCours;
    }
    if (abonnement !== null && dernierEtat !== null) {
      return dernierEtat;
    }
    demarrageEnCours = travail();
    try {
      return await demarrageEnCours;
    } finally {
      demarrageEnCours = null;
    }
  }

  return {
    async demarrer(): Promise<EtatSuivi> {
      return enVol(async () => {
        const permissions = await deps.demanderPermissions();
        if (permissions === 'refusees') {
          // Refus = inactif silencieux : aucun watcher, aucune insertion,
          // aucune requête — le coureur réactive quand il veut.
          return 'permission-refusee';
        }
        return poserWatcher(permissions);
      });
    },

    async demarrerSansDemande(arrierePlanAccordee: boolean): Promise<EtatSuivi> {
      return enVol(() => poserWatcher(arrierePlanAccordee ? 'accordees' : 'avant-plan'));
    },

    arreter(): void {
      enCours = false;
      dernierEtat = null;
      if (abonnement !== null) {
        abonnement.remove();
        abonnement = null;
      }
    },

    estActif(): boolean {
      return abonnement !== null;
    },
  };
}

/** Watcher réel : watchPositionAsync natif (Balanced, 7 min, deferred). */
function watcherNative(
  options: OptionsWatcherSuivi,
  callback: (position: PositionCapturee) => void,
): Promise<{ remove(): void }> {
  // Les deferredUpdates* ne sont pas dans LocationOptions (API background
  // task) mais le natif les honore sur le watcher : passage structurel.
  return Location.watchPositionAsync(options as Location.LocationOptions, (loc) => {
    callback({
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      capteA: new Date(loc.timestamp ?? Date.now()).toISOString(),
    });
  });
}

/** Permissions réelles : avant-plan EXIGÉ, arrière-plan vérifié après demande. */
async function demanderPermissionsNatives(): Promise<PermissionsSuivi> {
  const avantPlan = await Location.requestForegroundPermissionsAsync();
  if (!avantPlan.granted) {
    return 'refusees';
  }
  // Arrière-plan meilleur effort : un REJET de la demande n'est pas un refus
  // du suivi — on lit ensuite la réalité via getBackgroundPermissionsAsync.
  await Location.requestBackgroundPermissionsAsync().catch(() => null);
  const arrierePlan = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return arrierePlan?.granted ? 'accordees' : 'avant-plan';
}

/**
 * 6.3 — lecture NON INTRUSIVE des permissions (get* uniquement, JAMAIS
 * request* : aucune pop-up système depuis ici — les demandes restent
 * déclenchées par le toggle opt-in). Réutilisable par l'orchestration au
 * retour au premier plan. TOTALE : échec natif → false, jamais d'exception.
 */
export async function lirePermissions(): Promise<PermissionsLues> {
  const [avantPlan, arrierePlan] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);
  return {
    avantPlanAccordee: avantPlan?.granted === true,
    arrierePlanAccordee: arrierePlan?.granted === true,
  };
}

/** Deps réelles de l'app (expo-location + outbox SQLite + suivi-store). */
export function creerDepsMoteurSuivi(options: {
  lireAppareilId: () => Promise<string>;
  surCapture?: () => void;
  outbox?: OutboxSuivi;
}): DepsMoteurSuivi {
  return {
    demanderPermissions: demanderPermissionsNatives,
    watcher: watcherNative,
    lireAppareilId: options.lireAppareilId,
    outbox: options.outbox ?? outboxSuivi,
    surCapture: options.surCapture,
  };
}
