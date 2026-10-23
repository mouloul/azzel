import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  SYNC_TERRAIN_MAX_LOT,
  cleIdempotenceEvenement,
  type EvenementSyncTerrain,
  type PassageTerrain,
  type ReponseLotSync,
  type RetraitTerrain,
} from '@azzel/shared';

import type { EntreeJournalSync } from '@/lib/idb-volontaires';

import {
  creerDepsEnregistrementAppareil,
  creerPosterLotSync,
  enregistrerAppareilPourSync,
  offsetMoyenLot,
  synchroniserTerrain,
  synchroniserTerrainAvecEnregistrement,
  type DepsEnregistrementAppareil,
  type DepsMoteurSync,
  type ReponsePosterLot,
} from './sync-terrain';

// Story 4.5 — tests purs du moteur de sync : tranches ≤ 200 séquentielles,
// marquage accepté/déjà-connu (jamais rejeté), journal par lot (motifs,
// offset moyen), réseau absorbé (rien de perdu), révoqué = stop net,
// sans-jeton différé. Aucun DOM, aucun réseau réel.

const JETON_COUREUR = 'AbCdEfGhIjKlMnOpQrStUv';

function retraitValide(surcharge: Partial<RetraitTerrain> = {}): RetraitTerrain {
  return {
    version: RETRAIT_SCHEMA_VERSION,
    type: 'retrait',
    editionId: 'edition-1',
    jeton: JETON_COUREUR,
    horodatage: '2027-05-16T06:12:30.000Z',
    appareilId: 'appareil-1',
    ...surcharge,
  };
}

function passageValide(
  surcharge: Partial<PassageTerrain> = {},
  index = 0,
): PassageTerrain {
  return {
    version: PASSAGE_SCHEMA_VERSION,
    type: 'passage',
    editionId: 'edition-1',
    jeton: JETON_COUREUR,
    checkpointId: `mission-scan-${index}`,
    horodatage: '2027-05-16T07:05:09.000Z',
    appareilId: 'appareil-1',
    ...surcharge,
  };
}

function surFil(evenement: RetraitTerrain | PassageTerrain): EvenementSyncTerrain {
  return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
}

function reponseLot(
  evenements: EvenementSyncTerrain[],
  statuts: Array<'accepté' | 'déjà-connu' | 'rejeté'>,
  motifs: Record<number, string> = {},
  recuA = '2027-05-16T07:06:09.000Z',
): ReponseLotSync {
  const resultats = evenements.map((evenement, index) => {
    const statut = statuts[index] ?? 'accepté';
    return statut === 'rejeté' && motifs[index] !== undefined
      ? { cle: evenement.cle, statut, motif: motifs[index] }
      : { cle: evenement.cle, statut };
  });
  return {
    resultats,
    compteurs: {
      acceptes: resultats.filter((r) => r.statut === 'accepté').length,
      dejaConnus: resultats.filter((r) => r.statut === 'déjà-connu').length,
      rejetes: resultats.filter((r) => r.statut === 'rejeté').length,
    },
    recuA,
  };
}

interface TraceDeps {
  deps: DepsMoteurSync;
  journaux: Omit<EntreeJournalSync, 'id'>[];
  marques: string[][];
  postes: EvenementSyncTerrain[][];
  enAttente: number;
  setReponse(
    fabrique: (evenements: EvenementSyncTerrain[]) => ReponsePosterLot,
  ): void;
}

