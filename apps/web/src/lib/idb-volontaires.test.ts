import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ANNUAIRE_SCHEMA_VERSION,
  cleIdempotenceEvenement,
  cleIdempotencePassage,
  cleIdempotenceRetrait,
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  type AnnuaireEdition,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import type { MissionVolontaireView } from '@/modules/missions/service';

import {
  IDB_CLE_COURANT,
  IDB_NOM_BASE,
  IDB_STORE_ANNUAIRE,
  IDB_STORE_APPAREIL,
  IDB_STORE_ENVOYES,
  IDB_STORE_ETAT,
  IDB_STORE_JOURNAL,
  IDB_STORE_OUTBOX,
  IDB_VERSION,
  JOURNAL_SYNC_MAX_ENTREES,
  effacerEtatVolontaires,
  ajouterEntreeJournal,
  ajouterPassage,
  ajouterRetrait,
  cleIndexPassage,
  compterEnAttente,
  ecrireAnnuaire,
  ecrireEtatVolontaires,
  enregistrerJetonSync,
  lireAnnuaire,
  lireEtatVolontaires,
  lireJournal,
  lireJetonSync,
  lireEtatFileAttente,
  listerEvenementsASynchroniser,
  listerPassages,
  listerRetraits,
  obtenirAppareilId,
  passagesParJetonCheckpoint,
  retraitsParJeton,
  marquerEnvoyes,
  type EntreeJournalSync,
  type EtatVolontaires,
} from './idb-volontaires';

// Stories 3.3/3.4/4.3/4.4 — tests du wrapper IndexedDB : aller-retour
// écriture/lecture (etat ET annuaire), SSR-safe sans indexedDB (node), clé
// unique « courant » (le dernier sync gagne), upgrades successives SANS
// toucher aux stores précédents (v1→v2 annuaire, v2→v3 outbox+appareil),
// outbox append-only idempotent (clé d'idempotence en keyPath), appareilId
// stable, purge logout conservatrice (AD-5), passages au même store avec
// préfixe de clé distinct (4.4). Le stub maison imite le strict contrat
// utilisé : open + upgrade, transaction → objectStore → get/put/add/getAll/
// clear, requêtes promessifiées.

interface RequeteFactice<T> {
  result: T | undefined;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

function creerIndexedDbMemoire() {
  const stores = new Map<string, Map<string, unknown>>();
  const keyPaths = new Map<string, string>();
  const suppressions: string[] = [];
  let fermetures = 0;
  // Version de la base « sur disque » : 0 = neuve, 1 = époque 3.3, 2 = 3.4,
  // 3 = époque 4.3 (outbox + appareil).
  let versionBase = 0;

  // Sérialisation des transactions readwrite PAR store (contrat réel : une
  // seule écriture à la fois sur un store, même entre connexions — c'est ce
  // qui rend obtenirAppareilId atomique). Le verrou se libère un macrotask
  // après acquisition : les microtâches de la transaction (lecture puis
  // écriture chaînées) terminent avant que la suivante ne démarre.
  const verrous = new Map<string, Promise<void>>();

  const requete = <T>(): RequeteFactice<T> => ({
    result: undefined,
    error: undefined,
    onsuccess: null,
    onerror: null,
  });

  const base = {
    objectStoreNames: { contains: (nom: string) => stores.has(nom) },
    createObjectStore: (nom: string, options?: { keyPath?: string }) => {
      stores.set(nom, stores.get(nom) ?? new Map());
      keyPaths.set(nom, options?.keyPath ?? 'id');
    },
    transaction: (nom: string, mode?: IDBTransactionMode) => {
      const acquis =
        mode === 'readwrite' ? (verrous.get(nom) ?? Promise.resolve()) : Promise.resolve();
      if (mode === 'readwrite') {
        verrous.set(
          nom,
          acquis.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
        );
      }
      const apres = (travail: () => void): void => {
        void acquis.then(() => queueMicrotask(travail));
      };
      return {
        objectStore: (nomStore: string) => ({
          get: (cle: string) => {
            const r = requete<unknown>();
            apres(() => {
              r.result = stores.get(nomStore)?.get(cle);
              r.onsuccess?.();
            });
            return r;
          },
          put: (valeur: Record<string, unknown>) => {
            const r = requete<string>();
            apres(() => {
              const cle = String(valeur[keyPaths.get(nomStore) ?? 'id'] ?? '');
              stores.get(nomStore)?.set(cle, valeur);
              r.result = cle;
              r.onsuccess?.();
            });
            return r;
          },
          add: (valeur: Record<string, unknown>) => {
            const r = requete<string>();
            apres(() => {
              const cle = String(valeur[keyPaths.get(nomStore) ?? 'id'] ?? '');
              const store = stores.get(nomStore);
              if (store !== undefined && store.has(cle)) {
                // Contrat réel : add sur clé existante → ConstraintError.
                r.error = Object.assign(new Error('clé déjà présente'), {
                  name: 'ConstraintError',
                });
                r.onerror?.();
                return;
              }
              store?.set(cle, valeur);
              r.result = cle;
              r.onsuccess?.();
            });
            return r;
          },
          getAll: () => {
            const r = requete<unknown[]>();
            apres(() => {
              r.result = [...(stores.get(nomStore)?.values() ?? [])];
              r.onsuccess?.();
            });
            return r;
          },
          clear: () => {
            const r = requete<undefined>();
            apres(() => {
              stores.get(nomStore)?.clear();
              r.onsuccess?.();
            });
            return r;
          },
          delete: (cle: string) => {
            const r = requete<undefined>();
            apres(() => {
              stores.get(nomStore)?.delete(cle);
              r.onsuccess?.();
            });
            return r;
          },
        }),
      };
    },
    close: () => {
      fermetures += 1;
    },
  };

  const fabrique = {
    open: (nom: string, version?: number) => {
      expect(nom).toBe(IDB_NOM_BASE);
      expect(version).toBe(IDB_VERSION);
      const r: RequeteFactice<typeof base> & { onupgradeneeded: (() => void) | null } = {
        ...requete<typeof base>(),
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        // Contrat réel : result est posé AVANT upgradeneeded/success, et
        // l'upgrade ne part QUE si la version demandée dépasse celle du disque.
        r.result = base;
        if ((version ?? 1) > versionBase) {
          versionBase = version ?? 1;
          r.onupgradeneeded?.();
        }
        r.onsuccess?.();
      });
      return r as unknown as IDBOpenDBRequest;
    },
    deleteDatabase: (nom: string) => {
      suppressions.push(nom);
      const r = requete<undefined>();
      queueMicrotask(() => {
        stores.clear();
        versionBase = 0;
        r.onsuccess?.();
      });
      return r as unknown as IDBOpenDBRequest;
    },
  };

