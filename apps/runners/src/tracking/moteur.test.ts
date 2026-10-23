import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERVALLE_POSITION_MS, type PositionTerrain } from '@azzel/shared';

import {
  DEFERRED_UPDATES_TIMEOUT_MS,
  creerMoteurSuivi,
  versPositionTerrain,
  type OptionsWatcherSuivi,
  type PermissionsSuivi,
  type PositionCapturee,
} from './moteur';
import type { OutboxSuivi } from './outbox-sqlite';

// Story 6.2 — tests du moteur de capture (expo-location mocké) : opt-in
// strict (aucun watcher ni insertion hors demarrerSuivi), options
// Balanced + timeInterval 7 min + deferredUpdates VÉRIFIÉES (SM-C2), garde
// estPositionValide AVANT toute insertion, permission refusée → inactif
// silencieux, avant-plan seul → état dédié, courses durcies : démarrages
// concurrents (UN watcher), rejet du watcher (état réinitialisé), arreter
// pendant l'attente (abonnement tardif retiré), exception SQLite absorbée.

const locationMock = vi.hoisted(() => ({
  Accuracy: { Balanced: 3, High: 4, Highest: 5, Low: 2, Lowest: 1 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  requestForegroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(),
  watchPositionAsync: vi.fn(),
}));

vi.mock('expo-location', () => locationMock);

// moteur.ts embarque la outbox réelle par défaut : en node, expo-sqlite
// n'existe pas (natif) — un stub suffit, le harnais injecte la sienne.
vi.mock('./outbox-sqlite', () => ({ outboxSuivi: {} }));

interface AbonnementFake {
  remove: ReturnType<typeof vi.fn>;
}

interface OptionsHarness {
  permissions?: PermissionsSuivi;
  /** Watcher lent : ne résout qu'à resolve() — pour tester les courses. */
  watcherDiffere?: boolean;
}

function creerHarness(options: OptionsHarness = {}) {
  const enregistrerPosition = vi.fn(
    (_appareilId: string, _position: PositionTerrain): boolean => true,
  );
  const outbox = { enregistrerPosition } as unknown as OutboxSuivi;
  const surCapture = vi.fn();
  const abonnement: AbonnementFake = { remove: vi.fn() };
  let callbackCapture: ((position: PositionCapturee) => void) | null = null;
  let resoudreWatcher: ((abonnement: { remove(): void }) => void) | null = null;
  const optionsVues: OptionsWatcherSuivi[] = [];

  locationMock.requestForegroundPermissionsAsync.mockResolvedValue(
    options.permissions === 'refusees'
      ? { granted: false, status: 'denied' }
      : { granted: true, status: 'granted' },
  );
  locationMock.requestBackgroundPermissionsAsync.mockResolvedValue({
    granted: options.permissions === 'accordees',
    status: options.permissions === 'accordees' ? 'granted' : 'denied',
  });
  locationMock.getBackgroundPermissionsAsync.mockResolvedValue({
    granted: options.permissions === 'accordees',
    status: options.permissions === 'accordees' ? 'granted' : 'denied',
  });
  locationMock.watchPositionAsync.mockImplementation(
    async (_opts: unknown, callback: (position: PositionCapturee) => void) => {
      callbackCapture = callback;
      return abonnement;
    },
  );

  const moteur = creerMoteurSuivi({
    demanderPermissions: async () => options.permissions ?? 'accordees',
    watcher: async (opts, callback) => {
      optionsVues.push(opts);
      callbackCapture = callback;
      if (options.watcherDiffere) {
        return new Promise<{ remove(): void }>((resolve) => {
          resoudreWatcher = resolve;
        });
      }
      return abonnement as unknown as { remove(): void };
    },
    lireAppareilId: async () => 'app-moteur-1',
    outbox,
    surCapture,
  });
  return {
    moteur,
    enregistrerPosition,
    surCapture,
    abonnement,
    optionsVues,
    /** Laisse le moteur atteindre le poser du watcher (microtasks). */
    attendreWatcherPose: async () => {
      while (resoudreWatcher === null) {
        await Promise.resolve();
      }
    },
    libererWatcher: () => {
      resoudreWatcher?.(abonnement as unknown as { remove(): void });
    },
    capturer: (position: PositionCapturee) => {
      if (callbackCapture === null) {
        throw new Error('watcher non démarré');
      }
      callbackCapture(position);
    },
  };
}

function capture(surcharge: Partial<PositionCapturee> = {}): PositionCapturee {
  return { lat: 36.712345, lon: 3.187654, capteA: '2027-05-16T07:05:09.000Z', ...surcharge };
}

beforeEach(() => {
  locationMock.requestForegroundPermissionsAsync.mockReset();
  locationMock.requestBackgroundPermissionsAsync.mockReset();
  locationMock.getBackgroundPermissionsAsync.mockReset();
  locationMock.watchPositionAsync.mockReset();
});

describe('activation (opt-in explicite)', () => {
  it('demarrer : watcher Balanced + timeInterval 7 min + deferredUpdates, état actif', async () => {
    const harness = creerHarness();
    const etat = await harness.moteur.demarrer();
    expect(etat).toBe('actif');
    expect(harness.moteur.estActif()).toBe(true);
    expect(harness.surCapture).not.toHaveBeenCalled();
  });

  it('options du watcher VÉRIFIÉES : Balanced, 7 min, deferredUpdatesInterval 7 min, timeout 5 min', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();
    expect(harness.optionsVues).toHaveLength(1);
    expect(harness.optionsVues[0]).toEqual({
      accuracy: locationMock.Accuracy.Balanced,
      timeInterval: INTERVALLE_POSITION_MS,
      deferredUpdatesInterval: INTERVALLE_POSITION_MS,
      deferredUpdatesTimeout: DEFERRED_UPDATES_TIMEOUT_MS,
    });
    expect(DEFERRED_UPDATES_TIMEOUT_MS).toBe(5 * 60_000);
  });

  it('la 1ʳᵉ position capturée → 1 ligne outbox + surCapture déclenché', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();

    harness.capturer(capture());

    expect(harness.enregistrerPosition).toHaveBeenCalledTimes(1);
    expect(harness.enregistrerPosition).toHaveBeenCalledWith(
      'app-moteur-1',
      versPositionTerrain(capture()),
    );
    expect(harness.surCapture).toHaveBeenCalledTimes(1);
  });

  it('2 ticks à 7 min : 2 insertions, clés appareil:capteA distinctes', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();

    harness.capturer(capture({ capteA: '2027-05-16T07:05:09.000Z' }));
    harness.capturer(capture({ capteA: '2027-05-16T07:12:09.000Z' }));

    const premier = harness.enregistrerPosition.mock.calls[0]?.[1] as PositionTerrain;
    const second = harness.enregistrerPosition.mock.calls[1]?.[1] as PositionTerrain;
    expect(premier.capteA).not.toBe(second.capteA);
  });
});