function creerDeps(evenements: EvenementSyncTerrain[], options: { jeton?: string | null } = {}): TraceDeps {
  const journaux: Omit<EntreeJournalSync, 'id'>[] = [];
  const marques: string[][] = [];
  const postes: EvenementSyncTerrain[][] = [];
  let enAttente = evenements.length;
  let fabrique: (evenements: EvenementSyncTerrain[]) => ReponsePosterLot = (e) => ({
    ok: true,
    reponse: reponseLot(e, e.map(() => 'accepté' as const)),
  });
  const deps: DepsMoteurSync = {
    lireJetonSync: async () => options.jeton === undefined ? 'jeton-sync-1' : options.jeton,
    listerEvenements: async () => evenements,
    marquerEnvoyes: async (cles) => {
      marques.push(cles);
      enAttente -= cles.length;
      return true;
    },
    ajouterEntreeJournal: async (entree) => {
      journaux.push(entree);
      return true;
    },
    compterEnAttente: async () => Math.max(0, enAttente),
    posterLot: async (_jeton, lot) => {
      postes.push(lot);
      return fabrique(lot);
    },
  };
  return {
    deps,
    journaux,
    marques,
    postes,
    enAttente,
    setReponse(f) {
      fabrique = f;
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('offsetMoyenLot — AD-3 (donnée d’audit, jamais un temps de classement)', () => {
  it('moyenne des écarts serveur − appareil, arrondie', () => {
    const recuA = '2027-05-16T07:06:09.000Z';
    const evenements = [
      surFil(passageValide({ horodatage: '2027-05-16T07:05:09.000Z' }, 1)), // +60 000 ms
      surFil(passageValide({ horodatage: '2027-05-16T07:04:09.000Z' }, 2)), // +120 000 ms
    ];
    expect(offsetMoyenLot(recuA, evenements)).toBe(90_000);
  });

  it('lot vide ou recuA illisible : null (pas de faux zéro)', () => {
    expect(offsetMoyenLot('2027-05-16T07:06:09.000Z', [])).toBeNull();
    expect(
      offsetMoyenLot('pas-une-date', [surFil(passageValide({}, 3))]),
    ).toBeNull();
  });
});

describe('synchroniserTerrain — états de sortie', () => {
  it('sans jeton enregistré : sans-jeton, file INTACTE (enregistrement différé)', async () => {
    const trace = creerDeps([surFil(retraitValide())], { jeton: null });
    const resultat = await synchroniserTerrain(trace.deps);
    expect(resultat).toEqual({
      statut: 'sans-jeton',
      lots: 0,
      envoyes: 0,
      dejaConnus: 0,
      rejetes: 0,
      enAttente: 1,
    });
    expect(trace.postes).toEqual([]);
  });

  it('file vide : rien-a-envoyer, compteur 0', async () => {
    const trace = creerDeps([]);
    const resultat = await synchroniserTerrain(trace.deps);
    expect(resultat.statut).toBe('rien-a-envoyer');
    expect(resultat.enAttente).toBe(0);
    expect(trace.postes).toEqual([]);
  });
});

describe('synchroniserTerrain — nominal et reprise par tranches', () => {
  it('450 événements : 3 lots séquentiels de ≤ 200, ordre de l’outbox conservé', async () => {
    const evenements = Array.from({ length: 450 }, (_, index) =>
      surFil(passageValide({}, index)),
    );
    const trace = creerDeps(evenements);
    const resultat = await synchroniserTerrain(trace.deps);
    expect(trace.postes.map((lot) => lot.length)).toEqual([200, 200, 50]);
    expect(trace.postes.flat().map((e) => e.cle)).toEqual(evenements.map((e) => e.cle));
    expect(resultat).toMatchObject({
      statut: 'envoye',
      lots: 3,
      envoyes: 450,
      dejaConnus: 0,
      rejetes: 0,
      enAttente: 0,
    });
  });

  it('acceptés ET déjà-connus marqués envoyés (le serveur connaît), rejetés PAS marqués', async () => {
    const evenements = [
      surFil(retraitValide()),
      surFil(passageValide({}, 1)),
      surFil(passageValide({}, 2)),
    ];
    const trace = creerDeps(evenements);
    trace.setReponse((lot) => ({
      ok: true,
      reponse: reponseLot(lot, ['accepté', 'déjà-connu', 'rejeté'], { 2: 'coureur inconnu' }),
    }));
    const resultat = await synchroniserTerrain(trace.deps);
    expect(trace.marques).toEqual([[evenements[0]?.cle, evenements[1]?.cle]]);
    expect(resultat).toMatchObject({
      statut: 'envoye',
      envoyes: 1,
      dejaConnus: 1,
      rejetes: 1,
      // Le rejeté reste en file : il sera reproposé au prochain passage.
      enAttente: 1,
    });
  });

  it('journal par lot : compteurs, motifs de rejet, offset moyen des connus', async () => {
    const evenements = [
      surFil(passageValide({ horodatage: '2027-05-16T07:05:09.000Z' }, 1)),
      surFil(passageValide({ horodatage: '2027-05-16T07:05:39.000Z' }, 2)),
      surFil(passageValide({ horodatage: '2027-05-16T07:05:59.000Z' }, 3)),
    ];
    const trace = creerDeps(evenements);
    trace.setReponse((lot) => ({
      ok: true,
      reponse: reponseLot(lot, ['accepté', 'accepté', 'rejeté'], { 2: 'contrat invalide' }),
    }));
    await synchroniserTerrain(trace.deps);
    expect(trace.journaux).toHaveLength(1);
    expect(trace.journaux[0]).toMatchObject({
      envoyes: 2,
      dejaConnus: 0,
      rejetes: 1,
      motifs: ['contrat invalide'],
      // Moyenne sur les DEUX connus (60 s et 30 s d'écart), pas sur le rejeté.
      offsetMoyenMs: 45_000,
    });
    expect(typeof trace.journaux[0]?.horodatage).toBe('string');
  });
});

describe('synchroniserTerrain — absorbation des échecs (rien n’est perdu)', () => {
  it('réseau coupé AU DEUXIÈME lot : premier lot conservé (marqué, journalisé), statut reseau-indisponible', async () => {
    const evenements = Array.from({ length: SYNC_TERRAIN_MAX_LOT + 50 }, (_, index) =>
      surFil(passageValide({}, index)),
    );
    const trace = creerDeps(evenements);
    trace.setReponse((lot) =>
      lot.length === SYNC_TERRAIN_MAX_LOT
        ? { ok: true, reponse: reponseLot(lot, lot.map(() => 'accepté' as const)) }
        : { ok: false, erreur: 'reseau' },
    );
    const resultat = await synchroniserTerrain(trace.deps);
    expect(resultat).toMatchObject({
      statut: 'reseau-indisponible',
      lots: 1,
      envoyes: SYNC_TERRAIN_MAX_LOT,
      enAttente: 50,
    });
    expect(trace.marques).toHaveLength(1);
    expect(trace.marques[0]).toHaveLength(SYNC_TERRAIN_MAX_LOT);
  });

  it('413 (borne serveur réduite) : découpage réactif — la tranche est DIVISÉE en deux, jamais rebouclée', async () => {
    const evenements = Array.from({ length: 6 }, (_, index) => surFil(passageValide({}, index)));
    const trace = creerDeps(evenements);
    trace.setReponse((lot) =>
      lot.length > 3
        ? { ok: false, erreur: 'lot-trop-grand' }
        : { ok: true, reponse: reponseLot(lot, lot.map(() => 'accepté' as const)) },
    );
    const resultat = await synchroniserTerrain(trace.deps);
    // 6 → 413 → 3+3 : chaque moitié progresse, tout part, compteur cohérent.
    expect(trace.postes.map((lot) => lot.length)).toEqual([6, 3, 3]);
    expect(resultat).toMatchObject({
      statut: 'envoye',
      lots: 2,
      envoyes: 6,
      enAttente: 0,
    });
    expect(trace.marques.flat()).toHaveLength(6);
  });

  it('413 récursif jusqu’à la taille admise (6 → 3 → 2+1) : divisions successives', async () => {
    const evenements = Array.from({ length: 6 }, (_, index) => surFil(passageValide({}, index + 20)));
    const trace = creerDeps(evenements);
    trace.setReponse((lot) =>
      lot.length > 2
        ? { ok: false, erreur: 'lot-trop-grand' }
        : { ok: true, reponse: reponseLot(lot, lot.map(() => 'accepté' as const)) },
    );
    const resultat = await synchroniserTerrain(trace.deps);
    expect(trace.postes.map((lot) => lot.length).sort((a, b) => a - b)).toEqual([
      1, 1, 2, 2, 3, 3, 6,
    ]);
    expect(resultat).toMatchObject({ statut: 'envoye', envoyes: 6 });
  });

  it('413 sur un événement SEUL : insécable → reseau-indisponible (jamais de boucle sur la même tranche)', async () => {
    const trace = creerDeps([surFil(retraitValide())]);
    trace.setReponse(() => ({ ok: false, erreur: 'lot-trop-grand' }));
    const resultat = await synchroniserTerrain(trace.deps);
    expect(resultat).toMatchObject({ statut: 'reseau-indisponible', enAttente: 1 });
    // Un seul essai : le moteur n’a PAS rejoué la tranche de taille 1.
    expect(trace.postes).toHaveLength(1);
  });

  it('appareil révoqué : stop NET, lot en cours rien marqué ni journalisé', async () => {
    const evenements = [surFil(retraitValide())];
    const trace = creerDeps(evenements);
    trace.setReponse(() => ({ ok: false, erreur: 'appareil-revoque' }));
    const resultat = await synchroniserTerrain(trace.deps);
    expect(resultat).toMatchObject({
      statut: 'appareil-revoque',
      lots: 0,
      envoyes: 0,
      enAttente: 1,
    });
    expect(trace.marques).toEqual([]);
    expect(trace.journaux).toEqual([]);
  });

  it('jeton devenu inconnu : sans-jeton (réenregistrement à la prochaine ouverture)', async () => {
    const trace = creerDeps([surFil(retraitValide())]);
    trace.setReponse(() => ({ ok: false, erreur: 'authentification' }));
    const resultat = await synchroniserTerrain(trace.deps);
    expect(resultat.statut).toBe('sans-jeton');
    expect(trace.marques).toEqual([]);
  });
});

describe('synchroniserTerrainAvecEnregistrement — sans-jeton → register → retry (AD-5)', () => {
  function depsAvecEnregistrement(options: {
    jeton?: string | null;
    evenements?: EvenementSyncTerrain[];
    enregistrement: () => Promise<boolean | 'revoque'>;
  }): DepsMoteurSync & { enregistrer: () => Promise<boolean | 'revoque'> } {
    const trace = creerDeps(options.evenements ?? [], { jeton: options.jeton });
    return { ...trace.deps, enregistrer: options.enregistrement };
  }

  it('statut initial ≠ sans-jeton : AUCUN enregistrement tenté', async () => {
    const trace = creerDeps([surFil(retraitValide())]);
    trace.setReponse(() => ({ ok: false, erreur: 'appareil-revoque' }));
    const enregistrer = vi.fn(async () => true as const);
    const resultat = await synchroniserTerrainAvecEnregistrement({
      ...trace.deps,
      enregistrer,
    });
    expect(resultat.statut).toBe('appareil-revoque');
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('sans-jeton → enregistrement OK → NOUVELLE tentative qui vide la file', async () => {
    // Premier passage : jeton absent. Après enregistrement : jeton présent.
    let jetonDisponible: string | null = null;
    const evenements = [surFil(retraitValide()), surFil(passageValide({}, 1))];
    const trace = creerDeps(evenements, { jeton: null });
    const deps: DepsMoteurSync & { enregistrer: () => Promise<boolean | 'revoque'> } = {
      ...trace.deps,
      lireJetonSync: async () => jetonDisponible,
      enregistrer: async () => {
        jetonDisponible = 'jeton-neuf';
        return true;
      },
    };
    const resultat = await synchroniserTerrainAvecEnregistrement(deps);
    expect(resultat).toMatchObject({ statut: 'envoye', envoyes: 2, enAttente: 0 });
    expect(trace.postes).toHaveLength(1); // la relance a bien reposté
  });

  it('sans-jeton → enregistrement impossible (hors-ligne) : résultat initial conservé, file intacte', async () => {
    const trace = creerDeps([surFil(retraitValide())], { jeton: null });
    const resultat = await synchroniserTerrainAvecEnregistrement({
      ...trace.deps,
      enregistrer: async () => false,
    });
    expect(resultat.statut).toBe('sans-jeton');
    expect(resultat.enAttente).toBe(1);
    expect(trace.postes).toEqual([]);
  });

  it('sans-jeton → enregistrement révoqué (« Appelle le PC ») : appareil-revoque immédiat', async () => {
    const trace = creerDeps([surFil(retraitValide())], { jeton: null });
    const resultat = await synchroniserTerrainAvecEnregistrement({
      ...trace.deps,
      enregistrer: async () => 'revoque' as const,
    });
    expect(resultat.statut).toBe('appareil-revoque');
    expect(trace.postes).toEqual([]);
  });
});

describe('creerPosterLotSync — câblage fetch', () => {
  function reponseInit(corps: unknown, statut = 200): Response {
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('200 : enveloppe lot validée passée telle quelle, Bearer transmis', async () => {
    const evenements = [surFil(retraitValide())];
    const reponse = reponseLot(evenements, ['accepté']);
    const fetchFactice = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('/api/volontaires/sync');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer jeton-1');
      expect(init?.cache).toBe('no-store');
      return reponseInit(reponse);
    });
    const poster = creerPosterLotSync(fetchFactice as unknown as typeof fetch);
    const resultat = await poster('jeton-1', evenements);
    expect(resultat).toEqual({ ok: true, reponse });
  });

  it('401 appareil révoqué (code dédié) : appareil-revoque', async () => {
    const fetchFactice = vi.fn(async () =>
      reponseInit(
        {
          version: 1,
          error: {
            code: 'volontaires.sync.appareil_revoked',
            message: 'Cet appareil a été révoqué par le PC.',
            action: 'Appelle le PC.',
          },
        },
        401,
      ),
    );
    const poster = creerPosterLotSync(fetchFactice as unknown as typeof fetch);
    expect(await poster('jeton', [])).toEqual({ ok: false, erreur: 'appareil-revoque' });
  });

  it('401 autre code : authentification (réenregistrement prévu)', async () => {
    const fetchFactice = vi.fn(async () =>
      reponseInit(
        {
          version: 1,
          error: {
            code: 'volontaires.sync.jeton_invalide',
            message: 'inconnu',
            action: 'réenregistre',
          },
        },
        401,
      ),
    );
    const poster = creerPosterLotSync(fetchFactice as unknown as typeof fetch);
    expect(await poster('jeton', [])).toEqual({ ok: false, erreur: 'authentification' });
  });

  it('fetch qui jette (hors-ligne) ou 503 ou corps corrompu : reseau', async () => {
    const jetante = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const poster = creerPosterLotSync(jetante as unknown as typeof fetch);
    expect(await poster('jeton', [])).toEqual({ ok: false, erreur: 'reseau' });

    const cinqCentTrois = vi.fn(async () => reponseInit({}, 503));
    expect(
      await creerPosterLotSync(cinqCentTrois as unknown as typeof fetch)('jeton', []),
    ).toEqual({ ok: false, erreur: 'reseau' });

    const corpsCorrompu = vi.fn(
      async () => new Response('{pas fini', { status: 200 }),
    );
    expect(
      await creerPosterLotSync(corpsCorrompu as unknown as typeof fetch)('jeton', []),
    ).toEqual({ ok: false, erreur: 'reseau' });
  });

  it('413 : lot-trop-grand (le moteur découpera), pas « reseau »', async () => {
    const quatreCentTreize = vi.fn(async () => reponseInit({}, 413));
    expect(
      await creerPosterLotSync(quatreCentTreize as unknown as typeof fetch)('jeton', []),
    ).toEqual({ ok: false, erreur: 'lot-trop-grand' });
  });

  it('timeout : le signal de 30 s est posé sur CHAQUE envoi (requête suspendue ≠ file bloquée)', async () => {
    const evenements = [surFil(retraitValide())];
    const fetchFactice = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.signal as AbortSignal).aborted).toBe(false);
      return reponseInit(reponseLot(evenements, ['accepté']));
    });
    await creerPosterLotSync(fetchFactice as unknown as typeof fetch)('jeton', evenements);
    expect(fetchFactice).toHaveBeenCalledTimes(1);
  });
});