  /** Simule une base restée en v1 (épopée 3.3) : store etat déjà peuplé. */
  const semerBaseV1 = (etat: EtatVolontaires): void => {
    versionBase = 1;
    const store = new Map<string, unknown>();
    store.set(IDB_CLE_COURANT, { ...etat, id: IDB_CLE_COURANT });
    stores.set(IDB_STORE_ETAT, store);
    keyPaths.set(IDB_STORE_ETAT, 'id');
  };

  /** Simule une base restée en v2 (épopée 3.4) : etat + annuaire peuplés. */
  const semerBaseV2 = (etat: EtatVolontaires, annuaire: AnnuaireEdition): void => {
    versionBase = 2;
    const etatStore = new Map<string, unknown>();
    etatStore.set(IDB_CLE_COURANT, { ...etat, id: IDB_CLE_COURANT });
    stores.set(IDB_STORE_ETAT, etatStore);
    keyPaths.set(IDB_STORE_ETAT, 'id');
    const annuaireStore = new Map<string, unknown>();
    annuaireStore.set(IDB_CLE_COURANT, { ...annuaire, id: IDB_CLE_COURANT });
    stores.set(IDB_STORE_ANNUAIRE, annuaireStore);
    keyPaths.set(IDB_STORE_ANNUAIRE, 'id');
  };

  /** Simule une base restée en v3 (épopée 4.3/4.4) : + outbox et appareil. */
  const semerBaseV3 = (appareilId: string, ...outbox: Record<string, unknown>[]): void => {
    versionBase = 3;
    const etatStore = new Map<string, unknown>();
    etatStore.set(IDB_CLE_COURANT, { ...etatExemple('2026-10-22T08:00:00.000Z'), id: IDB_CLE_COURANT });
    stores.set(IDB_STORE_ETAT, etatStore);
    keyPaths.set(IDB_STORE_ETAT, 'id');
    const annuaireStore = new Map<string, unknown>();
    annuaireStore.set(
      IDB_CLE_COURANT,
      { ...annuaireExemple('2026-10-22T08:00:00.000Z'), id: IDB_CLE_COURANT },
    );
    stores.set(IDB_STORE_ANNUAIRE, annuaireStore);
    keyPaths.set(IDB_STORE_ANNUAIRE, 'id');
    const outboxStore = new Map<string, unknown>();
    for (const enregistrement of outbox) {
      outboxStore.set(String(enregistrement.cle ?? ''), enregistrement);
    }
    stores.set(IDB_STORE_OUTBOX, outboxStore);
    keyPaths.set(IDB_STORE_OUTBOX, 'cle');
    const appareilStore = new Map<string, unknown>();
    appareilStore.set(IDB_CLE_COURANT, { id: IDB_CLE_COURANT, appareilId });
    stores.set(IDB_STORE_APPAREIL, appareilStore);
    keyPaths.set(IDB_STORE_APPAREIL, 'id');
  };

  return {
    fabrique,
    stores,
    fermetures: () => fermetures,
    suppressions,
    semerBaseV1,
    semerBaseV2,
    semerBaseV3,
  };
}

const MISSION: MissionVolontaireView = {
  id: 'mission-1',
  secteurNom: 'Village',
  secteurLieu: 'Place du village',
  secteurContact: '+213 555 010 203',
  type: 'accueil',
  typeLabel: 'Accueil',
  titre: 'Accueil village',
  debutLe: '2027-05-16T06:00:00.000Z',
  finLe: '2027-05-16T12:00:00.000Z',
  consignes: 'Arrive 15 min avant.',
  estArrivee: false,
  couverture: 'couverte',
  couvertureLabel: 'Couverte',
};

function etatExemple(generéA: string): EtatVolontaires {
  return {
    editionNom: 'Édition 2027',
    assistancePhone: '+213 555 010 200',
    mesMissions: [MISSION],
    missions: [MISSION],
    generéA,
  };
}

