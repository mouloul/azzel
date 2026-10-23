import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSAGE_SCHEMA_VERSION,
  RETRAIT_SCHEMA_VERSION,
  SYNC_TERRAIN_MAX_LOT,
  cleIdempotenceEvenement,
  type EvenementSyncTerrain,
  type PassageTerrain,
  type RetraitTerrain,
} from '@azzel/shared';

import type { SessionRecord } from '@/modules/iam/store';
import { DbUnavailableError } from '@/modules/iam/errors';

import { compterStatuts, decouperEnTranches, calculerOffsetEstimeMs } from './domain';
import {
  AppareilClientInvalideError,
  AppareilNotFoundError,
  AppareilRevokedError,
  CorpsSyncInvalideError,
  JetonAppareilInvalideError,
  LotTropGrandError,
  toCourseApiError,
} from './errors';
import type { ChronoStore, StatutInsertion } from './store';
import {
  enregistrerAppareil,
  getEtatCourse,
  listerAppareils,
  premierRecu,
  revoquerAppareil,
  synchroniserLot,
  verifierJetonAppareil,
} from './service';

// Story 4.5 — tests unitaires du service chrono sur un store en mémoire :
// l'enregistrement exige une session, la sync n'exige QUE le jeton (AD-5),
// le lot répond PAR ÉVÉNEMENT (accepté/déjà-connu/rejeté+motif) avec compteurs,
// et l'arbitrage premier-reçu reste une simple lecture.

const SESSION: SessionRecord = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'karim@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const APPAREIL_AUTH = {
  id: 'appareil-uuid-1',
  organisationId: 'org-1',
  appareilClient: 'appareil-client-1',
};

const JETON_COUREUR = 'AbCdEfGhIjKlMnOpQrStUv'; // 22 caractères base64url

function retraitValide(surcharge: Partial<RetraitTerrain> = {}): RetraitTerrain {
  return {
    version: RETRAIT_SCHEMA_VERSION,
    type: 'retrait',
    editionId: 'edition-1',
    jeton: JETON_COUREUR,
    horodatage: '2027-05-16T06:12:30.000Z',
    appareilId: 'appareil-client-1',
    ...surcharge,
  };
}

function passageValide(surcharge: Partial<PassageTerrain> = {}): PassageTerrain {
  return {
    version: PASSAGE_SCHEMA_VERSION,
    type: 'passage',
    editionId: 'edition-1',
    jeton: JETON_COUREUR,
    checkpointId: 'mission-scan-km12',
    horodatage: '2027-05-16T07:05:09.000Z',
    appareilId: 'appareil-client-1',
    ...surcharge,
  };
}

function surFil(evenement: RetraitTerrain | PassageTerrain): EvenementSyncTerrain {
  return { ...evenement, cle: cleIdempotenceEvenement(evenement) };
}