describe('permissions — verdict réel, trois états', () => {
  it('refusées : aucun watcher, aucune insertion, état permission-refusee', async () => {
    const harness = creerHarness({ permissions: 'refusees' });
    const etat = await harness.moteur.demarrer();
    expect(etat).toBe('permission-refusee');
    expect(harness.moteur.estActif()).toBe(false);
    expect(harness.optionsVues).toHaveLength(0);
    expect(harness.enregistrerPosition).not.toHaveBeenCalled();
    expect(harness.surCapture).not.toHaveBeenCalled();
  });

  it('avant-plan SEUL : watcher posé mais état DÉDIÉ actif-avant-plan', async () => {
    const harness = creerHarness({ permissions: 'avant-plan' });
    const etat = await harness.moteur.demarrer();
    expect(etat).toBe('actif-avant-plan');
    expect(harness.moteur.estActif()).toBe(true);
    // La capture vit (l'app ouverte) — c'est énoncé honnêtement à l'écran.
    harness.capturer(capture());
    expect(harness.enregistrerPosition).toHaveBeenCalledTimes(1);
  });
});

describe('courses durcies', () => {
  it('deux démarrages CONCURRENTS : UNE SEULE promesse, UN SEUL watcher', async () => {
    const harness = creerHarness({ watcherDiffere: true });
    const premierEssai = harness.moteur.demarrer();
    const secondEssai = harness.moteur.demarrer();
    await harness.attendreWatcherPose();
    harness.libererWatcher();
    const [premier, second] = await Promise.all([premierEssai, secondEssai]);
    // Même promesse memoïsée : les deux voient le même résultat.
    expect(premier).toBe('actif');
    expect(second).toBe('actif');
    expect(harness.optionsVues).toHaveLength(1);
  });

  it('rejet du watcher : la promesse rejette ET un nouveau demarrer repart proprement', async () => {
    const enregistrerPosition = vi.fn((): boolean => true);
    const outbox = { enregistrerPosition } as unknown as OutboxSuivi;
    let tentatives = 0;
    const moteur = creerMoteurSuivi({
      demanderPermissions: async () => 'accordees' as const,
      watcher: async () => {
        tentatives += 1;
        if (tentatives === 1) {
          throw new Error('watcher KO');
        }
        return { remove: () => {} };
      },
      lireAppareilId: async () => 'app-1',
      outbox,
    });
    await expect(moteur.demarrer()).rejects.toThrow('watcher KO');
    expect(moteur.estActif()).toBe(false);
    // enCours réinitialisé : le second démarrage repose un watcher.
    const etat = await moteur.demarrer();
    expect(etat).toBe('actif');
    expect(tentatives).toBe(2);
  });

  it('arreter PENDANT l’attente du watcher : abonnement tardif RETIRÉ immédiatement, jamais mémorisé', async () => {
    const harness = creerHarness({ watcherDiffere: true });
    const demarrage = harness.moteur.demarrer();
    await harness.attendreWatcherPose();
    // Logout/désactivation pendant que le watcher se pose.
    harness.moteur.arreter();
    harness.libererWatcher();
    const etat = await demarrage;
    expect(etat).toBe('inactif');
    expect(harness.abonnement.remove).toHaveBeenCalledTimes(1);
    expect(harness.moteur.estActif()).toBe(false);
  });

  it('exception SQLite dans le callback : absorbée, jamais non gérée, surCapture muet', async () => {
    const enregistrerPosition = vi.fn(() => {
      throw new Error('sqlite: disk I/O error');
    });
    const outbox = { enregistrerPosition } as unknown as OutboxSuivi;
    const surCapture = vi.fn();
    const moteur = creerMoteurSuivi({
      demanderPermissions: async () => 'accordees' as const,
      watcher: async (_options, callback) => {
        // Capture immédiate DANS le poser du watcher (course native réelle).
        callback(capture());
        return { remove: () => {} };
      },
      lireAppareilId: async () => 'app-1',
      outbox,
      surCapture,
    });
    const etat = await moteur.demarrer();
    expect(etat).toBe('actif');
    expect(enregistrerPosition).toHaveBeenCalledTimes(1);
    expect(surCapture).not.toHaveBeenCalled();
  });

  it('callback APRÈS arreter() : n’insère RIEN (garde enCours)', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();
    harness.moteur.arreter();
    harness.capturer(capture());
    expect(harness.enregistrerPosition).not.toHaveBeenCalled();
  });

  it('redémarrage après arrêt : UN NOUVEAU watcher est posé', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();
    harness.moteur.arreter();
    const etat = await harness.moteur.demarrer();
    expect(etat).toBe('actif');
    expect(harness.optionsVues).toHaveLength(2);
  });
});