function annuaireExemple(genereA: string): AnnuaireEdition {
  return {
    version: ANNUAIRE_SCHEMA_VERSION,
    editionId: 'edition-1',
    genereA,
    coureurs: [
      // Story 4.1 — contrat v2 : jeton base64url 22 caractères par coureur.
      {
        dossard: 1,
        nom: 'Ulahianne',
        prenom: 'Yani',
        jeton: 'jeton-coureur-1-aaaaaa',
      },
      {
        dossard: 12,
        nom: 'Cherchée',
        prenom: 'Iness',
        jeton: 'jeton-coureur-12-aaaaa',
      },
    ],
  };
}

const APPAREIL = 'appareil-test-1';

function retraitExemple(surcharge: Partial<RetraitTerrain> = {}): RetraitTerrain {
  return {
    version: RETRAIT_SCHEMA_VERSION,
    type: 'retrait',
    editionId: 'edition-1',
    jeton: 'jeton-coureur-1-aaaaaa',
    horodatage: '2027-05-16T06:12:30.000Z',
    appareilId: APPAREIL,
    ...surcharge,
  };
}

const CHECKPOINT_KM12 = 'mission-scan-km12';
const CHECKPOINT_KM30 = 'mission-scan-km30';

function passageExemple(surcharge: Partial<PassageTerrain> = {}): PassageTerrain {
  return {
    version: PASSAGE_SCHEMA_VERSION,
    type: 'passage',
    editionId: 'edition-1',
    jeton: 'jeton-coureur-1-aaaaaa',
    checkpointId: CHECKPOINT_KM12,
    horodatage: '2027-05-16T07:05:09.000Z',
    appareilId: APPAREIL,
    ...surcharge,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lireEtatVolontaires / ecrireEtatVolontaires — IndexedDB', () => {
  it('SSR-safe : sans indexedDB, lire → null et écrire → false, sans exception', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(lireEtatVolontaires()).resolves.toBeNull();
    await expect(ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'))).resolves.toBe(
      false,
    );
  });

  it('aller-retour : l’état écrit est relu à l’identique, la clé interne retirée', async () => {
    const { fabrique, stores, fermetures } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    const ecrit = await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    expect(ecrit).toBe(true);

    const enregistrement = stores.get(IDB_STORE_ETAT)?.get(IDB_CLE_COURANT) as Record<
      string,
      unknown
    >;
    expect(enregistrement.id).toBe(IDB_CLE_COURANT);

    const lu = await lireEtatVolontaires();
    expect(lu).toEqual(etatExemple('2026-10-22T08:00:00.000Z'));
    expect(Object.keys(lu ?? {})).not.toContain('id');
    // La connexion est refermée après chaque opération (pas de fuite).
    expect(fermetures()).toBeGreaterThanOrEqual(2);
  });

  it('le dernier sync gagne : réécriture puis relecture de la valeur fraîche', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    await ecrireEtatVolontaires(etatExemple('2026-10-22T09:30:00.000Z'));

    await expect(lireEtatVolontaires()).resolves.toEqual(etatExemple('2026-10-22T09:30:00.000Z'));
  });

  it('base vide : lecture → null, jamais d’exception', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await expect(lireEtatVolontaires()).resolves.toBeNull();
  });

  it('stockage défaillant : les erreurs sont absorbées (false/null, pas d’exception)', async () => {
    const fabriqueFausse: IDBFactory = {
      open: () => {
        const r: RequeteFactice<unknown> & { onupgradeneeded: (() => void) | null } = {
          result: undefined,
          error: undefined,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => {
          r.error = new Error('quota');
          r.onerror?.();
        });
        return r as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory;
    vi.stubGlobal('indexedDB', fabriqueFausse);
    await expect(lireEtatVolontaires()).resolves.toBeNull();
    await expect(ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'))).resolves.toBe(
      false,
    );
  });

  it('enregistrement corrompu (autre schéma) : lecture → null, jamais de fiche cassée', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const store = new Map<string, unknown>();
    store.set(IDB_CLE_COURANT, { id: IDB_CLE_COURANT, nimporte: 'quoi' });
    stores.set(IDB_STORE_ETAT, store);
    await expect(lireEtatVolontaires()).resolves.toBeNull();

    store.set(IDB_CLE_COURANT, {
      id: IDB_CLE_COURANT,
      editionNom: 'Édition 2027',
      assistancePhone: '+213 555 010 200',
      mesMissions: [MISSION],
      // missions manquant + generéA non chaîne : schéma invalide aussi.
      missions: 'pas-un-tableau',
      generéA: 42,
    });
    await expect(lireEtatVolontaires()).resolves.toBeNull();
  });
});

