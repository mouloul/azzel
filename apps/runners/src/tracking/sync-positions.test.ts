import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_POSITION_MAX_LOT, cleIdempotencePosition } from '@azzel/shared';

import {
  creerPosterLotPositions,
  enregistrerAppareilPourSync,
  offsetMoyenLot,
  synchroniserPositions,
  synchroniserPositionsAvecEnregistrement,
  type DepsSyncPositions,
  type ReponsePosterLotPositions,
} from './sync-positions';
import type { EntreeJournalSync, PositionOutbox } from './outbox-sqlite';

// Story 6.2 — tests du moteur de sync des positions (deps entièrement
// injectées, aucun réseau) : tranches ≤ 200, découpe 413 en moitiés, 401
// jeton → register-then-retry (session), rejets restés en file + journal
// (offsets horloge SANS NaN), hors-ligne → outbox conservée, 400 TERMINAUX
// (lot-invalide) qui stoppent la boucle sans empiler, doitContinuer entre
// les lots (désactivation en vol). Plus l'adaptateur HTTP réel (fetchImpl
// injecté, pattern api-client.test.ts) et l'enregistrement d'appareil.

const suiviStoreMock = vi.hoisted(() => ({
  lireAppareilClient: vi.fn(async () => 'app-sync-1'),
  lireJetonAppareil: vi.fn(async () => null),
  ecrireJetonAppareil: vi.fn(async () => {}),
}));

// Le câblage réel (creerDepsSyncPositions) touche expo-sqlite/expo-secure-store
// (natifs — absents en node) : stubs d'identité, seules les pures du moteur
// sont testées via deps injectées.
vi.mock('./outbox-sqlite', () => ({ outboxSuivi: {} }));
vi.mock('./suivi-store', () => suiviStoreMock);

function position(capteA: string): PositionOutbox {
  return {
    cle: cleIdempotencePosition('app-sync-1', capteA),
    lat: 36.712345,
    lon: 3.187654,
    capteA,
  };
}

interface Harness {
  deps: DepsSyncPositions;
  marquées: string[][];
  journal: Omit<EntreeJournalSync, 'id'>[];
  posterLot: ReturnType<typeof vi.fn>;
  setJeton: (jeton: string | null) => void;
}

function creerHarness(options: {
  initial?: PositionOutbox[];
  reponses?: Array<ReponsePosterLotPositions>;
  doitContinuer?: () => boolean;
  /** Hook après un lot parti (désactivation simulée en vol). */
  apresLot?: () => void;
} = {}): Harness {
  let fichier = [...(options.initial ?? [])];
  const marquées: string[][] = [];
  const journal: Omit<EntreeJournalSync, 'id'>[] = [];
  const posterLot = vi.fn();
  const reponses = [...(options.reponses ?? [])];
  let jeton: string | null = 'jeton-appareil-valide';

  posterLot.mockImplementation(async (_jeton: string, _appareilId: string, lot: PositionOutbox[]) => {
    const prochaine = reponses.shift();
    const reponse: ReponsePosterLotPositions = prochaine ?? reponseOk(lot);
    if (reponse.ok) {
      const cles = reponse.reponse.resultats
        .filter((resultat) => resultat.statut !== 'rejeté')
        .map((resultat) => resultat.cle);
      fichier = fichier.filter((position) => !cles.includes(position.cle));
    }
    options.apresLot?.();
    return reponse;
  });

  const deps: DepsSyncPositions = {
    lireJeton: async () => jeton,
    lireAppareilId: async () => 'app-sync-1',
    enregistrer: async () => true,
    listerEnAttente: async (limite: number) => fichier.slice(0, limite),
    marquerEnvoyees: async (cles: string[]) => {
      marquées.push(cles);
    },
    ajouterEntreeJournal: async (entree) => {
      journal.push(entree);
    },
    compterEnAttente: async () => fichier.length,
    posterLot,
    doitContinuer: options.doitContinuer,
  };

  return {
    deps,
    marquées,
    journal,
    posterLot,
    setJeton: (nouveau) => {
      jeton = nouveau;
    },
  };
}