describe('enregistrerAppareilPourSync — deps injectées (fetch factice)', () => {
  function depsEnregistrement(
    fetchFactice: typeof fetch,
    reponses: {
      lireAppareilId?: () => Promise<string | null>;
      enregistrerJeton?: (jeton: string) => Promise<boolean>;
    } = {},
  ): DepsEnregistrementAppareil {
    return {
      lireAppareilId: reponses.lireAppareilId ?? (async () => 'appareil-client-1'),
      enregistrerJeton: reponses.enregistrerJeton ?? (async () => true),
      fetchImpl: fetchFactice,
    };
  }

  function reponseJson(corps: unknown, statut = 200): Response {
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('nominal : appareilId transmis, jeton BRUT mémorisé, true', async () => {
    const enregistrerJeton = vi.fn(async () => true);
    const fetchFactice = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(String(init?.body)).toBe('{"appareilId":"appareil-client-1"}');
      return reponseJson({ appareilId: 'uuid-1', jeton: 'jeton-brut' });
    });
    const resultat = await enregistrerAppareilPourSync(
      depsEnregistrement(fetchFactice as unknown as typeof fetch, { enregistrerJeton }),
    );
    expect(resultat).toBe(true);
    expect(enregistrerJeton).toHaveBeenCalledWith('jeton-brut');
  });

  it('401 « appareil révoqué » : REVOQUE remonté (le bandeau affichera « Appelle le PC », AD-5)', async () => {
    const fetchFactice = vi.fn(async () =>
      reponseJson(
        {
          version: 1,
          error: {
            code: 'volontaires.sync.appareil_revoked',
            message: 'révoqué',
            action: 'Appelle le PC.',
          },
        },
        401,
      ),
    );
    const resultat = await enregistrerAppareilPourSync(
      depsEnregistrement(fetchFactice as unknown as typeof fetch),
    );
    expect(resultat).toBe('revoque');
  });

  it('401 autre code (session morte) : false différé — la file reste affichée', async () => {
    const fetchFactice = vi.fn(async () =>
      reponseJson(
        {
          version: 1,
          error: { code: 'iam.unauthenticated', message: 'x', action: 'y' },
        },
        401,
      ),
    );
    expect(
      await enregistrerAppareilPourSync(
        depsEnregistrement(fetchFactice as unknown as typeof fetch),
      ),
    ).toBe(false);
  });

  it('pas d’appareilId local : false SANS aucun fetch ; échec réseau/jeton illisible : false', async () => {
    const fetchFactice = vi.fn();
    expect(
      await enregistrerAppareilPourSync(
        depsEnregistrement(fetchFactice as unknown as typeof fetch, {
          lireAppareilId: async () => null,
        }),
      ),
    ).toBe(false);
    expect(fetchFactice).not.toHaveBeenCalled();

    const jetante = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(
      await enregistrerAppareilPourSync(depsEnregistrement(jetante as unknown as typeof fetch)),
    ).toBe(false);

    const sansJeton = vi.fn(async () => reponseJson({ appareilId: 'uuid-1' }));
    expect(
      await enregistrerAppareilPourSync(depsEnregistrement(sansJeton as unknown as typeof fetch)),
    ).toBe(false);
  });

  it('creerDepsEnregistrementAppareil : câblage par défaut sans exception', () => {
    // Sans indexedDB (node) : lireAppareilId → null → false, fetch jamais parti.
    const deps = creerDepsEnregistrementAppareil();
    expect(deps.lireAppareilId()).resolves.toBeNull();
  });
});