describe('lireAnnuaire / ecrireAnnuaire — store dédié v2 (story 3.4)', () => {
  it('SSR-safe : sans indexedDB, lire → null et écrire → false, sans exception', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(lireAnnuaire()).resolves.toBeNull();
    await expect(ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'))).resolves.toBe(
      false,
    );
  });

  it('aller-retour dans le store annuaire : clé « courant », clé interne retirée à la lecture', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    expect(await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'))).toBe(true);

    const enregistrement = stores.get(IDB_STORE_ANNUAIRE)?.get(IDB_CLE_COURANT) as Record<
      string,
      unknown
    >;
    expect(enregistrement.id).toBe(IDB_CLE_COURANT);
    // L'état missions reste dans SON store : aucune confusion des deux poches
    // (le store etat existe — créé par l'upgrade — mais reste vide).
    expect(stores.get(IDB_STORE_ETAT)?.has(IDB_CLE_COURANT) ?? false).toBe(false);

    const lu = await lireAnnuaire();
    expect(lu).toEqual(annuaireExemple('2026-10-22T08:00:00.000Z'));
    expect(Object.keys(lu ?? {})).not.toContain('id');
  });

  it('upgrade v1 → v2 : le store annuaire est créé SANS toucher « etat »', async () => {
    const { fabrique, stores, semerBaseV1 } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const etatV1 = etatExemple('2026-10-20T08:00:00.000Z');
    semerBaseV1(etatV1);

    // Toute opération réouvre la base en v3 : l'upgrade part, crée « annuaire »…
    expect(await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'))).toBe(true);
    expect(stores.has(IDB_STORE_ANNUAIRE)).toBe(true);
    // …et l'état v1 (données ET store) survit intact.
    await expect(lireEtatVolontaires()).resolves.toEqual(etatV1);

    // Base neuve (v0) : tous les stores sont créés d'un coup.
    const neuve = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', neuve.fabrique);
    expect(await ecrireEtatVolontaires(etatV1)).toBe(true);
    expect(neuve.stores.has(IDB_STORE_ETAT)).toBe(true);
    expect(neuve.stores.has(IDB_STORE_ANNUAIRE)).toBe(true);
    expect(neuve.stores.has(IDB_STORE_OUTBOX)).toBe(true);
    expect(neuve.stores.has(IDB_STORE_APPAREIL)).toBe(true);
  });

  it('réécriture : le dernier annuaire synchronisé gagne', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'));
    await ecrireAnnuaire(annuaireExemple('2026-10-22T09:30:00.000Z'));
    const lu = await lireAnnuaire();
    expect(lu?.genereA).toBe('2026-10-22T09:30:00.000Z');
  });

  it('annuaire hors contrat : écriture refusée (false), rien en poche', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const invalide = {
      ...annuaireExemple('2026-10-22T08:00:00.000Z'),
      coureurs: [
        { dossard: 7, nom: 'Doublon', prenom: 'Un', jeton: 'jeton-doublon-1-aaaaaa' },
        { dossard: 7, nom: 'Doublon', prenom: 'Deux', jeton: 'jeton-doublon-2-aaaaaa' },
      ],
    };
    expect(await ecrireAnnuaire(invalide)).toBe(false);
    expect(stores.get(IDB_STORE_ANNUAIRE)?.has(IDB_CLE_COURANT) ?? false).toBe(false);
    // Version inconnue aussi : la poche ne stocke qu'un contrat identifié.
    expect(
      await ecrireAnnuaire({
        ...annuaireExemple('2026-10-22T08:00:00.000Z'),
        version: 99 as unknown as AnnuaireEdition['version'],
      }),
    ).toBe(false);
  });

  it('enregistrement corrompu : lecture → null, jamais d’annuaire cassé', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const store = new Map<string, unknown>();
    store.set(IDB_CLE_COURANT, { id: IDB_CLE_COURANT, nimporte: 'quoi' });
    stores.set(IDB_STORE_ANNUAIRE, store);
    await expect(lireAnnuaire()).resolves.toBeNull();
  });
});