/** Réponse 200 serveur : chaque clé du lot acceptée ou déjà-connue. */
function reponseOk(
  lot: PositionOutbox[],
  statuts: ('accepté' | 'déjà-connu' | 'rejeté')[] = [],
): ReponsePosterLotPositions {
  const resultats = lot.map((position, index) =>
    statuts[index] === 'rejeté'
      ? { cle: position.cle, statut: 'rejeté' as const, motif: 'position invalide' }
      : { cle: position.cle, statut: (statuts[index] ?? 'accepté') as 'accepté' | 'déjà-connu' },
  );
  return {
    ok: true,
    reponse: {
      resultats,
      compteurs: {
        acceptes: resultats.filter((r) => r.statut === 'accepté').length,
        dejaConnus: resultats.filter((r) => r.statut === 'déjà-connu').length,
        rejetes: resultats.filter((r) => r.statut === 'rejeté').length,
      },
      recuA: '2027-05-16T07:13:00.000Z',
    },
  };
}

function reponseErreur(
  erreur: 'reseau' | 'appareil-revoque' | 'authentification' | 'lot-trop-grand',
): ReponsePosterLotPositions {
  return { ok: false, erreur };
}

beforeEach(() => {
  vi.clearAllMocks();
  suiviStoreMock.lireAppareilClient.mockResolvedValue('app-sync-1');
  suiviStoreMock.ecrireJetonAppareil.mockClear();
});

describe('synchroniserPositions — tranches ≤ 200', () => {
  it('250 positions → 2 lots (200 + 50), tout marqué envoyé, bandeau « file : 0 »', async () => {
    const positions = Array.from({ length: 250 }, (_, index) =>
      position(new Date(Date.UTC(2027, 4, 16, 7, 0, index)).toISOString()),
    );
    const harness = creerHarness({ initial: positions });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.statut).toBe('envoye');
    expect(resultat.lots).toBe(2);
    expect(harness.posterLot.mock.calls[0]?.[2]).toHaveLength(SYNC_POSITION_MAX_LOT);
    expect(harness.posterLot.mock.calls[1]?.[2]).toHaveLength(50);
    expect(resultat.envoyes).toBe(250);
    expect(resultat.enAttente).toBe(0);
  });

  it('jeton manquant : sans-jeton, aucune requête, la file reste affichée', async () => {
    const harness = creerHarness({ initial: [position('2027-05-16T07:05:09.000Z')] });
    harness.setJeton(null);
    const resultat = await synchroniserPositions(harness.deps);
    expect(resultat.statut).toBe('sans-jeton');
    expect(resultat.enAttente).toBe(1);
    expect(harness.posterLot).not.toHaveBeenCalled();
  });

  it('file vide : rien-a-envoyer, aucune requête', async () => {
    const harness = creerHarness();
    const resultat = await synchroniserPositions(harness.deps);
    expect(resultat.statut).toBe('rien-a-envoyer');
    expect(harness.posterLot).not.toHaveBeenCalled();
  });
});