describe('désactivation — littéralement rien', () => {
  it('jamais démarré : aucune insertion, aucune requête, aucun watcher', () => {
    const harness = creerHarness();
    expect(harness.moteur.estActif()).toBe(false);
    expect(harness.enregistrerPosition).not.toHaveBeenCalled();
  });
});

describe('garde contrat AVANT insertion', () => {
  it('lat 999 : jamais insérée (reste hors outbox)', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();

    harness.capturer(capture({ lat: 999 }));

    expect(harness.enregistrerPosition).not.toHaveBeenCalled();
    expect(harness.surCapture).not.toHaveBeenCalled();
  });

  it('capteA sans Z (piège de fuseau) : jamais insérée', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();

    harness.capturer(capture({ capteA: '2027-05-16T07:05:09' }));

    expect(harness.enregistrerPosition).not.toHaveBeenCalled();
  });

  it('NaN : jamais inséré', async () => {
    const harness = creerHarness();
    await harness.moteur.demarrer();

    harness.capturer(capture({ lon: Number.NaN }));

    expect(harness.enregistrerPosition).not.toHaveBeenCalled();
  });
});

describe('versPositionTerrain', () => {
  it('capture natif → contrat shared (version exacte)', () => {
    expect(versPositionTerrain(capture())).toEqual({
      version: 1,
      lat: 36.712345,
      lon: 3.187654,
      capteA: '2027-05-16T07:05:09.000Z',
    });
  });
});