describe('outbox + appareil — stores v3 (story 4.3)', () => {
  it('upgrade v2 → v3 : outbox et appareil créés SANS toucher etat/annuaire', async () => {
    const { fabrique, stores, semerBaseV2 } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const etatV2 = etatExemple('2026-10-20T08:00:00.000Z');
    const annuaireV2 = annuaireExemple('2026-10-20T08:00:00.000Z');
    semerBaseV2(etatV2, annuaireV2);

    // Toute opération réouvre la base en v3 : l'upgrade part, crée les
    // nouveaux stores…
    expect(await obtenirAppareilId()).toBeTruthy();
    expect(stores.has(IDB_STORE_OUTBOX)).toBe(true);
    expect(stores.has(IDB_STORE_APPAREIL)).toBe(true);
    // …et les données v2 (etat ET annuaire) survivent intactes.
    await expect(lireEtatVolontaires()).resolves.toEqual(etatV2);
    await expect(lireAnnuaire()).resolves.toEqual(annuaireV2);
  });

  it('SSR-safe : sans indexedDB — appareilId null, append false, listes vides', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(obtenirAppareilId()).resolves.toBeNull();
    await expect(ajouterRetrait(retraitExemple())).resolves.toBe(false);
    await expect(listerRetraits()).resolves.toEqual([]);
    await expect(retraitsParJeton()).resolves.toEqual(new Map());
  });

  it('appareilId généré UNE fois puis stable (relu tel quel aux appels suivants)', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    const premier = await obtenirAppareilId();
    const second = await obtenirAppareilId();
    expect(premier).toBeTruthy();
    expect(second).toBe(premier);
  });

  it('concurrence simulée : deux appels PARALLÈLES → UN SEUL appareilId (get+put atomiques)', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    const [premier, second] = await Promise.all([obtenirAppareilId(), obtenirAppareilId()]);
    // La transaction readwrite du second appel attend la fin de la première
    // (sérialisation IndexedDB) : sa lecture voit l’écriture du premier —
    // jamais deux identifiants générés.
    expect(premier).toBeTruthy();
    expect(second).toBe(premier);
    expect(stores.get(IDB_STORE_APPAREIL)?.size).toBe(1);
  });

  it('ajouterRetrait : append avec la clé d’idempotence du contrat en clé primaire', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    expect(await ajouterRetrait(retraitExemple())).toBe(true);
    const cle = cleIdempotenceRetrait(APPAREIL, 'edition-1', 'jeton-coureur-1-aaaaaa');
    expect(stores.get(IDB_STORE_OUTBOX)?.has(cle)).toBe(true);

    const retraits = await listerRetraits();
    expect(retraits).toEqual([retraitExemple()]);
    // La clé interne n'est jamais exposée à l'appelant.
    expect(JSON.stringify(retraits)).not.toContain('"cle"');
  });

  it('append idempotent : même clé → true mais UN SEUL événement (no-op physique)', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    expect(await ajouterRetrait(retraitExemple())).toBe(true);
    // Re-scan du même coureur avec un horodatage différent : l'append est
    // refusé par la clé primaire (ConstraintError) mais l'événement EST dans
    // l'outbox — true sans doublon, le PREMIER reste la référence (AD-3).
    expect(await ajouterRetrait(retraitExemple({ horodatage: '2027-05-16T07:00:00.000Z' }))).toBe(
      true,
    );
    expect(stores.get(IDB_STORE_OUTBOX)?.size).toBe(1);
    expect(await listerRetraits()).toHaveLength(1);
    expect((await listerRetraits())[0]?.horodatage).toBe('2027-05-16T06:12:30.000Z');
  });

  it('deux coureurs distincts : deux événements, clés distinctes', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ajouterRetrait(retraitExemple());
    await ajouterRetrait(retraitExemple({ jeton: 'jeton-coureur-12-aaaaa' }));
    expect(await listerRetraits()).toHaveLength(2);
  });

  it('retrait hors contrat : append refusé (false), rien en outbox', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    expect(await ajouterRetrait(retraitExemple({ version: 9 as RetraitTerrain['version'] }))).toBe(
      false,
    );
    expect(await ajouterRetrait(retraitExemple({ jeton: 'court' }))).toBe(false);
    expect(stores.get(IDB_STORE_OUTBOX)?.size ?? 0).toBe(0);
  });

  it('enregistrement corrompu en outbox : ignoré à la lecture, jamais d’exception', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterRetrait(retraitExemple());
    const store = stores.get(IDB_STORE_OUTBOX);
    store?.set('cle-fantomme', { cle: 'cle-fantomme', nimporte: 'quoi' });
    const retraits = await listerRetraits();
    expect(retraits).toHaveLength(1);
  });

  it('retraitsParJeton : Map jeton → horodatage, le PREMIER retrait gagne', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ajouterRetrait(retraitExemple({ jeton: 'jeton-coureur-1-aaaaaa', horodatage: '2027-05-16T06:12:30.000Z' }));
    await ajouterRetrait(retraitExemple({ jeton: 'jeton-coureur-12-aaaaa', horodatage: '2027-05-16T06:30:00.000Z' }));
    // Même jeton, édition suivante, horodatage plus tardif : le premier reste.
    await ajouterRetrait(
      retraitExemple({
        jeton: 'jeton-coureur-1-aaaaaa',
        editionId: 'edition-2',
        horodatage: '2027-05-16T07:00:00.000Z',
      }),
    );

    const index = await retraitsParJeton();
    expect(index.size).toBe(2);
    expect(index.get('jeton-coureur-1-aaaaaa')?.toISOString()).toBe('2027-05-16T06:12:30.000Z');
    expect(index.get('jeton-coureur-12-aaaaa')?.toISOString()).toBe('2027-05-16T06:30:00.000Z');
  });
});