function creerStoreFactice(overrides: Partial<ChronoStore> = {}): ChronoStore {
  return {
    trouverAppareilParHash: vi.fn(async () => ({
      id: APPAREIL_AUTH.id,
      organisationId: APPAREIL_AUTH.organisationId,
      appareilClient: APPAREIL_AUTH.appareilClient,
      revokedAt: null,
    })),
    enregistrerAppareil: vi.fn(async () => ({
      id: 'appareil-uuid-nouveau',
      jeton: 'jeton-brut-neuf',
      rotation: false,
    })),
    rafraichirLastSync: vi.fn(async () => undefined),
    insererLot: vi.fn(async (): Promise<StatutInsertion[]> => []),
    premierRecu: vi.fn(async () => null),
    listerAppareils: vi.fn(async () => []),
    revoquerAppareil: vi.fn(async () => null),
    etatCourse: vi.fn(async () => ({
      edition: null,
      partants: [],
      retraits: 0,
      arrives: 0,
      enCourse: 0,
      arriveeDefinie: false,
      checkpoints: [],
      fraicheur: null,
    })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('domaine chrono — pures', () => {
  it('decouperEnTranches : tranches ≤ max, rien de perdu, ordre conservé', () => {
    expect(decouperEnTranches([], 200)).toEqual([]);
    expect(decouperEnTranches([1, 2, 3], 200)).toEqual([[1, 2, 3]]);
    const tranches = decouperEnTranches(Array.from({ length: 450 }, (_, i) => i), 200);
    expect(tranches.map((t) => t.length)).toEqual([200, 200, 50]);
    expect(tranches.flat()).toEqual(Array.from({ length: 450 }, (_, i) => i));
  });

  it('compterStatuts : acceptés / déjà-connus / rejetés', () => {
    expect(
      compterStatuts([
        { cle: 'a', statut: 'accepté' },
        { cle: 'b', statut: 'déjà-connu' },
        { cle: 'c', statut: 'rejeté', motif: 'coureur inconnu' },
        { cle: 'd', statut: 'accepté' },
      ]),
    ).toEqual({ acceptes: 2, dejaConnus: 1, rejetes: 1 });
  });

  it('calculerOffsetEstimeMs : serveur − appareil, arrondi entier (donnée d’audit, AD-3)', () => {
    expect(
      calculerOffsetEstimeMs(
        new Date('2027-05-16T07:06:09.500Z'),
        new Date('2027-05-16T07:05:09.000Z'),
      ),
    ).toBe(60_500);
    // Horloge appareil en avance : offset négatif, conservé tel quel.
    expect(
      calculerOffsetEstimeMs(
        new Date('2027-05-16T07:05:00.000Z'),
        new Date('2027-05-16T07:05:09.000Z'),
      ),
    ).toBe(-9_000);
  });
});

describe('enregistrerAppareil — la session atteste l’appareil', () => {
  it('identifiant invalide (vide, non-chaîne, > 120) : AppareilClientInvalideError, store non appelé', async () => {
    const store = creerStoreFactice();
    await expect(enregistrerAppareil(SESSION, '', { store })).rejects.toBeInstanceOf(
      AppareilClientInvalideError,
    );
    await expect(enregistrerAppareil(SESSION, undefined, { store })).rejects.toBeInstanceOf(
      AppareilClientInvalideError,
    );
    await expect(
      enregistrerAppareil(SESSION, 'x'.repeat(121), { store }),
    ).rejects.toBeInstanceOf(AppareilClientInvalideError);
    expect(store.enregistrerAppareil).not.toHaveBeenCalled();
  });

  it('nominal : appareilId serveur + jeton BRUT retourné une fois, avec la org de la session', async () => {
    const store = creerStoreFactice();
    const resultat = await enregistrerAppareil(SESSION, 'appareil-client-1', { store });
    expect(resultat).toEqual({
      appareilId: 'appareil-uuid-nouveau',
      jeton: 'jeton-brut-neuf',
      rotation: false,
    });
    expect(store.enregistrerAppareil).toHaveBeenCalledWith({
      organisationId: 'org-1',
      appareilClient: 'appareil-client-1',
    });
  });
});

describe('verifierJetonAppareil — Bearer sans session (AD-5)', () => {
  it('hash inconnu : JetonAppareilInvalideError, rien d’autre touché', async () => {
    const store = creerStoreFactice({
      trouverAppareilParHash: vi.fn(async () => null),
    });
    await expect(verifierJetonAppareil('jeton-inconnu', { store })).rejects.toBeInstanceOf(
      JetonAppareilInvalideError,
    );
    expect(store.rafraichirLastSync).not.toHaveBeenCalled();
  });

  it('appareil révoqué : AppareilRevokedError DÉDIÉE (pas un jeton inconnu)', async () => {
    const store = creerStoreFactice({
      trouverAppareilParHash: vi.fn(async () => ({
        id: APPAREIL_AUTH.id,
        organisationId: APPAREIL_AUTH.organisationId,
        appareilClient: APPAREIL_AUTH.appareilClient,
        revokedAt: new Date('2027-05-16T05:00:00.000Z'),
      })),
    });
    await expect(verifierJetonAppareil('jeton-revoque', { store })).rejects.toBeInstanceOf(
      AppareilRevokedError,
    );
    expect(store.rafraichirLastSync).not.toHaveBeenCalled();
  });

  it('nominal : AppareilAuth résolu, last_sync_at PAS touché (il suivra l’ingestion)', async () => {
    const store = creerStoreFactice();
    const appareil = await verifierJetonAppareil('jeton-valide', { store });
    expect(appareil).toEqual(APPAREIL_AUTH);
    expect(store.rafraichirLastSync).not.toHaveBeenCalled();
  });
});

describe('synchroniserLot — réponse par événement + compteurs', () => {
  it('corps illisible (non-objet, evenements non tableau) : CorpsSyncInvalideError, store non appelé', async () => {
    const store = creerStoreFactice();
    await expect(synchroniserLot(APPAREIL_AUTH, null, { store })).rejects.toBeInstanceOf(
      CorpsSyncInvalideError,
    );
    await expect(
      synchroniserLot(APPAREIL_AUTH, { evenements: 'x' }, { store }),
    ).rejects.toBeInstanceOf(CorpsSyncInvalideError);
    expect(store.insererLot).not.toHaveBeenCalled();
  });

  it(`lot > ${SYNC_TERRAIN_MAX_LOT} : LotTropGrandError (${SYNC_TERRAIN_MAX_LOT} maximum)`, async () => {
    const store = creerStoreFactice();
    const evenements = Array.from({ length: SYNC_TERRAIN_MAX_LOT + 1 }, (_, index) =>
      surFil(retraitValide({ jeton: `${JETON_COUREUR.slice(0, 21)}${index % 10}` })),
    );
    await expect(
      synchroniserLot(APPAREIL_AUTH, { evenements }, { store }),
    ).rejects.toBeInstanceOf(LotTropGrandError);
    expect(store.insererLot).not.toHaveBeenCalled();
  });

  it('lot vide : 200 no-op (aucun événement, compteurs à zéro)', async () => {
    const store = creerStoreFactice({
      insererLot: vi.fn(async () => []),
    });
    const reponse = await synchroniserLot(APPAREIL_AUTH, { evenements: [] }, { store });
    expect(reponse.resultats).toEqual([]);
    expect(reponse.compteurs).toEqual({ acceptes: 0, dejaConnus: 0, rejetes: 0 });
    expect(reponse.recuA).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('événement hors contrat (clé forgée) : rejeté « contrat invalide » PAR ÉVÉNEMENT, JAMAIS stocké', async () => {
    const store = creerStoreFactice({
      insererLot: vi.fn(async (): Promise<StatutInsertion[]> => ['accepté']),
    });
    const valide = surFil(retraitValide());
    const forge = { ...passageValide(), cle: 'forgée' };
    const reponse = await synchroniserLot(APPAREIL_AUTH, { evenements: [valide, forge] }, { store });
    expect(reponse.resultats).toEqual([
      { cle: valide.cle, statut: 'accepté' },
      { cle: 'forgée', statut: 'rejeté', motif: 'contrat invalide' },
    ]);
    expect(reponse.compteurs).toEqual({ acceptes: 1, dejaConnus: 0, rejetes: 1 });
    // Seuls les événements de contrat partent en insertion — le forgé ne
    // touche JAMAIS la base, et ne bloque pas le reste du lot.
    expect(store.insererLot).toHaveBeenCalledWith({
      organisationId: 'org-1',
      evenements: [valide],
      reception: expect.any(Date),
    });
  });

  it('nominal mixte : accepté / déjà-connu / rejeté+motif, dans l’ordre du lot', async () => {
    const store = creerStoreFactice({
      insererLot: vi.fn(async (): Promise<StatutInsertion[]> => [
        'accepté',
        'déjà-connu',
        { rejeté: 'coureur inconnu' },
      ]),
    });
    const evenements = [
      surFil(retraitValide()),
      surFil(passageValide()),
      surFil(passageValide({ checkpointId: 'mission-scan-km30' })),
    ];
    const reponse = await synchroniserLot(APPAREIL_AUTH, { evenements }, { store });
    expect(reponse.resultats).toEqual([
      { cle: evenements[0]?.cle, statut: 'accepté' },
      { cle: evenements[1]?.cle, statut: 'déjà-connu' },
      { cle: evenements[2]?.cle, statut: 'rejeté', motif: 'coureur inconnu' },
    ]);
    expect(reponse.compteurs).toEqual({ acceptes: 1, dejaConnus: 1, rejetes: 1 });
    // L'insertion reçoit la org de l'APPAREIL (jamais d'une session)…
    expect(store.insererLot).toHaveBeenCalledWith({
      organisationId: 'org-1',
      evenements,
      reception: expect.any(Date),
    });
    // …et last_sync_at n'est rafraîchi qu'APRÈS l'ingestion réussie.
    expect(store.rafraichirLastSync).toHaveBeenCalledWith({
      organisationId: 'org-1',
      appareilId: 'appareil-uuid-1',
      maintenant: expect.any(Date),
    });
  });
});

describe('admin chrono — liste et révocation', () => {
  it('revoquerAppareil absent d’une autre org : AppareilNotFoundError', async () => {
    const store = creerStoreFactice({ revoquerAppareil: vi.fn(async () => null) });
    await expect(revoquerAppareil(SESSION, 'appareil-etranger', { store })).rejects.toBeInstanceOf(
      AppareilNotFoundError,
    );
  });

  it('revoquerAppareil nominal + listerAppareils : délégation org-scopée', async () => {
    const enregistrement = {
      id: 'appareil-uuid-1',
      appareilClient: 'appareil-client-1',
      revokedAt: null,
      lastSyncAt: null,
      createdAt: new Date('2026-10-23T08:00:00.000Z'),
    };
    const store = creerStoreFactice({
      revoquerAppareil: vi.fn(async () => ({
        ...enregistrement,
        revokedAt: new Date('2027-05-16T05:00:00.000Z'),
      })),
      listerAppareils: vi.fn(async () => [enregistrement]),
    });
    await expect(revoquerAppareil(SESSION, 'appareil-uuid-1', { store })).resolves.toMatchObject({
      id: 'appareil-uuid-1',
      revokedAt: expect.any(Date),
    });
    await expect(listerAppareils(SESSION, { store })).resolves.toHaveLength(1);
    expect(store.revoquerAppareil).toHaveBeenCalledWith({
      organisationId: 'org-1',
      appareilId: 'appareil-uuid-1',
      maintenant: expect.any(Date),
    });
  });

  it('premierRecu : lecture d’arbitrage déléguée à la org de la session', async () => {
    const store = creerStoreFactice();
    await premierRecu(
      SESSION,
      { editionId: 'edition-1', jeton: JETON_COUREUR, checkpointId: null },
      { store },
    );
    expect(store.premierRecu).toHaveBeenCalledWith({
      organisationId: 'org-1',
      editionId: 'edition-1',
      jeton: JETON_COUREUR,
      checkpointId: null,
    });
  });
});

describe('story 5.1 — getEtatCourse (service PC course)', () => {
  const RECORD_ETAT = {
    edition: { id: 'edition-1', nom: 'Édition 2027' },
    partants: [{ epreuveId: 'ep-1', epreuveNom: 'La Longue', total: 12 }],
    retraits: 3,
    arrives: 1,
    enCourse: 2,
    arriveeDefinie: true,
    checkpoints: [
      {
        id: 'cp-1',
        titre: 'Scan km 12',
        estArrivee: true,
        passages: [{ dossard: 101, horodatageReception: new Date('2027-05-16T07:05:09.000Z') }],
      },
    ],
    fraicheur: new Date('2027-05-16T07:05:09.000Z'),
  };

  it('sérialise le record (ISO) + abandones réservé 0 + genereA serveur', async () => {
    const etat = await getEtatCourse(SESSION, { store: creerStoreFactice({ etatCourse: vi.fn(async () => RECORD_ETAT) }) });
    expect(etat).toEqual({
      ...RECORD_ETAT,
      abandones: 0,
      checkpoints: [
        {
          id: 'cp-1',
          titre: 'Scan km 12',
          estArrivee: true,
          passages: [{ dossard: 101, horodatageReception: '2027-05-16T07:05:09.000Z' }],
        },
      ],
      fraicheur: '2027-05-16T07:05:09.000Z',
      genereA: expect.any(String),
    });
    expect(new Date(etat.genereA).getTime()).not.toBeNaN();
  });

  it('store en échec DbUnavailableError : le service PROPAGE (route → 503 admin.db_unavailable)', async () => {
    const store = creerStoreFactice({
      etatCourse: vi.fn(async () => {
        throw new DbUnavailableError(new Error('DATABASE_URL absente'));
      }),
    });
    await expect(getEtatCourse(SESSION, { store })).rejects.toBeInstanceOf(DbUnavailableError);
    // Et le mapper de la route en fait un 503 admin.db_unavailable (ci-dessous).
    const apiError = toCourseApiError(new DbUnavailableError(new Error('base absente')));
    expect(apiError.status).toBe(503);
    expect(apiError.envelope.error.code).toBe('admin.db_unavailable');
  });
});

describe('story 5.1 — toCourseApiError (mapper PC course)', () => {
  it('erreur inconnue : 500 admin.course.erreur_inconnue, jamais une enveloppe terrain', () => {
    const apiError = toCourseApiError(new Error('boom'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('admin.course.erreur_inconnue');
  });
});