describe('synchroniserPositions — idempotence client', () => {
  it('déjà-connu marque AUSSI envoyé (le serveur connaît)', async () => {
    const lot = [position('2027-05-16T07:05:09.000Z'), position('2027-05-16T07:12:09.000Z')];
    const harness = creerHarness({
      initial: lot,
      reponses: [reponseOk(lot, ['accepté', 'déjà-connu'])],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.envoyes).toBe(1);
    expect(resultat.dejaConnus).toBe(1);
    expect(harness.marquées[0]).toHaveLength(2);
    expect(resultat.enAttente).toBe(0);
  });

  it('rejetée : reste en file (journalisée, jamais perdue)', async () => {
    const lot = [position('2027-05-16T07:05:09.000Z'), position('2027-05-16T07:12:09.000Z')];
    const harness = creerHarness({
      initial: lot,
      reponses: [reponseOk(lot, ['accepté', 'rejeté'])],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.rejetes).toBe(1);
    expect(harness.marquées[0]).toHaveLength(1);
    expect(resultat.enAttente).toBe(1);
    expect(harness.journal[0]?.motifs).toEqual(['position invalide']);
  });

  it('journal : offset horloge moyen (recuA − capteA) sur les positions connues', async () => {
    // capteA 07:05:09 → recuA 07:13:00 = +471 000 ms exactement.
    const lot = [position('2027-05-16T07:05:09.000Z')];
    const harness = creerHarness({ initial: lot });

    await synchroniserPositions(harness.deps);

    expect(harness.journal[0]?.offsetMoyenMs).toBe(471_000);
  });
});

describe('synchroniserPositions — erreurs réseau', () => {
  it('hors-ligne au premier lot : reseau-indisponible, outbox CONSERVÉE', async () => {
    const harness = creerHarness({
      initial: [position('2027-05-16T07:05:09.000Z')],
      reponses: [reponseErreur('reseau')],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.statut).toBe('reseau-indisponible');
    expect(resultat.enAttente).toBe(1);
    expect(harness.marquées).toHaveLength(0);
  });

  it('coupure EN COURS de file : lots partiels partis, le reste conservé', async () => {
    const positions = Array.from({ length: 250 }, (_, index) =>
      position(new Date(Date.UTC(2027, 4, 16, 7, 0, index)).toISOString()),
    );
    const harness = creerHarness({
      initial: positions,
      reponses: [reponseOk(positions.slice(0, 200)), reponseErreur('reseau')],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.lots).toBe(1);
    expect(resultat.envoyes).toBe(200);
    expect(resultat.enAttente).toBe(50);
  });
});

describe('synchroniserPositions — 400 TERMINAUX (lot-invalide)', () => {
  it('lot-invalide : STOP net, motif JOURNALISÉ, rien de marqué, pas d’empilement', async () => {
    const lot = [position('2027-05-16T07:05:09.000Z'), position('2027-05-16T07:12:09.000Z')];
    const harness = creerHarness({
      initial: lot,
      reponses: [{ ok: false, erreur: 'lot-invalide', motif: 'Les positions envoyées ne correspondent pas à ce téléphone.' }],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.statut).toBe('lot-invalide');
    // UNE requête : la boucle ne réessaie pas le même octet (pas de retry infini).
    expect(harness.posterLot).toHaveBeenCalledTimes(1);
    expect(harness.marquées).toHaveLength(0);
    expect(resultat.enAttente).toBe(2);
    // Le motif remonte dans le journal (lecture seule côté écran).
    expect(harness.journal).toHaveLength(1);
    expect(harness.journal[0]?.motifs).toEqual([
      'Les positions envoyées ne correspondent pas à ce téléphone.',
    ]);
    expect(harness.journal[0]?.offsetMoyenMs).toBeNull();
  });

  it('lot-invalide APRÈS un lot réussi : le premier lot est parti, le terminal arrête le reste', async () => {
    const positions = Array.from({ length: 250 }, (_, index) =>
      position(new Date(Date.UTC(2027, 4, 16, 7, 0, index)).toISOString()),
    );
    const harness = creerHarness({
      initial: positions,
      reponses: [
        reponseOk(positions.slice(0, 200)),
        { ok: false, erreur: 'lot-invalide', motif: 'La requête est illisible.' },
      ],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.lots).toBe(1);
    expect(resultat.envoyes).toBe(200);
    expect(resultat.statut).toBe('lot-invalide');
    expect(resultat.enAttente).toBe(50);
  });
});

describe('synchroniserPositions — doitContinuer (désactivation en vol)', () => {
  it('false ENTRE les lots : arrêt propre, lots restants conservés', async () => {
    const positions = Array.from({ length: 250 }, (_, index) =>
      position(new Date(Date.UTC(2027, 4, 16, 8, 0, index)).toISOString()),
    );
    let desactive = false;
    const harness = creerHarness({
      initial: positions,
      // Après le premier lot réussi, la désactivation (logout) frappe.
      doitContinuer: () => !desactive,
      apresLot: () => {
        desactive = true;
      },
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(harness.posterLot).toHaveBeenCalledTimes(1);
    expect(resultat.envoyes).toBe(200);
    expect(resultat.enAttente).toBe(50);
  });

  it('doitContinuer absent : comportement inchangé (tous les lots partent)', async () => {
    const positions = Array.from({ length: 250 }, (_, index) =>
      position(new Date(Date.UTC(2027, 4, 16, 9, 0, index)).toISOString()),
    );
    const harness = creerHarness({ initial: positions });
    const resultat = await synchroniserPositions(harness.deps);
    expect(resultat.lots).toBe(2);
  });
});

describe('synchroniserPositions — 413 découpe réactive', () => {
  it('413 sur 100 → deux moitiés de 50 acceptées', async () => {
    const positions = Array.from({ length: 100 }, (_, index) =>
      position(new Date(Date.UTC(2027, 4, 16, 8, 0, index)).toISOString()),
    );
    const harness = creerHarness({
      initial: positions,
      reponses: [
        reponseErreur('lot-trop-grand'),
        reponseOk(positions.slice(0, 50)),
        reponseOk(positions.slice(50)),
      ],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.statut).toBe('envoye');
    expect(harness.posterLot.mock.calls[0]?.[2]).toHaveLength(100);
    expect(harness.posterLot.mock.calls[1]?.[2]).toHaveLength(50);
    expect(harness.posterLot.mock.calls[2]?.[2]).toHaveLength(50);
    expect(resultat.envoyes).toBe(100);
  });

  it('413 sur une position SEULE : reseau-indisponible (insécable), rien de perdu', async () => {
    const harness = creerHarness({
      initial: [position('2027-05-16T07:05:09.000Z')],
      reponses: [reponseErreur('lot-trop-grand')],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.statut).toBe('reseau-indisponible');
    expect(resultat.enAttente).toBe(1);
  });
});

describe('synchroniserPositions — appareil révoqué (AD-5)', () => {
  it('401 révoqué : STOP net, rien n’est marqué, statut dédié', async () => {
    const harness = creerHarness({
      initial: [position('2027-05-16T07:05:09.000Z')],
      reponses: [reponseErreur('appareil-revoque')],
    });

    const resultat = await synchroniserPositions(harness.deps);

    expect(resultat.statut).toBe('appareil-revoque');
    expect(resultat.enAttente).toBe(1);
    expect(harness.marquées).toHaveLength(0);
  });
});

describe('synchroniserPositionsAvecEnregistrement — 401 jeton → register-then-retry', () => {
  it('jeton inconnu : ré-enregistrement via session PUIS rejeu du lot', async () => {
    const lot = [position('2027-05-16T07:05:09.000Z')];
    const harness = creerHarness({
      initial: lot,
      reponses: [reponseErreur('authentification'), reponseOk(lot)],
    });
    let enregistre = false;
    harness.deps.enregistrer = vi.fn(async () => {
      enregistre = true;
      harness.setJeton('jeton-renouvele');
      return true;
    });

    const resultat = await synchroniserPositionsAvecEnregistrement(harness.deps);

    expect(enregistre).toBe(true);
    expect(resultat.statut).toBe('envoye');
    expect(resultat.envoyes).toBe(1);
    // Le rejeu part avec le jeton RENOUVELÉ.
    expect(harness.posterLot.mock.calls[1]?.[0]).toBe('jeton-renouvele');
  });

  it('session morte aussi : sync différée (hors-ligne apparent), rien de perdu', async () => {
    const harness = creerHarness({ initial: [position('2027-05-16T07:05:09.000Z')] });
    harness.setJeton(null);
    harness.deps.enregistrer = vi.fn(async () => false);

    const resultat = await synchroniserPositionsAvecEnregistrement(harness.deps);

    expect(resultat.statut).toBe('sans-jeton');
    expect(resultat.enAttente).toBe(1);
  });

  it('jeton valide dès le départ : l’enregistrement n’est JAMAIS appelé', async () => {
    const harness = creerHarness({ initial: [position('2027-05-16T07:05:09.000Z')] });
    harness.deps.enregistrer = vi.fn(async () => {
      throw new Error('ne doit pas être appelé');
    });

    const resultat = await synchroniserPositionsAvecEnregistrement(harness.deps);

    expect(resultat.statut).toBe('envoye');
  });
});

describe('synchroniserPositions — erreurs de stockage local', () => {
  it('une dep de stockage qui JETE rejette vers l’appelant (le câblage l’attrape)', async () => {
    const harness = creerHarness({ initial: [position('2027-05-16T07:05:09.000Z')] });
    harness.deps.listerEnAttente = async () => {
      throw new Error('SQLite corrompue');
    };

    await expect(synchroniserPositions(harness.deps)).rejects.toBeInstanceOf(Error);
  });
});

describe('offsetMoyenLot — jamais de NaN', () => {
  it('moyenne des écarts serveur − appareil', () => {
    const positions = [
      position('2027-05-16T07:05:09.000Z'),
      position('2027-05-16T07:12:09.000Z'),
    ];
    // recuA 07:13:00 : +471 000 et +51 000 → moyenne 261 000.
    expect(offsetMoyenLot('2027-05-16T07:13:00.000Z', positions)).toBe(261_000);
  });

  it('capteA ILLISIBLE : ignoré — jamais NaN dans le journal', () => {
    const positions = [position('pas-une-date'), position('2027-05-16T07:05:09.000Z')];
    expect(offsetMoyenLot('2027-05-16T07:13:00.000Z', positions)).toBe(471_000);
  });

  it('tout illisible ou lot vide ou recuA illisible : null', () => {
    expect(offsetMoyenLot('2027-05-16T07:13:00.000Z', [position('nimporte')])).toBeNull();
    expect(offsetMoyenLot('2027-05-16T07:13:00.000Z', [])).toBeNull();
    expect(offsetMoyenLot('nimporte', [position('2027-05-16T07:05:09.000Z')])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adaptateur HTTP réel (fetchImpl injecté — pattern api-client.test.ts).
// ---------------------------------------------------------------------------

function reponseHttp(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json' },
  });
}

function fetchToujours(reponse: Response): typeof fetch {
  return (async () => reponse) as unknown as typeof fetch;
}

describe('creerPosterLotPositions — adaptateur HTTP', () => {
  const poster = creerPosterLotPositions((async () => {
    throw new Error('jamais appelé');
  }) as unknown as typeof fetch);
  const LOT = [position('2027-05-16T07:05:09.000Z')];

  it('401 tracking.appareil_revoked → appareil-revoque', async () => {
    const adaptateur = creerPosterLotPositions(
      fetchToujours(
        reponseHttp(401, {
          version: 1,
          error: {
            code: 'tracking.appareil_revoked',
            message: 'x',
            action: 'y',
          },
        }),
      ),
    );
    await expect(adaptateur('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'appareil-revoque',
    });
  });

  it('401 autre code → authentification', async () => {
    const adaptateur = creerPosterLotPositions(
      fetchToujours(
        reponseHttp(401, {
          version: 1,
          error: { code: 'tracking.jeton_invalide', message: 'x', action: 'y' },
        }),
      ),
    );
    await expect(adaptateur('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'authentification',
    });
  });

  it('413 → lot-trop-grand (le moteur découpera)', async () => {
    const adaptateur = creerPosterLotPositions(
      fetchToujours(
        reponseHttp(413, {
          version: 1,
          error: { code: 'tracking.lot_trop_grand', message: 'x', action: 'y' },
        }),
      ),
    );
    await expect(adaptateur('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'lot-trop-grand',
    });
  });

  it('400 tracking.position_invalide → lot-invalide TERMINAL avec motif', async () => {
    const adaptateur = creerPosterLotPositions(
      fetchToujours(
        reponseHttp(400, {
          version: 1,
          error: {
            code: 'tracking.position_invalide',
            message: 'Les positions envoyées ne correspondent pas à ce téléphone.',
            action: 'y',
          },
        }),
      ),
    );
    await expect(adaptateur('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'lot-invalide',
      motif: 'Les positions envoyées ne correspondent pas à ce téléphone.',
    });
  });

  it('400 tracking.corps_invalide → lot-invalide TERMINAL aussi', async () => {
    const adaptateur = creerPosterLotPositions(
      fetchToujours(
        reponseHttp(400, {
          version: 1,
          error: { code: 'tracking.corps_invalide', message: 'La requête est illisible.', action: 'y' },
        }),
      ),
    );
    await expect(adaptateur('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'lot-invalide',
      motif: 'La requête est illisible.',
    });
  });

  it('fetch qui jette (réseau coupé / timeout) → reseau', async () => {
    await expect(poster('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'reseau',
    });
  });

  it('200 malformé (compteurs absents) → reseau', async () => {
    const adaptateur = creerPosterLotPositions(
      fetchToujours(reponseHttp(200, { resultats: [], recuA: 'x' })),
    );
    await expect(adaptateur('jeton', 'app-sync-1', LOT)).resolves.toEqual({
      ok: false,
      erreur: 'reseau',
    });
  });

  it('200 bien formé → ok + corps du contrat (appareilId + version au fil)', async () => {
    let corpsRecu: unknown = null;
    const adaptateur = creerPosterLotPositions((async (_url: string, init?: RequestInit) => {
      corpsRecu = JSON.parse(String(init?.body));
      return reponseHttp(200, {
        resultats: [{ cle: 'position:v1:app-sync-1:2027-05-16T07:05:09.000Z', statut: 'accepté' }],
        compteurs: { acceptes: 1, dejaConnus: 0, rejetes: 0 },
        recuA: '2027-05-16T07:13:00.000Z',
      });
    }) as unknown as typeof fetch);
    const resultat = await adaptateur('jeton', 'app-sync-1', LOT);
    expect(resultat.ok).toBe(true);
    // Le fil porte l'appareilId du lot et la VERSION du contrat shared.
    expect(corpsRecu).toEqual({
      appareilId: 'app-sync-1',
      positions: [{ version: 1, lat: 36.712345, lon: 3.187654, capteA: '2027-05-16T07:05:09.000Z' }],
    });
  });
});

describe('enregistrerAppareilPourSync — enregistrement (fetchImpl injecté)', () => {
  const URL = 'http://localhost:3000/api/coureur/tracking/appareil';

  it('sans token de session : false, AUCUNE requête', async () => {
    const fetchImpl = vi.fn();
    await expect(enregistrerAppareilPourSync(null, fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('200 { jeton } : jeton STOCKÉ (SecureStore) → true', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      reponseHttp(200, { appareilServeurId: 'uuid-1', jeton: 'jeton-brut-9' }),
    );
    await expect(
      enregistrerAppareilPourSync('session', fetchImpl as unknown as typeof fetch),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer session');
    expect(JSON.parse(String(init.body))).toEqual({ appareilClient: 'app-sync-1' });
    expect(suiviStoreMock.ecrireJetonAppareil).toHaveBeenCalledWith('jeton-brut-9');
  });

  it('!ok (401 session morte) : false, jeton NON stocké', async () => {
    const fetchImpl = vi.fn(async () =>
      reponseHttp(401, {
        version: 1,
        error: { code: 'iam.unauthenticated', message: 'x', action: 'y' },
      }),
    );
    await expect(
      enregistrerAppareilPourSync('session-morte', fetchImpl as unknown as typeof fetch),
    ).resolves.toBe(false);
    expect(suiviStoreMock.ecrireJetonAppareil).not.toHaveBeenCalled();
  });

  it('réseau qui jette : false, jeton NON stocké', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('hors-ligne');
    });
    await expect(
      enregistrerAppareilPourSync('session', fetchImpl as unknown as typeof fetch),
    ).resolves.toBe(false);
    expect(suiviStoreMock.ecrireJetonAppareil).not.toHaveBeenCalled();
  });

  it('session INVALIDÉE en vol (garde par génération) : jeton reçu mais JAMAIS écrit', async () => {
    const fetchImpl = vi.fn(async () =>
      reponseHttp(200, { appareilServeurId: 'uuid-1', jeton: 'jeton-d-avant-logout' }),
    );
    // Le logout a frappé pendant la requête : la génération capturée ne
    // vaut plus.
    await expect(
      enregistrerAppareilPourSync('session', fetchImpl as unknown as typeof fetch, 'http://localhost:3000', {
        sessionValable: () => false,
      }),
    ).resolves.toBe(false);
    expect(suiviStoreMock.ecrireJetonAppareil).not.toHaveBeenCalled();
  });
});