describe('outbox passages — même store, préfixe distinct (story 4.4)', () => {
  it('SSR-safe : sans indexedDB — append false, listes vides, index vide', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(ajouterPassage(passageExemple())).resolves.toBe(false);
    await expect(listerPassages()).resolves.toEqual([]);
    await expect(passagesParJetonCheckpoint()).resolves.toEqual(new Map());
  });

  it('ajouterPassage : append avec la clé d’idempotence passage en clé primaire', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    expect(await ajouterPassage(passageExemple())).toBe(true);
    const cle = cleIdempotencePassage(APPAREIL, 'edition-1', 'jeton-coureur-1-aaaaaa', CHECKPOINT_KM12);
    expect(stores.get(IDB_STORE_OUTBOX)?.has(cle)).toBe(true);

    const passages = await listerPassages();
    expect(passages).toEqual([passageExemple()]);
    // La clé interne n'est jamais exposée à l'appelant.
    expect(JSON.stringify(passages)).not.toContain('"cle"');
  });

  it('append idempotent : même clé → true mais UN SEUL événement (no-op physique)', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    expect(await ajouterPassage(passageExemple())).toBe(true);
    // Re-scan du même coureur au même checkpoint avec un horodatage
    // différent : ConstraintError absorbé — l'événement EST dans l'outbox,
    // le PREMIER reste la référence (AD-3).
    expect(await ajouterPassage(passageExemple({ horodatage: '2027-05-16T08:00:00.000Z' }))).toBe(
      true,
    );
    expect(stores.get(IDB_STORE_OUTBOX)?.size).toBe(1);
    expect(await listerPassages()).toHaveLength(1);
    expect((await listerPassages())[0]?.horodatage).toBe('2027-05-16T07:05:09.000Z');
  });

  it('même coureur à un AUTRE checkpoint : DEUX événements, clés distinctes', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ajouterPassage(passageExemple());
    await ajouterPassage(passageExemple({ checkpointId: CHECKPOINT_KM30 }));
    expect(await listerPassages()).toHaveLength(2);
  });

  it('coexistence outbox : retraits et passages cohabitent SANS interférer', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ajouterRetrait(retraitExemple());
    await ajouterPassage(passageExemple());
    // Le même coureur, retrait ET passage : deux enregistrements distincts.
    expect(stores.get(IDB_STORE_OUTBOX)?.size).toBe(2);
    // Chaque liste ne voit QUE son contrat (garde type exact).
    expect(await listerRetraits()).toEqual([retraitExemple()]);
    expect(await listerPassages()).toEqual([passageExemple()]);
    // Les index restent indépendants l'un de l'autre.
    expect((await retraitsParJeton()).size).toBe(1);
    expect((await passagesParJetonCheckpoint()).size).toBe(1);
  });

  it('passage hors contrat : append refusé (false), rien en outbox', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    expect(await ajouterPassage(passageExemple({ version: 9 as PassageTerrain['version'] }))).toBe(
      false,
    );
    expect(await ajouterPassage(passageExemple({ checkpointId: '' }))).toBe(false);
    expect(await ajouterPassage(passageExemple({ jeton: 'court' }))).toBe(false);
    expect(stores.get(IDB_STORE_OUTBOX)?.size ?? 0).toBe(0);
  });

  it('enregistrement corrompu ou retrait en outbox : ignorés par listerPassages', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterPassage(passageExemple());
    await ajouterRetrait(retraitExemple());
    stores.get(IDB_STORE_OUTBOX)?.set('cle-fantomme', { cle: 'cle-fantomme', nimporte: 'quoi' });
    const passages = await listerPassages();
    expect(passages).toHaveLength(1);
    expect(passages[0]?.type).toBe('passage');
  });

  it('passagesParJetonCheckpoint : Map `${jeton}:${checkpointId}` → horodatage du PREMIER', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);

    await ajouterPassage(
      passageExemple({ horodatage: '2027-05-16T07:05:09.000Z' }),
    );
    // Même coureur, autre checkpoint : entrée DISTINCTE (passage distinct).
    await ajouterPassage(
      passageExemple({ checkpointId: CHECKPOINT_KM30, horodatage: '2027-05-16T07:30:00.000Z' }),
    );
    // Même paire, édition suivante, horodatage plus tardif : le premier reste.
    await ajouterPassage(
      passageExemple({ editionId: 'edition-2', horodatage: '2027-05-16T08:00:00.000Z' }),
    );

    const index = await passagesParJetonCheckpoint();
    expect(index.size).toBe(2);
    expect(index.get(cleIndexPassage('jeton-coureur-1-aaaaaa', CHECKPOINT_KM12))?.toISOString()).toBe(
      '2027-05-16T07:05:09.000Z',
    );
    expect(index.get(cleIndexPassage('jeton-coureur-1-aaaaaa', CHECKPOINT_KM30))?.toISOString()).toBe(
      '2027-05-16T07:30:00.000Z',
    );
  });

  it('l’outbox passages survit à la déconnexion (cross-session, AD-5)', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterPassage(passageExemple());

    await effacerEtatVolontaires();

    // Le volontaire se reconnecte : les passages restent, doublons toujours
    // détectables.
    await expect(listerPassages()).resolves.toHaveLength(1);
    expect((await passagesParJetonCheckpoint()).size).toBe(1);
  });
});

