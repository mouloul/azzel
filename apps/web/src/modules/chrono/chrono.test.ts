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

import {
  compterStatuts, decouperEnTranches, calculerOffsetEstimeMs, normaliserSaisieAbandon, validerSaisieAbandon, estMotifAbandon, TOLERANCE_HORLOGE_MS, MOTIFS_ABANDON, MAX_MOTIF_ANNULATION_LENGTH, normaliserSaisieAnnulation, validerSaisieAnnulation, HEURE_DEPART_MINIMALE_MS, normaliserSaisieHeuresDepart, validerSaisieHeuresDepart } from './domain';
import {
  AbandonAvantDepartError,
  AbandonDejaAbandonneError,
  AbandonDejaArriveError,
  AbandonDossardInconnuError,
  AbandonPasPartiError,
  AnnulationEvenementIntrouvableError,
  AnnulationRetraitRefuseError,
  AppareilClientInvalideError,
  AppareilNotFoundError,
  AppareilRevokedError,
  CorpsAbandonInvalideError,
  CorpsAbandonTropGrandError,
  CorpsAnnulationInvalideError,
  CorpsAnnulationTropGrandError,
  CorpsHeuresDepartInvalideError,
  CorpsHeuresDepartTropGrandError,
  CorpsSyncInvalideError,
  HeuresDepartEpreuveInconnueError,
  HeuresDepartSansEditionError,
  InvalidAbandonFieldsError,
  InvalidAnnulationFieldsError,
  InvalidHeuresDepartFieldsError,
  JetonAppareilInvalideError,
  LotTropGrandError,
  toCourseApiError,
  toResultatsPublicApiError,
} from './errors';
import type { ChronoStore, StatutInsertion } from './store';
import {
  annulerPassage,
  compterVisitePartage,
  enregistrerAppareil,
  enregistrerHeuresDepart,
  getClassements,
  getEtatCourse,
  getHeuresDepart,
  getResultatsPublic,
  listerAppareils,
  premierRecu,
  resetResultatsPublicCacheForTests,
  revoquerAppareil,
  saisirAbandon,
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

/** Record abandon factice (retour du store en mémoire). */
const ABANDON_RECORD = {
  id: 'abandon-1',
  editionId: 'edition-1',
  jetonCoureur: JETON_COUREUR,
  lieu: 'Col 1200',
  motif: 'epuisement' as const,
  horodatage: new Date('2027-05-16T10:05:00.000Z'),
  auteurEmail: 'pc@exemple.dz',
  horodatageReception: new Date('2027-05-16T10:06:00.000Z'),
};

/** Résultat d'annulation factice (retour du store en mémoire, story 5.4). */
const ANNULATION_RESULTAT = {
  dejaAnnule: false,
  evenementId: '11111111-1111-4111-8111-111111111111',
  dossard: 101,
  checkpointTitre: 'Scan km 12',
};

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
      abandones: 0,
      enCourse: 0,
      arriveeDefinie: false,
      checkpoints: [],
      alertes: [],
      fraicheur: null,
    })),
    saisirAbandon: vi.fn(async () => ABANDON_RECORD),
    annulerPassage: vi.fn(async () => ANNULATION_RESULTAT),
    classements: vi.fn(async () => ({
      edition: null,
      epreuves: [],
      fraicheur: null,
    })),
    listerHeuresDepart: vi.fn(async () => ({ edition: null, epreuves: [] })),
    enregistrerHeuresDepart: vi.fn(async () => []),
    organisationParDefautId: vi.fn(async () => 'org-1'),
    compterVisitePartage: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  // Le micro-cache de getResultatsPublic est un état module : invalidé entre
  // chaque test (isolation des stores factices).
  resetResultatsPublicCacheForTests();
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
    abandones: 1,
    enCourse: 1,
    arriveeDefinie: true,
    checkpoints: [
      {
        id: 'cp-1',
        titre: 'Scan km 12',
        estArrivee: true,
        passages: [
          {
            evenementId: '11111111-1111-4111-8111-111111111111',
            dossard: 101,
            horodatageReception: new Date('2027-05-16T07:05:09.000Z'),
          },
        ],
      },
    ],
    alertes: [
      {
        dossard: 101,
        checkpointId: 'cp-1',
        checkpointTitre: 'Scan km 12',
        barriereLe: new Date('2027-05-16T10:00:00.000Z'),
        contactSecteur: '+213 555 010 203',
      },
    ],
    fraicheur: new Date('2027-05-16T07:05:09.000Z'),
  };

  it('sérialise le record (ISO), abandones du record inclus (5.3), genereA serveur', async () => {
    const etat = await getEtatCourse(SESSION, { store: creerStoreFactice({ etatCourse: vi.fn(async () => RECORD_ETAT) }) });
    expect(etat).toEqual({
      ...RECORD_ETAT,
      checkpoints: [
        {
          id: 'cp-1',
          titre: 'Scan km 12',
          estArrivee: true,
          passages: [
            {
              evenementId: '11111111-1111-4111-8111-111111111111',
              dossard: 101,
              horodatageReception: '2027-05-16T07:05:09.000Z',
            },
          ],
        },
      ],
      alertes: [
        {
          dossard: 101,
          checkpointId: 'cp-1',
          checkpointTitre: 'Scan km 12',
          barriereLe: '2027-05-16T10:00:00.000Z',
          contactSecteur: '+213 555 010 203',
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

// ---------------------------------------------------------------------------
// Story 5.3 — saisie des abandons : domaine (liste fermée, normalisation,
// validation), service (délégation, auteur tracé), mapper (400 champ + 409).
// ---------------------------------------------------------------------------

describe('story 5.3 — domaine abandon : motifs fermés, normalisation, validation', () => {
  it('MOTIFS_ABANDON : liste fermée métier, estMotifAbandon refuse tout le reste', () => {
    expect(MOTIFS_ABANDON).toEqual([
      'blessure',
      'epuisement',
      'hors_delais',
      'abandon_volontaire',
      'autre',
    ]);
    expect(MOTIFS_ABANDON.map((motif) => estMotifAbandon(motif)).every(Boolean)).toBe(true);
  });

  it('normaliserSaisieAbandon : dossard nombre OU chaîne de chiffres, lieu trimé, motif fermé, heure brute', () => {
    expect(normaliserSaisieAbandon({ dossard: 102, lieu: '  Col 1200 ', motif: 'blessure', heure: '2027-05-16T10:05:00.000Z' })).toEqual({
      dossard: 102,
      lieu: 'Col 1200',
      motif: 'blessure',
      heure: '2027-05-16T10:05:00.000Z',
    });
    expect(normaliserSaisieAbandon({ dossard: ' 102 ', lieu: '', motif: 'autre', heure: '2027-05-16T10:05:00.000Z' }).dossard).toBe(102);
  });

  it('normaliserSaisieAbandon : garbage isolé — dossard non numérique, motif hors liste, heure absente', () => {
    expect(normaliserSaisieAbandon(null)).toEqual({ dossard: null, lieu: '', motif: null, heure: null });
    expect(normaliserSaisieAbandon({ dossard: 'abc', motif: 'envie', heure: 42 })).toEqual({
      dossard: null,
      lieu: '',
      motif: null,
      heure: null,
    });
  });

  it('validerSaisieAbandon : chaque champ a son erreur (dossard, lieu, motif, heure)', () => {
    const maintenant = new Date('2027-05-16T10:30:00.000Z');
    const errors = validerSaisieAbandon(
      { dossard: null, lieu: '', motif: null, heure: null },
      maintenant,
    );
    expect(Object.keys(errors).sort()).toEqual(['dossard', 'heure', 'lieu', 'motif']);
    expect(errors.lieu).toContain('obligatoire');
    expect(errors.motif).toContain('liste');
  });

  it('validerSaisieAbandon : heure future au-delà de la tolérance refusée, ISO sans Z refusé', () => {
    const maintenant = new Date('2027-05-16T10:30:00.000Z');
    // +3 min : au-delà de la tolérance d'horloge (+2 min) → refus.
    const future = validerSaisieAbandon(
      { dossard: 102, lieu: 'Col 1200', motif: 'blessure', heure: '2027-05-16T10:33:00.000Z' },
      maintenant,
    );
    expect(future.heure).toBe(
      'L’heure d’abandon ne peut pas être dans le futur (vérifie l’horloge du poste).',
    );
    const sansZ = validerSaisieAbandon(
      { dossard: 102, lieu: 'Col 1200', motif: 'blessure', heure: '2027-05-16T10:00:00.000' },
      maintenant,
    );
    expect(sansZ.heure).toBe('Indiquez la date et l’heure de l’abandon.');
  });

  it('validerSaisieAbandon : heure ≤ maintenant + TOLERANCE_HORLOGE_MS valide (dérive horloge PC)', () => {
    const maintenant = new Date('2027-05-16T10:30:00.000Z');
    // +1 min puis exactement +2 min (borne incluse) : valides.
    for (const heure of ['2027-05-16T10:31:00.000Z', '2027-05-16T10:32:00.000Z']) {
      const errors = validerSaisieAbandon(
        { dossard: 102, lieu: 'Col 1200', motif: 'blessure', heure },
        maintenant,
      );
      expect(errors.heure).toBeUndefined();
    }
    expect(TOLERANCE_HORLOGE_MS).toBe(120_000);
  });

  it('validerSaisieAbandon : saisie nominale (heure = maintenant, bornes incluses)', () => {
    const maintenant = new Date('2027-05-16T10:30:00.000Z');
    const errors = validerSaisieAbandon(
      { dossard: 102, lieu: 'Col 1200', motif: 'hors_delais', heure: '2027-05-16T10:30:00.000Z' },
      maintenant,
    );
    expect(Object.values(errors).every((message) => message === undefined)).toBe(true);
  });
});

describe('story 5.3 — saisirAbandon (service)', () => {
  // Heure de saisie RELATIVE (il y a 10 min) : la validation serveur compare
  // à l'horloge RÉELLE — une date fixe future deviendrait une bombe temporelle.
  const heurePassee = new Date(Date.now() - 600_000);
  const SAISIE_VALIDE = {
    dossard: 102,
    lieu: 'Col 1200',
    motif: 'epuisement',
    heure: heurePassee.toISOString(),
  };

  it('champs invalides : InvalidAbandonFieldsError, store non appelé', async () => {
    const store = creerStoreFactice();
    await expect(
      saisirAbandon(SESSION, { ...SAISIE_VALIDE, heure: new Date(Date.now() + 3_600_000).toISOString() }, { store }),
    ).rejects.toBeInstanceOf(InvalidAbandonFieldsError);
    await expect(saisirAbandon(SESSION, { lieu: 'Col' }, { store })).rejects.toBeInstanceOf(
      InvalidAbandonFieldsError,
    );
    expect(store.saisirAbandon).not.toHaveBeenCalled();
  });

  it('nominal : délégation org + auteur = email de la session, réponse sérialisée', async () => {
    const store = creerStoreFactice();
    const abandon = await saisirAbandon(SESSION, SAISIE_VALIDE, { store });
    // La réponse porte le RECORD du store (source de vérité), le dossard SAISI.
    expect(abandon).toEqual({
      dossard: 102,
      lieu: ABANDON_RECORD.lieu,
      motif: ABANDON_RECORD.motif,
      heure: ABANDON_RECORD.horodatage.toISOString(),
    });
    expect(store.saisirAbandon).toHaveBeenCalledWith({
      organisationId: 'org-1',
      dossard: 102,
      lieu: 'Col 1200',
      motif: 'epuisement',
      horodatage: heurePassee,
      auteurEmail: 'karim@exemple.dz',
      maintenant: expect.any(Date),
    });
  });

  it('refus de course : les erreurs du store se PROPAGENT (route → 409/400)', async () => {
    for (const erreur of [
      new AbandonDossardInconnuError(),
      new AbandonPasPartiError(),
      new AbandonDejaArriveError(),
      new AbandonDejaAbandonneError(),
    ]) {
      const store = creerStoreFactice({
        saisirAbandon: vi.fn(async () => {
          throw erreur;
        }),
      });
      await expect(saisirAbandon(SESSION, SAISIE_VALIDE, { store })).rejects.toBe(erreur);
    }
  });
});

describe('story 5.3 — toCourseApiError (mapper saisie abandon)', () => {
  it('champs invalides : 400 + fields, enveloppe admin.course.abandon_champs_invalides', () => {
    const apiError = toCourseApiError(
      new InvalidAbandonFieldsError({ dossard: 'Indique un numéro de dossard.' }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.dossard).toContain('dossard');
    expect(apiError.envelope.error.code).toBe('admin.course.abandon_champs_invalides');
  });

  it('dossard inconnu : 400 + erreur champ dossard, enveloppe dédiée', () => {
    const apiError = toCourseApiError(new AbandonDossardInconnuError());
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.dossard).toContain('Dossard inconnu');
    expect(apiError.envelope.error.code).toBe('admin.course.abandon_dossard_inconnu');
  });

  it('heure avant le départ du coureur : 400 + erreur champ heure, enveloppe dédiée', () => {
    const apiError = toCourseApiError(new AbandonAvantDepartError());
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.heure).toContain('avant le départ du coureur');
    expect(apiError.envelope.error.code).toBe('admin.course.abandon_avant_depart');
  });

  it('refus de course (AD-3) : 409 sans fields, enveloppes dédiées et vouvoyées', () => {
    for (const [erreur, code] of [
      [new AbandonPasPartiError(), 'admin.course.abandon_pas_parti'],
      [new AbandonDejaArriveError(), 'admin.course.abandon_deja_arrive'],
      [new AbandonDejaAbandonneError(), 'admin.course.abandon_deja_abandonne'],
    ] as const) {
      const apiError = toCourseApiError(erreur);
      expect(apiError.status).toBe(409);
      expect(apiError.fields).toBeUndefined();
      expect(apiError.envelope.error.code).toBe(code);
      // Vouvoiement (surface PC) : jamais de tutoiement terrain.
      expect(apiError.envelope.error.action).not.toMatch(/\b[Rr]éessaie\b/);
    }
  });

  it('gardes de corps : 400 illisible, 413 trop grand', () => {
    expect(toCourseApiError(new CorpsAbandonInvalideError()).status).toBe(400);
    expect(
      toCourseApiError(new CorpsAbandonTropGrandError(1024)).envelope.error.code,
    ).toBe('admin.course.abandon_corps_trop_grand');
    expect(toCourseApiError(new CorpsAbandonTropGrandError(1024)).status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// Story 5.4 — annulation auditable des passages : domaine (normalisation,
// validation motif 1–500), service (délégation, auteur tracé), mapper
// (400 champ + fields, 404 introuvable/RLS, 409 retrait refusé, 413).
// ---------------------------------------------------------------------------

const EVENEMENT_ID = '22222222-3333-4222-8222-222222222222';

describe('story 5.4 — domaine annulation : normalisation, validation motif 1–500', () => {
  it('normaliserSaisieAnnulation : evenementId et motif trimés, garbage isolé', () => {
    expect(
      normaliserSaisieAnnulation({ evenementId: ` ${EVENEMENT_ID} `, motif: '  Mauvais scan  ' }),
    ).toEqual({ evenementId: EVENEMENT_ID, motif: 'Mauvais scan' });
    expect(normaliserSaisieAnnulation(null)).toEqual({ evenementId: null, motif: '' });
    expect(normaliserSaisieAnnulation({ evenementId: 42, motif: null })).toEqual({
      evenementId: null,
      motif: '',
    });
  });

  it('validerSaisieAnnulation : evenementId requis, motif OBLIGATOIRE 1–500', () => {
    const vide = validerSaisieAnnulation({ evenementId: null, motif: '' });
    expect(vide.evenementId).toContain('indéterminé');
    expect(vide.motif).toBe('Le motif est obligatoire.');
    const tropLong = validerSaisieAnnulation({
      evenementId: EVENEMENT_ID,
      motif: 'x'.repeat(MAX_MOTIF_ANNULATION_LENGTH + 1),
    });
    expect(tropLong.motif).toBe(
      `${MAX_MOTIF_ANNULATION_LENGTH} caractères maximum pour le motif.`,
    );
    // Bornes incluses : 1 et exactement 500 caractères passent.
    for (const motif of ['x', 'x'.repeat(MAX_MOTIF_ANNULATION_LENGTH)]) {
      const errors = validerSaisieAnnulation({ evenementId: EVENEMENT_ID, motif });
      expect(Object.values(errors).every((message) => message === undefined)).toBe(true);
    }
    expect(MAX_MOTIF_ANNULATION_LENGTH).toBe(500);
  });
});

describe('story 5.4 — annulerPassage (service)', () => {
  it('champs invalides (evenementId absent, motif vide) : InvalidAnnulationFieldsError, store non appelé', async () => {
    const store = creerStoreFactice();
    await expect(annulerPassage(SESSION, { motif: '' }, { store })).rejects.toBeInstanceOf(
      InvalidAnnulationFieldsError,
    );
    await expect(annulerPassage(SESSION, { evenementId: EVENEMENT_ID }, { store })).rejects.toBeInstanceOf(
      InvalidAnnulationFieldsError,
    );
    expect(store.annulerPassage).not.toHaveBeenCalled();
  });

  it('nominal : délégation org + auteur = email de la session, résultat du store rendu tel quel', async () => {
    const store = creerStoreFactice();
    const resultat = await annulerPassage(
      SESSION,
      { evenementId: EVENEMENT_ID, motif: 'Mauvais scan du dossard voisin' },
      { store },
    );
    expect(resultat).toBe(ANNULATION_RESULTAT);
    // Pas d'horodatage applicatif : l'audit vit du DEFAULT now() SQL (0029).
    expect(store.annulerPassage).toHaveBeenCalledWith({
      organisationId: 'org-1',
      evenementId: EVENEMENT_ID,
      motif: 'Mauvais scan du dossard voisin',
      auteurEmail: 'karim@exemple.dz',
    });
  });

  it('refus du store : les erreurs se PROPAGENT (route → 404/409)', async () => {
    for (const erreur of [
      new AnnulationEvenementIntrouvableError(),
      new AnnulationRetraitRefuseError(),
    ]) {
      const store = creerStoreFactice({
        annulerPassage: vi.fn(async () => {
          throw erreur;
        }),
      });
      await expect(
        annulerPassage(SESSION, { evenementId: EVENEMENT_ID, motif: 'Doublon appareil' }, { store }),
      ).rejects.toBe(erreur);
    }
  });
});

describe('story 5.4 — toCourseApiError (mapper annulation)', () => {
  it('champs invalides : 400 + fields, enveloppe admin.course.annulation_champs_invalides', () => {
    const apiError = toCourseApiError(
      new InvalidAnnulationFieldsError({ motif: 'Le motif est obligatoire.' }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.motif).toContain('obligatoire');
    expect(apiError.envelope.error.code).toBe('admin.course.annulation_champs_invalides');
  });

  it('introuvable (id inconnu, non-UUID, autre org/RLS) : 404 sans fields', () => {
    const apiError = toCourseApiError(new AnnulationEvenementIntrouvableError());
    expect(apiError.status).toBe(404);
    expect(apiError.fields).toBeUndefined();
    expect(apiError.envelope.error.code).toBe('admin.course.annulation_introuvable');
    expect(apiError.envelope.error.message).toContain('n’existe pas');
  });

  it('retrait refusé (V1) : 409 « seuls les passages peuvent être annulés », vouvoyé', () => {
    const apiError = toCourseApiError(new AnnulationRetraitRefuseError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.course.annulation_retrait_refuse');
    expect(apiError.envelope.error.message).toBe('Seuls les passages peuvent être annulés.');
    expect(apiError.envelope.error.action).not.toMatch(/\b[Rr]éessaie\b/);
  });

  it('gardes de corps : 400 illisible, 413 trop grand', () => {
    expect(toCourseApiError(new CorpsAnnulationInvalideError()).status).toBe(400);
    expect(
      toCourseApiError(new CorpsAnnulationTropGrandError(1024)).envelope.error.code,
    ).toBe('admin.course.annulation_corps_trop_grand');
    expect(toCourseApiError(new CorpsAnnulationTropGrandError(1024)).status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// Story 7.1 — classements par épreuve (départs échelonnés) et heures de
// départ : domaine (normalisation/validation), service (assemblage des rangs,
// temps, statuts, configure) et mapper (400 + fields PAR ÉPREUVE).
// ---------------------------------------------------------------------------

const EPREUVE_LONGUE_ID = 'epreuve-longue';
const EPREUVE_MOYENNE_ID = 'epreuve-moyenne';
const EPREUVE_SPRINT_ID = 'epreuve-sprint';

/** Record factice : longue 09:00, moyenne 09:30 (échelonnées), sprint NULL. */
const CLASSEMENTS_RECORD = {
  edition: { id: 'edition-1', nom: 'Édition 2027' },
  epreuves: [
    {
      epreuveId: EPREUVE_LONGUE_ID,
      slug: 'longue',
      nom: 'La Longue — 35 km',
      distanceKm: 35,
      heureDepart: new Date('2027-05-16T09:00:00.000Z'),
      lignes: [
        {
          dossard: 201,
          epreuveId: EPREUVE_LONGUE_ID,
          categorieAge: 'Senior',
          statut: 'arrivé' as const,
          arriveeRecue: new Date('2027-05-16T10:40:00.000Z'),
        },
        {
          dossard: 202,
          epreuveId: EPREUVE_LONGUE_ID,
          categorieAge: 'V1',
          statut: 'arrivé' as const,
          // MÊME réception que 201 : ex æquo (1, 1, 3 attendu).
          arriveeRecue: new Date('2027-05-16T10:40:00.000Z'),
        },
        {
          dossard: 203,
          epreuveId: EPREUVE_LONGUE_ID,
          categorieAge: 'U20',
          statut: 'arrivé' as const,
          arriveeRecue: new Date('2027-05-16T11:20:00.000Z'),
        },
        {
          dossard: 204,
          epreuveId: EPREUVE_LONGUE_ID,
          categorieAge: 'Senior',
          statut: 'en-course' as const,
          arriveeRecue: null,
        },
        {
          // Scan d'arrivée TARDIF après abandon : reste abandonné, jamais rangé.
          dossard: 205,
          epreuveId: EPREUVE_LONGUE_ID,
          categorieAge: 'V2',
          statut: 'abandonné' as const,
          arriveeRecue: new Date('2027-05-16T12:00:00.000Z'),
        },
      ],
    },
    {
      epreuveId: EPREUVE_MOYENNE_ID,
      slug: 'moyenne',
      nom: 'La Moyenne — 12 km',
      distanceKm: 12,
      heureDepart: new Date('2027-05-16T09:30:00.000Z'),
      lignes: [
        {
          dossard: 211,
          epreuveId: EPREUVE_MOYENNE_ID,
          categorieAge: 'Senior',
          statut: 'arrivé' as const,
          // Arrivée BRUTE plus tôt que 201/202 — temps RELATIF à 09:30.
          arriveeRecue: new Date('2027-05-16T10:20:00.000Z'),
        },
      ],
    },
    {
      epreuveId: EPREUVE_SPRINT_ID,
      slug: 'sprint',
      nom: 'Le Sprint — 5 km',
      distanceKm: 5,
      heureDepart: null,
      lignes: [
        {
          dossard: 221,
          epreuveId: EPREUVE_SPRINT_ID,
          categorieAge: 'Senior',
          statut: 'arrivé' as const,
          arriveeRecue: new Date('2027-05-16T10:00:00.000Z'),
        },
      ],
    },
  ],
  fraicheur: new Date('2027-05-16T12:00:00.000Z'),
};

describe('story 7.1 — domaine heures de départ : normalisation, validation', () => {
  it('normaliserSaisieHeuresDepart : lignes {epreuveId, heureDepart} conservées, garbage → heures null', () => {
    expect(
      normaliserSaisieHeuresDepart({
        heures: [{ epreuveId: ' ep-1 ', heureDepart: '2027-05-16T08:00:00.000Z' }, { epreuveId: 'ep-2', heureDepart: null }],
      }),
    ).toEqual({
      heures: [
        { epreuveId: 'ep-1', heureDepart: '2027-05-16T08:00:00.000Z' },
        { epreuveId: 'ep-2', heureDepart: null },
      ],
    });
    for (const garbage of [null, {}, { heures: 'matin' }, { heures: [null] }, { heures: [{ epreuveId: '', heureDepart: null }] }, { heures: [{ epreuveId: 'ep-1', heureDepart: 9 }] }]) {
      expect(normaliserSaisieHeuresDepart(garbage).heures).toBeNull();
    }
  });

  it('validerSaisieHeuresDepart : ISO UTC strict, null libre, borne 2000, doublon refusé — PAR ÉPREUVE', () => {
    expect(
      validerSaisieHeuresDepart({
        heures: [
          { epreuveId: 'ep-1', heureDepart: '2027-05-16T08:00:00.000Z' },
          { epreuveId: 'ep-2', heureDepart: null },
        ],
      }),
    ).toEqual({});
    const invalide = validerSaisieHeuresDepart({
      heures: [
        // Sans Z : interprété en heure locale du serveur — refusé net.
        { epreuveId: 'ep-1', heureDepart: '2027-05-16T08:00:00' },
        { epreuveId: 'ep-2', heureDepart: '1999-12-31T23:59:59.000Z' },
      ],
    });
    expect(invalide['ep-1']).toContain('valides');
    expect(invalide['ep-2']).toContain('trop ancienne');
    const doublon = validerSaisieHeuresDepart({
      heures: [
        { epreuveId: 'ep-1', heureDepart: null },
        { epreuveId: 'ep-1', heureDepart: '2027-05-16T08:00:00.000Z' },
      ],
    });
    expect(doublon.heures).toContain('plusieurs fois');
    expect(HEURE_DEPART_MINIMALE_MS).toBe(Date.parse('2000-01-01T00:00:00.000Z'));
  });
});

describe('story 7.1 — enregistrerHeuresDepart / getHeuresDepart (service)', () => {
  it('corps illisible : CorpsHeuresDepartInvalideError, store non appelé', async () => {
    const store = creerStoreFactice();
    await expect(enregistrerHeuresDepart(SESSION, { heures: 3 }, { store })).rejects.toBeInstanceOf(
      CorpsHeuresDepartInvalideError,
    );
    await expect(enregistrerHeuresDepart(SESSION, null, { store })).rejects.toBeInstanceOf(
      CorpsHeuresDepartInvalideError,
    );
    expect(store.enregistrerHeuresDepart).not.toHaveBeenCalled();
  });

  it('heure invalide : InvalidHeuresDepartFieldsError avec fields PAR ÉPREUVE, store non appelé', async () => {
    const store = creerStoreFactice();
    await expect(
      enregistrerHeuresDepart(
        SESSION,
        { heures: [{ epreuveId: 'ep-1', heureDepart: '08:00' }] },
        { store },
      ),
    ).rejects.toBeInstanceOf(InvalidHeuresDepartFieldsError);
    expect(store.enregistrerHeuresDepart).not.toHaveBeenCalled();
  });

  it('nominal : ISO → Date, null conservé, org de la session, état serveur sérialisé ISO', async () => {
    const epreuveRecord = {
      epreuveId: 'ep-1',
      slug: 'longue',
      nom: 'La Longue — 35 km',
      distanceKm: 35,
      heureDepart: new Date('2027-05-16T08:00:00.000Z'),
    };
    const store = creerStoreFactice({
      enregistrerHeuresDepart: vi.fn(async () => [epreuveRecord]),
    });
    const epreuves = await enregistrerHeuresDepart(
      SESSION,
      { heures: [{ epreuveId: 'ep-1', heureDepart: '2027-05-16T08:00:00.000Z' }, { epreuveId: 'ep-2', heureDepart: null }] },
      { store },
    );
    expect(store.enregistrerHeuresDepart).toHaveBeenCalledWith({
      organisationId: 'org-1',
      heures: [
        { epreuveId: 'ep-1', heureDepart: new Date('2027-05-16T08:00:00.000Z') },
        { epreuveId: 'ep-2', heureDepart: null },
      ],
    });
    expect(epreuves).toEqual([
      {
        epreuveId: 'ep-1',
        epreuveSlug: 'longue',
        epreuveNom: 'La Longue — 35 km',
        distanceKm: 35,
        heureDepart: '2027-05-16T08:00:00.000Z',
      },
    ]);
  });

  it('getHeuresDepart : lecture org de la session, ISO ou null', async () => {
    const store = creerStoreFactice({
      listerHeuresDepart: vi.fn(async () => ({
        edition: { id: 'edition-1', nom: 'Édition 2027' },
        epreuves: [
          {
            epreuveId: 'ep-1',
            slug: 'longue',
            nom: 'La Longue — 35 km',
            distanceKm: 35,
            heureDepart: new Date('2027-05-16T08:00:00.000Z'),
          },
        ],
      })),
    });
    const heures = await getHeuresDepart(SESSION, { store });
    expect(store.listerHeuresDepart).toHaveBeenCalledWith('org-1');
    expect(heures.epreuves[0]?.heureDepart).toBe('2027-05-16T08:00:00.000Z');
  });
});

describe('story 7.1 — getClassements (service : rangs, temps, statuts, configure)', () => {
  it('libellé « Classement provisoire » + genereA ISO + fraîcheur ISO', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const classements = await getClassements('org-1', { store });
    expect(classements.libelle).toBe('Classement provisoire');
    expect(new Date(classements.genereA).toString()).not.toBe('Invalid Date');
    expect(classements.fraicheur).toBe('2027-05-16T12:00:00.000Z');
    expect(store.classements).toHaveBeenCalledWith('org-1');
  });

  it('scratch + EX ÆQUO : 1, 1, 3 — temps = réception ARRIVÉE − heure de départ de l’épreuve', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const classements = await getClassements('org-1', { store });
    const longue = classements.epreuves.find((e) => e.epreuveSlug === 'longue');
    expect(longue?.lignes.map((ligne) => [ligne.dossard, ligne.rang, ligne.tempsMs])).toEqual([
      [201, 1, 100 * 60_000],
      [202, 1, 100 * 60_000],
      [203, 3, 140 * 60_000],
      [204, null, null],
      [205, null, null],
    ]);
  });

  it('départs échelonnés : la Moyenne (09:30) a SES temps — ordre d’arrivée BRUT ≠ ordre des temps', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const classements = await getClassements('org-1', { store });
    const moyenne = classements.epreuves.find((e) => e.epreuveSlug === 'moyenne');
    // 211 est arrivé BRUT (10:20) AVANT 201/202 (10:40) mais court une autre
    // course : 50 min contre 100 min, rangs incomparables entre épreuves.
    expect(moyenne?.lignes).toEqual([
      { dossard: 211, rang: 1, tempsMs: 50 * 60_000, statut: 'arrivé', categorieAge: 'Senior' },
    ]);
  });

  it('abandonné : jamais rangé, dossard LISTÉ À PART ; en-course : sans rang ni temps, APRÈS les arrivés', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const classements = await getClassements('org-1', { store });
    const longue = classements.epreuves.find((e) => e.epreuveSlug === 'longue');
    expect(longue?.abandons).toEqual([205]);
    const abandonne = longue?.lignes.find((ligne) => ligne.dossard === 205);
    expect(abandonne).toEqual({
      dossard: 205,
      rang: null,
      tempsMs: null,
      statut: 'abandonné',
      categorieAge: 'V2',
    });
    // Ordre : arrivés rangés, en course, abandonnés.
    expect(longue?.lignes.map((ligne) => ligne.statut)).toEqual([
      'arrivé',
      'arrivé',
      'arrivé',
      'en-course',
      'abandonné',
    ]);
  });

  it('heure de départ ABSENTE : configure false, JAMAIS de temps faux à zéro', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const classements = await getClassements('org-1', { store });
    const sprint = classements.epreuves.find((e) => e.epreuveSlug === 'sprint');
    expect(sprint?.configure).toBe(false);
    expect(sprint?.heureDepart).toBeNull();
    expect(sprint?.lignes).toEqual([
      { dossard: 221, rang: null, tempsMs: null, statut: 'arrivé', categorieAge: 'Senior' },
    ]);
  });

  it('sans édition : état ZÉRO cohérent (épreuves vides), jamais une erreur', async () => {
    const store = creerStoreFactice();
    const classements = await getClassements('org-1', { store });
    expect(classements.epreuves).toEqual([]);
    expect(classements.fraicheur).toBeNull();
    expect(classements.libelle).toBe('Classement provisoire');
  });

  it('garde categorieAge : valeur HORS union du contrat → repli « Senior », jamais un cast silencieux', async () => {
    // Défense en profondeur : la base refuse déjà (CHECK coureur.age_category)
    // — un record factice portant une catégorie inconnue ne fait pas mentir
    // le type du contrat servi.
    const store = creerStoreFactice({
      classements: vi.fn(async () => ({
        edition: { id: 'edition-1', nom: 'Édition 2027' },
        epreuves: [
          {
            epreuveId: 'epreuve-longue',
            slug: 'longue',
            nom: 'La Longue — 35 km',
            distanceKm: 35,
            heureDepart: new Date('2027-05-16T09:00:00.000Z'),
            lignes: [
              {
                dossard: 201,
                epreuveId: 'epreuve-longue',
                categorieAge: 'XX99',
                statut: 'arrivé' as const,
                arriveeRecue: new Date('2027-05-16T10:00:00.000Z'),
              },
              {
                dossard: 202,
                epreuveId: 'epreuve-longue',
                categorieAge: 'V1',
                statut: 'arrivé' as const,
                arriveeRecue: new Date('2027-05-16T10:30:00.000Z'),
              },
            ],
          },
        ],
        fraicheur: null,
      })),
    });
    const classements = await getClassements('org-1', { store });
    expect(classements.epreuves[0]?.lignes.map((ligne) => ligne.categorieAge)).toEqual([
      'Senior',
      'V1',
    ]);
  });
});

describe('story 7.1 — toCourseApiError (mapper heures de départ)', () => {
  it('champs invalides : 400 + fields PAR ÉPREUVE, enveloppe dédiée vouvoyée', () => {
    const apiError = toCourseApiError(
      new InvalidHeuresDepartFieldsError({
        'ep-1': 'Indiquez une date et une heure de départ valides.',
      }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.['ep-1']).toContain('valides');
    expect(apiError.envelope.error.code).toBe('admin.course.heures_depart_champs_invalides');
    expect(apiError.envelope.error.action).not.toMatch(/\b[Rr]éessaie\b/);
  });

  it('épreuve inconnue : 400 + erreur champ pour CHAQUE id (RLS comprise)', () => {
    const apiError = toCourseApiError(new HeuresDepartEpreuveInconnueError(['ep-1', 'ep-2']));
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.['ep-1']).toContain('Épreuve inconnue');
    expect(apiError.fields?.['ep-2']).toContain('Épreuve inconnue');
    expect(apiError.envelope.error.code).toBe('admin.course.heures_depart_epreuve_inconnue');
  });

  it('AUCUNE édition en cours : 409 DÉDIÉ (enveloppe propre, « aucune édition »), SANS fields', () => {
    const apiError = toCourseApiError(new HeuresDepartSansEditionError());
    expect(apiError.status).toBe(409);
    expect(apiError.fields).toBeUndefined();
    expect(apiError.envelope.error.code).toBe('admin.course.heures_depart_sans_edition');
    expect(apiError.envelope.error.message).toMatch(/aucune édition en cours/i);
  });

  it('gardes de corps : 400 illisible, 413 trop grand', () => {
    expect(toCourseApiError(new CorpsHeuresDepartInvalideError()).status).toBe(400);
    expect(
      toCourseApiError(new CorpsHeuresDepartTropGrandError(1024)).envelope.error.code,
    ).toBe('admin.course.heures_depart_corps_trop_grand');
    expect(toCourseApiError(new CorpsHeuresDepartTropGrandError(1024)).status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// Story 7.2 — résultats publics : getResultatsPublic (classements 7.1 TELS
// QUELS + derniers arrivés sur les mêmes faits), comptage anonyme (service),
// mapper vitrine douce. Derniers arrivés attendus sur CLASSEMENTS_RECORD :
// réception DESC = 203 (11:20), 201/202 (10:40, ex æquo → dossard ASC),
// 211 (10:20), 221 (10:00, sprint non configuré → tempsMs null) — l'abandonné
// 205 (scan tardif 12:00) et l'en-course 204 JAMAIS listés.
// ---------------------------------------------------------------------------

describe('story 7.2 — getResultatsPublic (service : org par défaut, sans session)', () => {
  it('contrat ResultatsPublic : classements 7.1 TELS QUELS + derniers arrivés réception DESC', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const resultats = await getResultatsPublic({ store });
    expect(resultats.classements.libelle).toBe('Classement provisoire');
    expect(resultats.classements.epreuves.map((e) => e.epreuveSlug)).toEqual([
      'longue',
      'moyenne',
      'sprint',
    ]);
    expect(store.organisationParDefautId).toHaveBeenCalled();
    expect(store.classements).toHaveBeenCalledWith('org-1');
    expect(resultats.derniersArrives).toEqual([
      { dossard: 203, epreuveSlug: 'longue', epreuveNom: 'La Longue — 35 km', tempsMs: 140 * 60_000 },
      { dossard: 201, epreuveSlug: 'longue', epreuveNom: 'La Longue — 35 km', tempsMs: 100 * 60_000 },
      { dossard: 202, epreuveSlug: 'longue', epreuveNom: 'La Longue — 35 km', tempsMs: 100 * 60_000 },
      { dossard: 211, epreuveSlug: 'moyenne', epreuveNom: 'La Moyenne — 12 km', tempsMs: 50 * 60_000 },
      { dossard: 221, epreuveSlug: 'sprint', epreuveNom: 'Le Sprint — 5 km', tempsMs: null },
    ]);
  });

  it('anonymat : le contrat ne porte QUE des dossards — abandonné (scan tardif) et en-course JAMAIS arrivés', async () => {
    const store = creerStoreFactice({
      classements: vi.fn(async () => CLASSEMENTS_RECORD),
    });
    const { derniersArrives } = await getResultatsPublic({ store });
    expect(derniersArrives.some((arrive) => arrive.dossard === 205)).toBe(false);
    expect(derniersArrives.some((arrive) => arrive.dossard === 204)).toBe(false);
    expect(JSON.stringify(derniersArrives)).not.toMatch(/jeton|prenom|first_name|last_name|email/i);
  });

  it('borné à 10 arrivés : les PLUS RÉCENTS gardés, les plus anciens tronqués', async () => {
    const lignes = Array.from({ length: 12 }, (_, index) => ({
      dossard: 300 + index,
      epreuveId: EPREUVE_LONGUE_ID,
      categorieAge: 'Senior',
      statut: 'arrivé' as const,
      arriveeRecue: new Date(Date.parse('2027-05-16T10:00:00.000Z') + index * 60_000),
    }));
    const store = creerStoreFactice({
      classements: vi.fn(async () => ({
        edition: { id: 'edition-1', nom: 'Édition 2027' },
        epreuves: [
          {
            epreuveId: EPREUVE_LONGUE_ID,
            slug: 'longue',
            nom: 'La Longue — 35 km',
            distanceKm: 35,
            heureDepart: new Date('2027-05-16T09:00:00.000Z'),
            lignes,
          },
        ],
        fraicheur: null,
      })),
    });
    const { derniersArrives } = await getResultatsPublic({ store });
    expect(derniersArrives).toHaveLength(10);
    // Plus récent en tête (dossard 311 = 11 min), le plus ancien tronqué (300).
    expect(derniersArrives[0]?.dossard).toBe(311);
    expect(derniersArrives[9]?.dossard).toBe(302);
    expect(derniersArrives.some((arrive) => arrive.dossard === 301)).toBe(false);
    expect(derniersArrives.some((arrive) => arrive.dossard === 300)).toBe(false);
  });

  it('organisation par défaut ABSENTE : état ZÉRO cohérent (épreuves vides), jamais une erreur', async () => {
    const store = creerStoreFactice({
      organisationParDefautId: vi.fn(async () => null),
    });
    const resultats = await getResultatsPublic({ store });
    expect(resultats.classements.epreuves).toEqual([]);
    expect(resultats.classements.libelle).toBe('Classement provisoire');
    expect(resultats.derniersArrives).toEqual([]);
    expect(store.classements).not.toHaveBeenCalled();
  });

  it('base indisponible : l’erreur se propage (la page rendra l’état dégradé, pas un faux vide)', async () => {
    const store = creerStoreFactice({
      organisationParDefautId: vi.fn(async () => {
        throw new DbUnavailableError();
      }),
    });
    await expect(getResultatsPublic({ store })).rejects.toBeInstanceOf(DbUnavailableError);
  });

  it('micro-cache ~5 s : deux appels rapprochés = UNE lecture store (snapshot servi tel quel), après expiration = nouvelle lecture', async () => {
    vi.useFakeTimers();
    try {
      const store = creerStoreFactice({
        classements: vi.fn(async () => CLASSEMENTS_RECORD),
      });
      const premier = await getResultatsPublic({ store });
      const second = await getResultatsPublic({ store });
      expect(store.classements).toHaveBeenCalledTimes(1);
      // Snapshot identique, genereA compris : la fraîcheur affichée décrit
      // le snapshot servi, jamais un âge rajeuni par le cache.
      expect(second).toEqual(premier);

      vi.advanceTimersByTime(5_100);
      const troisieme = await getResultatsPublic({ store });
      expect(store.classements).toHaveBeenCalledTimes(2);
      // Nouveau snapshot : genereA avance avec l'horloge (jamais figé > 5 s).
      expect(new Date(troisieme.classements.genereA).getTime()).toBeGreaterThan(
        new Date(premier.classements.genereA).getTime(),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('story 7.2 — compterVisitePartage (service : best effort, org par défaut)', () => {
  it('délègue au store pour l’organisation par défaut résolue', async () => {
    const store = creerStoreFactice();
    await compterVisitePartage({ store });
    expect(store.compterVisitePartage).toHaveBeenCalledWith('org-1');
    expect(store.compterVisitePartage).toHaveBeenCalledTimes(1);
  });

  it('organisation absente : AUCUN comptage (store non appelé), pas d’erreur', async () => {
    const store = creerStoreFactice({
      organisationParDefautId: vi.fn(async () => null),
    });
    await compterVisitePartage({ store });
    expect(store.compterVisitePartage).not.toHaveBeenCalled();
  });
});

describe('story 7.2 — toResultatsPublicApiError (mapper vitrine douce)', () => {
  it('base indisponible : 503 enveloppe vitrine.resultats.*, vouvoiement, jamais admin.*/volontaires.*', () => {
    const apiError = toResultatsPublicApiError(new DbUnavailableError());
    expect(apiError.status).toBe(503);
    expect(apiError.envelope.error.code).toBe('vitrine.resultats.db_unavailable');
    expect(apiError.envelope.error.message).toBe('Connexion indisponible.');
    expect(apiError.envelope.error.action).toMatch(/Réessayez/);
    expect(apiError.envelope.error.code).not.toMatch(/^(admin|volontaires)\./);
  });

  it('erreur inconnue : 500 douce, AUCUN détail technique exposé au public', () => {
    const apiError = toResultatsPublicApiError(new Error('boom interne stack trace'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('vitrine.resultats.erreur_inconnue');
    expect(JSON.stringify(apiError.envelope)).not.toContain('boom');
  });
});