describe('effacerEtatVolontaires — purge logout conservatrice (AD-5)', () => {
  it('vide etat et annuaire, purge les caches az-volontaires-*, NE supprime PAS la base', async () => {
    const { fabrique, stores, suppressions } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    await ecrireAnnuaire(annuaireExemple('2026-10-22T08:00:00.000Z'));
    await ajouterRetrait(retraitExemple());
    const cachesSupprimes: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => [
        'az-volontaires-shell-v1',
        'az-volontaires-etat-v0',
        'site-cache-v2',
      ],
      delete: async (nom: string) => {
        cachesSupprimes.push(nom);
        return true;
      },
    });

    await effacerEtatVolontaires();

    // La base SURVIT (pas de deleteDatabase) : outbox et appareil restent.
    expect(suppressions).toEqual([]);
    // Fiche et annuaire purgés — l'appareil est partagé, ils ne survivent pas
    // au compte.
    expect(stores.get(IDB_STORE_ETAT)?.size).toBe(0);
    expect(stores.get(IDB_STORE_ANNUAIRE)?.size).toBe(0);
    expect(cachesSupprimes.sort()).toEqual(['az-volontaires-etat-v0', 'az-volontaires-shell-v1']);
  });

  it('SSR-safe : sans indexedDB ni caches, purge silencieuse sans exception', async () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(typeof caches).toBe('undefined');
    await expect(effacerEtatVolontaires()).resolves.toBeUndefined();
  });

  it('l’outbox et l’appareilId survivent à la déconnexion (cross-session, AD-5)', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ecrireEtatVolontaires(etatExemple('2026-10-22T08:00:00.000Z'));
    const appareilAvant = await obtenirAppareilId();
    await ajouterRetrait(retraitExemple());
    expect(await listerRetraits()).toHaveLength(1);

    await effacerEtatVolontaires();

    // Le volontaire se reconnecte : même appareilId, même outbox, doublons
    // toujours détectables.
    await expect(obtenirAppareilId()).resolves.toBe(appareilAvant);
    await expect(listerRetraits()).resolves.toHaveLength(1);
    expect(stores.get(IDB_STORE_OUTBOX)?.size).toBe(1);
    expect(stores.get(IDB_STORE_APPAREIL)?.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Story 4.5 — v4 : stores « envoyes » (marquage hors outbox) + « journal »
// (borné ~100) + jeton du canal sync. Upgrade v3→v4 SANS toucher à l'existant.
// ---------------------------------------------------------------------------

describe('upgrade v3 → v4 (story 4.5)', () => {
  it('les stores envoyes/journal sont créés, l’existant (outbox/appareil) INTACT', async () => {
    const cleRetrait = cleIdempotenceRetrait(APPAREIL, 'edition-1', 'jeton-coureur-1-aaaaaa');
    const { fabrique, stores, semerBaseV3 } = creerIndexedDbMemoire();
    semerBaseV3(APPAREIL, { ...retraitExemple(), cle: cleRetrait });
    vi.stubGlobal('indexedDB', fabrique);

    expect(await compterEnAttente()).toBe(1);
    expect(stores.has(IDB_STORE_ENVOYES)).toBe(true);
    expect(stores.has(IDB_STORE_JOURNAL)).toBe(true);
    // L'outbox v3 n'a pas bougé d'un octet : même clé, même événement.
    expect(stores.get(IDB_STORE_OUTBOX)?.get(cleRetrait)).toEqual({
      ...retraitExemple(),
      cle: cleRetrait,
    });
    expect(stores.get(IDB_STORE_APPAREIL)?.get(IDB_CLE_COURANT)).toEqual({
      id: IDB_CLE_COURANT,
      appareilId: APPAREIL,
    });
  });

  it('une base NEUVE part directement avec les six stores (v4 d’origine)', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await compterEnAttente();
    expect(IDB_VERSION).toBe(4);
    for (const store of [
      IDB_STORE_ETAT,
      IDB_STORE_ANNUAIRE,
      IDB_STORE_OUTBOX,
      IDB_STORE_APPAREIL,
      IDB_STORE_ENVOYES,
      IDB_STORE_JOURNAL,
    ]) {
      expect(stores.has(store), store).toBe(true);
    }
  });
});

describe('compterEnAttente / listerEvenementsASynchroniser / marquerEnvoyes (story 4.5)', () => {
  it('SSR-safe : sans indexedDB — compteur 0, liste vide, marquage false, journal vide, jeton null', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(compterEnAttente()).resolves.toBe(0);
    // Stockage ABSENT (SSR) : vide honnête, PAS une erreur de comptage.
    await expect(lireEtatFileAttente()).resolves.toEqual({
      enAttente: 0,
      erreurStockage: false,
    });
    await expect(listerEvenementsASynchroniser()).resolves.toEqual([]);
    await expect(marquerEnvoyes(['cle-1'])).resolves.toBe(false);
    await expect(lireJournal()).resolves.toEqual([]);
    await expect(lireJetonSync()).resolves.toBeNull();
    await expect(enregistrerJetonSync('jeton')).resolves.toBe(false);
  });

  it('stockage DÉFAILLANT (présent mais illisible) : erreurStockage distingué du vide', async () => {
    const requeteQuiEchoue = () => {
      const requete = {
        result: undefined,
        error: new Error('QuotaExceededError'),
        onsuccess: null,
        onerror: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => (requete.onerror as ((evenement: unknown) => void) | null)?.(null));
      return requete;
    };
    vi.stubGlobal('indexedDB', { open: requeteQuiEchoue } as unknown as IDBFactory);
    await expect(lireEtatFileAttente()).resolves.toEqual({
      enAttente: 0,
      erreurStockage: true,
    });
    // Le compteur simple reste absorbé (0) — seul l'état détaillé distingue.
    await expect(compterEnAttente()).resolves.toBe(0);
  });

  it('retraits ET passages comptés ensemble ; marquage partiel recompte exactement', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterRetrait(retraitExemple());
    await ajouterPassage(passageExemple());
    await ajouterPassage(passageExemple({ checkpointId: CHECKPOINT_KM30 }));
    expect(await compterEnAttente()).toBe(3);

    const clePremierPassage = cleIdempotencePassage(
      APPAREIL,
      'edition-1',
      'jeton-coureur-1-aaaaaa',
      CHECKPOINT_KM12,
    );
    expect(await marquerEnvoyes([clePremierPassage])).toBe(true);
    expect(await compterEnAttente()).toBe(2);

    // Le marquage vit dans SON store : l'outbox reste append-only immuable.
    expect(stores.get(IDB_STORE_OUTBOX)?.size).toBe(3);
    expect(stores.get(IDB_STORE_ENVOYES)?.size).toBe(1);
    expect(
      (stores.get(IDB_STORE_ENVOYES)?.get(clePremierPassage) as { envoyeA: string })
        .envoyeA,
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('listerEvenementsASynchroniser : événements avec leur clé du CONTRAT, hors contrat exclu', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterRetrait(retraitExemple());
    await ajouterPassage(passageExemple());
    // Enregistrement d'une autre époque (clé corrompue) : jamais parti.
    stores.get(IDB_STORE_OUTBOX)?.set('cle-fantomme', { cle: 'cle-fantomme', nimporte: 'quoi' });

    const aSynchroniser = await listerEvenementsASynchroniser();
    expect(aSynchroniser.map((evenement) => evenement.type).sort()).toEqual([
      'passage',
      'retrait',
    ]);
    for (const evenement of aSynchroniser) {
      expect(evenement.cle).toBe(cleIdempotenceEvenement(evenement));
    }

    // MÊME filtre côté compteur : le corrompu n'existe ni dans la liste NI
    // dans « N en attente » (jamais de compteur à vie pour une clé morte).
    await expect(compterEnAttente()).resolves.toBe(2);
    await expect(lireEtatFileAttente()).resolves.toEqual({
      enAttente: 2,
      erreurStockage: false,
    });

    await marquerEnvoyes(aSynchroniser.map((evenement) => evenement.cle));
    await expect(listerEvenementsASynchroniser()).resolves.toEqual([]);
    await expect(compterEnAttente()).resolves.toBe(0);
  });

  it('marquerEnvoyes([]) : true sans effet ; les rejets restés en file comptent toujours', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterRetrait(retraitExemple());
    expect(await marquerEnvoyes([])).toBe(true);
    expect(await compterEnAttente()).toBe(1);
  });
});

describe('journal sync — append borné, lecture triée (story 4.5)', () => {
  function entree(horodatage: string, surcharge: Partial<EntreeJournalSync> = {}): Omit<EntreeJournalSync, 'id'> {
    return {
      horodatage,
      envoyes: 10,
      dejaConnus: 2,
      rejetes: 0,
      motifs: [],
      offsetMoyenMs: 1_000,
      ...surcharge,
    };
  }

  it('aller-retour : entrées relues du plus RÉCENT au plus ancien', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterEntreeJournal(entree('2027-05-16T07:06:10.000Z'));
    await ajouterEntreeJournal(entree('2027-05-16T08:06:10.000Z'));
    await ajouterEntreeJournal(entree('2027-05-16T09:06:10.000Z'));

    const journal = await lireJournal();
    expect(journal.map((e) => e.horodatage)).toEqual([
      '2027-05-16T09:06:10.000Z',
      '2027-05-16T08:06:10.000Z',
      '2027-05-16T07:06:10.000Z',
    ]);
    expect(journal[0]).toMatchObject({ envoyes: 10, dejaConnus: 2, offsetMoyenMs: 1_000 });
    // Ids uniques (clés React du journal).
    expect(new Set(journal.map((e) => e.id)).size).toBe(3);
  });

  it(`borné à ${JOURNAL_SYNC_MAX_ENTREES} : les plus ANCIENNES partent`, async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    // Dates strictement croissantes via rollover natif de Date (minute index).
    for (let index = 0; index < JOURNAL_SYNC_MAX_ENTREES + 5; index += 1) {
      const horodatage = new Date(Date.UTC(2027, 4, 16, 0, index)).toISOString();
      await ajouterEntreeJournal(entree(horodatage));
    }
    const journal = await lireJournal();
    expect(journal).toHaveLength(JOURNAL_SYNC_MAX_ENTREES);
    expect(stores.get(IDB_STORE_JOURNAL)?.size).toBe(JOURNAL_SYNC_MAX_ENTREES);
    // Les 5 plus anciennes (minutes 0→4) sont parties : la plus ancienne
    // restante est la minute 5, la plus récente la minute 104.
    expect(journal[journal.length - 1]?.horodatage).toBe('2027-05-16T00:05:00.000Z');
    expect(journal[0]?.horodatage).toBe('2027-05-16T01:44:00.000Z');
  });

  it('le journal et le marquage SURVIVENT à la déconnexion (AD-5 : ils appartiennent à l’appareil)', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await ajouterPassage(passageExemple());
    const cle = cleIdempotencePassage(APPAREIL, 'edition-1', 'jeton-coureur-1-aaaaaa', CHECKPOINT_KM12);
    await marquerEnvoyes([cle]);
    await ajouterEntreeJournal(entree('2027-05-16T07:06:10.000Z'));

    await effacerEtatVolontaires();

    await expect(compterEnAttente()).resolves.toBe(0);
    await expect(lireJournal()).resolves.toHaveLength(1);
  });
});

describe('jeton du canal sync — enregistrerJetonSync / lireJetonSync (story 4.5)', () => {
  it('sans appareil enregistré : le jeton ne peut pas vivre seul (false)', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    expect(await enregistrerJetonSync('jeton-brut')).toBe(false);
    await expect(lireJetonSync()).resolves.toBeNull();
  });

  it('aller-retour après obtainAppareilId : le jeton survit à la déconnexion (AD-5)', async () => {
    const { fabrique } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    const appareilId = await obtenirAppareilId();
    expect(appareilId).not.toBeNull();

    expect(await enregistrerJetonSync('jeton-canal-sync-1')).toBe(true);
    await expect(lireJetonSync()).resolves.toBe('jeton-canal-sync-1');

    await effacerEtatVolontaires();
    // Le jeton appartient à l'APPAREIL, pas au compte : conservé.
    await expect(lireJetonSync()).resolves.toBe('jeton-canal-sync-1');
  });

  it('jeton vide : refus (false) sans écriture', async () => {
    const { fabrique, stores } = creerIndexedDbMemoire();
    vi.stubGlobal('indexedDB', fabrique);
    await obtenirAppareilId();
    expect(await enregistrerJetonSync('')).toBe(false);
    await expect(lireJetonSync()).resolves.toBeNull();
  });
});
