import { describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import {
  LIBELLES_COUVERTURE,
  LIBELLES_MISSION_TYPE,
  MAX_LIEU_LENGTH,
  MAX_TITRE_LENGTH,
  MAX_CONSIGNES_LENGTH,
  MISSION_TYPES,
  chevauche,
  couverture,
  estUuidValide,
  normalizeMissionInput,
  normalizeSecteurInput,
  validateMissionInput,
  validateSecteurInput,
  type Intervalle,
  type MissionFieldErrors,
  type SecteurFieldErrors,
} from './domain';
import {
  AucuneEditionError,
  InvalidAffectationError,
  InvalidMissionFieldsError,
  InvalidSecteurFieldsError,
  MissionNotFoundError,
  SecteurNomDupliqueError,
  SecteurNotFoundError,
  SecteurOccupeError,
  toMissionsApiError,
  VolontaireNotFoundError,
} from './errors';
import {
  affecterVolontaire,
  createSecteur,
  createMission,
  deleteMission,
  deleteSecteur,
  getMissionsAdminState,
  getMissionsVolontaireState,
  updateMission,
  updateSecteur,
  type MissionsServiceDeps,
} from './service';
import type { MissionsStore, MissionConflitRecord, SecteurRecord } from './store';

// Story 3.2 — tests unitaires secteurs/missions : validation (types fermés,
// horaires), couverture dérivée, chevauchement d'intervalles, libellés FR,
// assemblage des états admin/volontaire et affectation avec avertissement.
// Les comportements base (RLS, contraintes, cascade) vivent dans
// secteurs.integration.test.ts.

const DEBUT = new Date('2027-05-16T06:00:00.000Z');
const FIN = new Date('2027-05-16T12:00:00.000Z');

function intervalle(debut: string, fin: string): Intervalle {
  return { debut: new Date(debut), fin: new Date(fin) };
}

describe('types de mission — liste fermée et libellés FR', () => {
  it('exactement 6 types fermés, dans l’ordre du CHECK SQL', () => {
    expect(MISSION_TYPES).toEqual([
      'scan_checkpoint',
      'accueil',
      'securite_troncon',
      'securite_arrivee',
      'distribution_dossards',
      'communication',
    ]);
  });

  it('chaque type a un libellé français affichable, aucun vide', () => {
    for (const type of MISSION_TYPES) {
      expect(LIBELLES_MISSION_TYPE[type].length).toBeGreaterThan(0);
    }
    expect(LIBELLES_MISSION_TYPE.securite_troncon).toBe('Sécurité tronçon');
    expect(LIBELLES_MISSION_TYPE.distribution_dossards).toBe('Distribution des dossards');
  });
});

describe('couverture — dérivée du nombre d’affectations, jamais stockée', () => {
  it('0 affectation → vacante ; ≥ 1 → couverte', () => {
    expect(couverture(0)).toBe('vacante');
    expect(couverture(1)).toBe('couverte');
    expect(couverture(3)).toBe('couverte');
  });

  it('chaque état a un libellé affichable', () => {
    expect(LIBELLES_COUVERTURE.couverte).toBe('Couverte');
    expect(LIBELLES_COUVERTURE.vacante).toBe('Vacante');
  });
});

describe('chevauche — intervalles a.debut < b.fin AND b.debut < a.fin', () => {
  it('chevauchements détectés (partiel, inclusion, frontière commune exclue)', () => {
    const a = intervalle('2027-05-16T06:00:00Z', '2027-05-16T12:00:00Z');
    expect(chevauche(a, intervalle('2027-05-16T10:00:00Z', '2027-05-16T14:00:00Z'))).toBe(true);
    expect(chevauche(a, intervalle('2027-05-16T05:00:00Z', '2027-05-16T13:00:00Z'))).toBe(true);
    expect(chevauche(a, intervalle('2027-05-16T07:00:00Z', '2027-05-16T08:00:00Z'))).toBe(true);
    // fin de b == début de a : pas de chevauchement (strict <).
    expect(chevauche(a, intervalle('2027-05-16T04:00:00Z', '2027-05-16T06:00:00Z'))).toBe(false);
    expect(chevauche(a, intervalle('2027-05-16T12:00:00Z', '2027-05-16T18:00:00Z'))).toBe(false);
    expect(chevauche(a, intervalle('2027-05-16T14:00:00Z', '2027-05-16T18:00:00Z'))).toBe(false);
  });

  it('symétrique : chevauche(a, b) === chevauche(b, a)', () => {
    const a = intervalle('2027-05-16T06:00:00Z', '2027-05-16T12:00:00Z');
    const b = intervalle('2027-05-16T11:00:00Z', '2027-05-16T15:00:00Z');
    expect(chevauche(a, b)).toBe(chevauche(b, a));
  });
});

describe('validateSecteurInput — nom, lieu, contact téléphone facultatif', () => {
  it('nom + lieu valides, contact vide ou téléphone acceptés', () => {
    expect(validateSecteurInput(normalizeSecteurInput({ nom: 'Village', lieu: 'Place' }))).toEqual({});
    expect(
      validateSecteurInput(
        normalizeSecteurInput({ nom: 'Village', lieu: 'Place', contact: '+213 555 010 203' }),
      ),
    ).toEqual({});
  });

  it('nom manquant/trop long, lieu manquant/trop long, contact invalide → erreurs champ', () => {
    expect(
      validateSecteurInput(normalizeSecteurInput({ nom: '', lieu: 'Place' })).nom,
    ).toContain('obligatoire');
    expect(
      validateSecteurInput(normalizeSecteurInput({ nom: 'x'.repeat(121), lieu: 'Place' })).nom,
    ).toContain('120');
    expect(
      validateSecteurInput(normalizeSecteurInput({ nom: 'V', lieu: '' })).lieu,
    ).toContain('obligatoire');
    expect(
      validateSecteurInput(normalizeSecteurInput({ nom: 'V', lieu: 'x'.repeat(201) })).lieu,
    ).toContain(`${MAX_LIEU_LENGTH}`);
    expect(
      validateSecteurInput(normalizeSecteurInput({ nom: 'V', lieu: 'P', contact: 'abc' })).contact,
    ).toContain('téléphone');
  });
});

describe('validateMissionInput — type fermé, horaires, consignes', () => {
  const base = {
    secteurId: '00000000-0000-0000-0000-00000000e5e1',
    type: 'scan_checkpoint',
    titre: 'Scan PK 12',
    debutLe: '2027-05-16T06:00:00.000Z',
    finLe: '2027-05-16T12:00:00.000Z',
  };

  it('mission complète valide, consignes facultatives', () => {
    expect(validateMissionInput(normalizeMissionInput(base))).toEqual({});
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, consignes: 'Arrive 15 min avant.' })),
    ).toEqual({});
  });

  it('story 5.1 — estArrivee : booléen STRICT (true seul coche, absence/valeur truthy = false)', () => {
    expect(normalizeMissionInput({ ...base, estArrivee: true }).estArrivee).toBe(true);
    expect(normalizeMissionInput(base).estArrivee).toBe(false);
    expect(normalizeMissionInput({ ...base, estArrivee: false }).estArrivee).toBe(false);
    // Jamais de coercition truthy : une string/1 cocheraient l'arrivée par
    // accident sinon.
    expect(normalizeMissionInput({ ...base, estArrivee: 'true' }).estArrivee).toBe(false);
    expect(normalizeMissionInput({ ...base, estArrivee: 1 }).estArrivee).toBe(false);
  });

  it('story 5.1 (revue) — marque arrivée RÉSERVÉE aux scan_checkpoint : coche sur accueil refusée', () => {
    const accueil = { ...base, type: 'accueil', estArrivee: true };
    const errors = validateMissionInput(normalizeMissionInput(accueil));
    expect(errors.estArrivee).toContain('réservée aux missions Scan checkpoint');
    // Enveloppe : erreur champ 400 (InvalidMissionFieldsError porte estArrivee).
    const apiError = toMissionsApiError(new InvalidMissionFieldsError(errors));
    expect(apiError.status).toBe(400);
    expect((apiError.fields as MissionFieldErrors | undefined)?.estArrivee).toContain(
      'Scan checkpoint',
    );
  });

  it('story 5.1 (revue) — coche sur scan_checkpoint : aucune erreur estArrivee', () => {
    const scan = validateMissionInput(normalizeMissionInput({ ...base, estArrivee: true }));
    expect(scan.estArrivee).toBeUndefined();
    expect(scan).toEqual({});
  });

  it('type hors liste fermée → erreur type (aucun type personnalisé)', () => {
    const errors = validateMissionInput(normalizeMissionInput({ ...base, type: 'cuisine' }));
    expect(errors.type).toContain('parmi la liste');
  });

  it('fin avant/égale au début → erreur finLe', () => {
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, finLe: '2027-05-16T05:00:00.000Z' }))
        .finLe,
    ).toContain('après le début');
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, finLe: base.debutLe })).finLe,
    ).toContain('après le début');
  });

  it('horodatages absents/illisibles → erreurs debutLe/finLe', () => {
    const errors = validateMissionInput(
      normalizeMissionInput({ ...base, debutLe: '', finLe: 'pas-une-date' }),
    );
    expect(errors.debutLe).toBeTruthy();
    expect(errors.finLe).toBeTruthy();
  });

  it('estUuidValide : UUID canoniques acceptés, le reste refusé', () => {
    expect(estUuidValide('00000000-0000-0000-0000-0000000000f1')).toBe(true);
    expect(estUuidValide('ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe(true);
    expect(estUuidValide('pas-un-uuid')).toBe(false);
    expect(estUuidValide('')).toBe(false);
    expect(estUuidValide('00000000-0000-0000-0000-0000000000f1x')).toBe(false);
  });

  it('story 5.2 — barrière horaire : absente/vide → null, jamais d’erreur', () => {
    expect(normalizeMissionInput(base).barriereLe).toBeNull();
    expect(normalizeMissionInput({ ...base, barriereLe: '' }).barriereLe).toBeNull();
    expect(normalizeMissionInput({ ...base, barriereLe: '   ' }).barriereLe).toBeNull();
    expect(validateMissionInput(normalizeMissionInput(base)).barriereLe).toBeUndefined();
    // Barrière valide = DANS la mission, sur un scan_checkpoint : aucune erreur.
    expect(
      validateMissionInput(
        normalizeMissionInput({ ...base, barriereLe: '2027-05-16T10:00:00.000Z' }),
      ).barriereLe,
    ).toBeUndefined();
    // Bornes INCLUSES : barrière == début et barrière == fin passent.
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, barriereLe: base.debutLe })).barriereLe,
    ).toBeUndefined();
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, barriereLe: base.finLe })).barriereLe,
    ).toBeUndefined();
  });

  it('story 5.2 — barrière NON-CHAÎNE (nombre/objet via API) : conservée brute, erreur champ (jamais de null silencieux)', () => {
    expect(normalizeMissionInput({ ...base, barriereLe: 123 }).barriereLe).toBe('123');
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, barriereLe: 123 })).barriereLe,
    ).toContain('date et une heure');
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, barriereLe: { iso: 'x' } })).barriereLe,
    ).toContain('date et une heure');
  });

  it('story 5.2 — barrière mal formée / avant le début / après la fin / hors scan_checkpoint → erreurs champ', () => {
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, barriereLe: '2027-05-16T10:00' }))
        .barriereLe,
    ).toContain('date et une heure');
    expect(
      validateMissionInput(
        normalizeMissionInput({ ...base, barriereLe: '2027-05-16T05:00:00.000Z' }),
      ).barriereLe,
    ).toContain('après le début');
    expect(
      validateMissionInput(
        normalizeMissionInput({ ...base, barriereLe: '2027-05-16T12:00:01.000Z' }),
      ).barriereLe,
    ).toContain('avant la fin');
    expect(
      validateMissionInput(
        normalizeMissionInput({ ...base, type: 'accueil', barriereLe: '2027-05-16T10:00:00.000Z' }),
      ).barriereLe,
    ).toContain('réservée aux missions Scan checkpoint');
    // Enveloppe : erreur champ 400 (InvalidMissionFieldsError porte barriereLe).
    const apiError = toMissionsApiError(
      new InvalidMissionFieldsError({ barriereLe: 'après le début' }),
    );
    expect(apiError.status).toBe(400);
    expect((apiError.fields as MissionFieldErrors | undefined)?.barriereLe).toBeTruthy();
  });

  it('titre manquant/trop long, secteur absent, consignes > 5000 → erreurs champ', () => {
    expect(validateMissionInput(normalizeMissionInput({ ...base, titre: '' })).titre).toContain(
      'obligatoire',
    );
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, titre: 'x'.repeat(121) })).titre,
    ).toContain(`${MAX_TITRE_LENGTH}`);
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, secteurId: '' })).secteurId,
    ).toContain('Choisis');
    expect(
      validateMissionInput(normalizeMissionInput({ ...base, consignes: 'x'.repeat(5001) }))
        .consignes,
    ).toContain(`${MAX_CONSIGNES_LENGTH}`);
  });
});

// ---------------------------------------------------------------------------
// Service — store factice.
// ---------------------------------------------------------------------------

const SESSION_ORGANISATEUR = {
  accountId: 'account-admin',
  organisationId: '00000000-0000-0000-0000-000000000001',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
} as const satisfies SessionRecord;

const SESSION_VOLONTAIRE = {
  accountId: 'account-volontaire',
  organisationId: '00000000-0000-0000-0000-000000000001',
  email: 'kahina@exemple.dz',
  role: 'volontaire',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
} as const satisfies SessionRecord;

const EDITION = { id: 'edition-2027', nom: 'Édition 2027' };

const SECTEUR: SecteurRecord = {
  id: '00000000-0000-0000-0000-00000000e5e1',
  editionId: EDITION.id,
  nom: 'Village',
  lieu: 'Place du village',
  contact: null,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function storeFactice(overrides: Partial<MissionsStore> = {}): MissionsStore {
  const indisponible = (): never => {
    throw new Error('méthode non prévue par ce store factice');
  };
  return {
    importVolontaires: indisponible,
    listVolontaires: async () => [],
    renvoyerInvitation: indisponible,
    findCurrentEdition: async () => EDITION,
    createSecteur: indisponible,
    updateSecteur: indisponible,
    deleteSecteur: indisponible,
    createMission: indisponible,
    updateMission: indisponible,
    deleteMission: indisponible,
    listMissionsEtat: indisponible,
    findVolontaireIdByAccount: indisponible,
    affecter: indisponible,
    desaffecter: indisponible,
    listCoureursAnnuaire: indisponible,
    updateVolontaire: indisponible,
    deleteVolontaire: indisponible,
    ...overrides,
  };
}

describe('createSecteur — validation puis store', () => {
  it('champs invalides → InvalidSecteurFieldsError → 400 avec fields', async () => {
    await expect(
      createSecteur(SESSION_ORGANISATEUR as SessionRecord, { nom: '', lieu: '' }),
    ).rejects.toBeInstanceOf(InvalidSecteurFieldsError);
    const apiError = toMissionsApiError(new InvalidSecteurFieldsError({ nom: 'obligatoire' }));
    expect(apiError.status).toBe(400);
    expect(apiError.fields).toEqual({ nom: 'obligatoire' });
  });

  it('nom dupliqué (UNIQUE édition) → 409 secteur_duplique avec field nom', () => {
    const apiError = toMissionsApiError(new SecteurNomDupliqueError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.missions.secteur_duplique');
    expect((apiError.fields as SecteurFieldErrors | undefined)?.nom).toBeTruthy();
  });

  it('nominal : édition courante résolue localement, secteur rattaché', async () => {
    const createSecteurStore = vi.fn(async () => SECTEUR);
    const secteur = await createSecteur(SESSION_ORGANISATEUR as SessionRecord, {
      nom: 'Village',
      lieu: 'Place du village',
    }, { store: storeFactice({ createSecteur: createSecteurStore }) });
    expect(secteur).toMatchObject({
      id: '00000000-0000-0000-0000-00000000e5e1',
      nom: 'Village',
    });
    expect(createSecteurStore).toHaveBeenCalledWith(
      expect.objectContaining({ editionId: EDITION.id, nom: 'Village' }),
    );
  });
});

describe('createMission — validation puis store', () => {
  const CORPS = {
    secteurId: '00000000-0000-0000-0000-00000000e5e1',
    type: 'accueil',
    titre: 'Accueil village',
    debutLe: DEBUT.toISOString(),
    finLe: FIN.toISOString(),
  };

  it('type hors liste → InvalidMissionFieldsError → 400 fields.type', async () => {
    await expect(
      createMission(SESSION_ORGANISATEUR as SessionRecord, { ...CORPS, type: 'cuisine' }),
    ).rejects.toBeInstanceOf(InvalidMissionFieldsError);
    expect(toMissionsApiError(new InvalidMissionFieldsError({ type: 'x' })).status).toBe(400);
  });

  it('horaires ISO UTC convertis en Date pour le store, mission vacante', async () => {
    const createMissionStore = vi.fn(async () => ({
      id: 'mission-1',
      secteurId: '00000000-0000-0000-0000-00000000e5e1',
      type: 'accueil' as const,
      titre: 'Accueil village',
      debutLe: DEBUT,
      finLe: FIN,
      consignes: null,
      estArrivee: false,
      barriereLe: null,
      createdAt: new Date(),
    }));
    const mission = await createMission(SESSION_ORGANISATEUR as SessionRecord, CORPS, {
      store: storeFactice({ createMission: createMissionStore }),
    });
    expect(mission.couverture).toBe('vacante');
    expect(mission.couvertureLabel).toBe('Vacante');
    expect(mission.typeLabel).toBe('Accueil');
    expect(createMissionStore).toHaveBeenCalledWith(
      expect.objectContaining({
        debutLe: DEBUT,
        finLe: FIN,
        consignes: null,
        estArrivee: false,
        barriereLe: null,
      }),
    );
  });

  it('story 5.2 — barrière ISO convertie en Date pour le store, répercutée au summary', async () => {
    const BARRIERE = new Date('2027-05-16T10:00:00.000Z');
    const createMissionStore = vi.fn(async () => ({
      id: 'mission-scan',
      secteurId: '00000000-0000-0000-0000-00000000e5e1',
      type: 'scan_checkpoint' as const,
      titre: 'Scan km 12',
      debutLe: DEBUT,
      finLe: FIN,
      consignes: null,
      estArrivee: false,
      barriereLe: BARRIERE,
      createdAt: new Date(),
    }));
    const mission = await createMission(
      SESSION_ORGANISATEUR as SessionRecord,
      { ...CORPS, type: 'scan_checkpoint', barriereLe: '2027-05-16T10:00:00.000Z' },
      { store: storeFactice({ createMission: createMissionStore }) },
    );
    expect(createMissionStore).toHaveBeenCalledWith(
      expect.objectContaining({ barriereLe: BARRIERE }),
    );
    expect(mission.barriereLe).toBe('2027-05-16T10:00:00.000Z');
  });

  it('secteur d’une autre org → SecteurNotFoundError → 404', () => {
    expect(toMissionsApiError(new SecteurNotFoundError()).status).toBe(404);
    expect(toMissionsApiError(new MissionNotFoundError()).status).toBe(404);
    expect(toMissionsApiError(new VolontaireNotFoundError()).status).toBe(404);
  });

  it('aucune édition pour l’organisation : AucuneEditionError → 409 admin.missions.aucune_edition', async () => {
    const store = storeFactice({ findCurrentEdition: async () => null });
    await expect(
      createSecteur(SESSION_ORGANISATEUR as SessionRecord, { nom: 'Village', lieu: 'Place' }, {
        store,
      }),
    ).rejects.toBeInstanceOf(AucuneEditionError);
    const apiError = toMissionsApiError(new AucuneEditionError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.missions.aucune_edition');
    // Revue 3.2 : aucune action inexistante proposée (pas d'écran « créer une édition »).
    expect(apiError.envelope.error.action).not.toMatch(/crée d’abord une édition/i);
    expect(apiError.envelope.error.action).toContain('installation');
  });
});

describe('story 5.2 — updateMission : barrière posée, modifiée puis effacée (Dates transmises au store)', () => {
  const MISSION_ID = '00000000-0000-0000-0000-00000000e5f1';
  const BARRIERE = new Date('2027-05-16T10:00:00.000Z');
  const BARRIERE_DEPLACEE = new Date('2027-05-16T11:30:00.000Z');
  const CORPS_SCAN = {
    secteurId: '00000000-0000-0000-0000-00000000e5e1',
    type: 'scan_checkpoint',
    titre: 'Scan km 12',
    debutLe: DEBUT.toISOString(),
    finLe: FIN.toISOString(),
  };

  function storeUpdate(barriereLe: Date | null) {
    const updateMissionStore = vi.fn(async () => ({
      mission: {
        id: MISSION_ID,
        secteurId: CORPS_SCAN.secteurId,
        type: 'scan_checkpoint' as const,
        titre: 'Scan km 12',
        debutLe: DEBUT,
        finLe: FIN,
        consignes: null,
        estArrivee: false,
        barriereLe,
        createdAt: new Date(),
      },
      conflits: [],
    }));
    return { store: storeFactice({ updateMission: updateMissionStore }), updateMissionStore };
  }

  it('barrière POSÉE : l’ISO du corps devient une Date transmise au store, répercutée au summary', async () => {
    const { store, updateMissionStore } = storeUpdate(BARRIERE);
    const { mission } = await updateMission(
      SESSION_ORGANISATEUR as SessionRecord,
      MISSION_ID,
      { ...CORPS_SCAN, barriereLe: BARRIERE.toISOString() },
      { store },
    );
    expect(updateMissionStore).toHaveBeenCalledWith(
      MISSION_ID,
      expect.objectContaining({ barriereLe: BARRIERE }),
    );
    expect(mission.barriereLe).toBe(BARRIERE.toISOString());
  });

  it('barrière MODIFIÉE : la NOUVELLE Date remplace l’ancienne au store', async () => {
    const { store, updateMissionStore } = storeUpdate(BARRIERE_DEPLACEE);
    await updateMission(
      SESSION_ORGANISATEUR as SessionRecord,
      MISSION_ID,
      { ...CORPS_SCAN, barriereLe: BARRIERE_DEPLACEE.toISOString() },
      { store },
    );
    expect(updateMissionStore).toHaveBeenCalledWith(
      MISSION_ID,
      expect.objectContaining({ barriereLe: BARRIERE_DEPLACEE }),
    );
    expect(updateMissionStore).not.toHaveBeenCalledWith(
      MISSION_ID,
      expect.objectContaining({ barriereLe: BARRIERE }),
    );
  });

  it('barrière EFFACÉE (absente du corps) : null transmis — l’alerte est désarmée explicitement', async () => {
    const { store, updateMissionStore } = storeUpdate(null);
    const { mission } = await updateMission(
      SESSION_ORGANISATEUR as SessionRecord,
      MISSION_ID,
      CORPS_SCAN,
      { store },
    );
    expect(updateMissionStore).toHaveBeenCalledWith(
      MISSION_ID,
      expect.objectContaining({ barriereLe: null }),
    );
    expect(mission.barriereLe).toBeNull();
  });
});

describe('affecterVolontaire — corps, idempotence, avertissement', () => {
  const deps = (conflits: MissionConflitRecord[], cree = true): MissionsServiceDeps => ({
    store: storeFactice({
      affecter: async () => ({ cree, conflits }),
    }),
  });

  const CONFLIT: MissionConflitRecord = {
    missionId: 'mission-b',
    secteurNom: 'Tronçon',
    type: 'securite_troncon',
    titre: 'Barrière PK 10',
    debutLe: new Date('2027-05-16T10:00:00.000Z'),
    finLe: new Date('2027-05-16T14:00:00.000Z'),
  };

  it('corps incomplet → InvalidAffectationError → 400', async () => {
    await expect(
      affecterVolontaire(SESSION_ORGANISATEUR as SessionRecord, { missionId: '00000000-0000-0000-0000-0000000000d1' }),
    ).rejects.toBeInstanceOf(InvalidAffectationError);
    expect(toMissionsApiError(new InvalidAffectationError()).status).toBe(400);
  });

  it('sans conflit : cree true, avertissement null', async () => {
    const resultat = await affecterVolontaire(
      SESSION_ORGANISATEUR as SessionRecord,
      { missionId: '00000000-0000-0000-0000-0000000000d1', volontaireId: '00000000-0000-0000-0000-0000000000b1' },
      deps([]),
    );
    expect(resultat).toEqual({ ok: true, cree: true, avertissement: null });
  });

  it('avec conflit : affectation MAINTENUE + avertissement listant la mission', async () => {
    const resultat = await affecterVolontaire(
      SESSION_ORGANISATEUR as SessionRecord,
      { missionId: '00000000-0000-0000-0000-0000000000d1', volontaireId: '00000000-0000-0000-0000-0000000000b1' },
      deps([CONFLIT]),
    );
    expect(resultat.cree).toBe(true);
    expect(resultat.avertissement?.missions).toEqual([
      {
        missionId: 'mission-b',
        secteurNom: 'Tronçon',
        typeLabel: 'Sécurité tronçon',
        titre: 'Barrière PK 10',
        debutLe: '2027-05-16T10:00:00.000Z',
        finLe: '2027-05-16T14:00:00.000Z',
      },
    ]);
  });

  it('doublon ignoré : cree false, jamais une erreur', async () => {
    const resultat = await affecterVolontaire(
      SESSION_ORGANISATEUR as SessionRecord,
      { missionId: '00000000-0000-0000-0000-0000000000d1', volontaireId: '00000000-0000-0000-0000-0000000000b1' },
      deps([], false),
    );
    expect(resultat.cree).toBe(false);
  });
});

describe('updateMission — avertissement de chevauchement après modification (D2)', () => {
  const MISSION_ID = '00000000-0000-0000-0000-00000000d201';
  const CORPS = {
    secteurId: '00000000-0000-0000-0000-00000000d2e1',
    type: 'accueil',
    titre: 'Accueil village',
    debutLe: DEBUT.toISOString(),
    finLe: FIN.toISOString(),
  };
  const MISSION = {
    id: MISSION_ID,
    secteurId: CORPS.secteurId,
    type: 'accueil' as const,
    titre: 'Accueil village',
    debutLe: DEBUT,
    finLe: FIN,
    consignes: null,
    estArrivee: false,
    barriereLe: null,
    createdAt: new Date(),
  };

  it('conflits du store : modification FAITE + avertissement listant mission ET volontaire', async () => {
    const store = storeFactice({
      updateMission: async () => ({
        mission: MISSION,
        conflits: [
          {
            missionId: 'mission-b',
            secteurNom: 'Tronçon',
            type: 'securite_troncon',
            titre: 'Barrière PK 10',
            debutLe: new Date('2027-05-16T10:00:00.000Z'),
            finLe: new Date('2027-05-16T14:00:00.000Z'),
            volontaireId: 'volontaire-karim',
            volontaireNom: 'Karim',
          },
        ],
      }),
    });
    const resultat = await updateMission(SESSION_ORGANISATEUR as SessionRecord, MISSION_ID, CORPS, {
      store,
    });
    expect(resultat.mission.id).toBe(MISSION_ID);
    expect(resultat.avertissement?.missions).toEqual([
      {
        missionId: 'mission-b',
        secteurNom: 'Tronçon',
        typeLabel: 'Sécurité tronçon',
        titre: 'Barrière PK 10',
        debutLe: '2027-05-16T10:00:00.000Z',
        finLe: '2027-05-16T14:00:00.000Z',
        volontaireId: 'volontaire-karim',
        volontaireNom: 'Karim',
      },
    ]);
  });

  it('aucun conflit : avertissement null', async () => {
    const store = storeFactice({ updateMission: async () => ({ mission: MISSION, conflits: [] }) });
    const resultat = await updateMission(SESSION_ORGANISATEUR as SessionRecord, MISSION_ID, CORPS, {
      store,
    });
    expect(resultat.avertissement).toBeNull();
  });

  it('mission inconnue (store null) : MissionNotFoundError', async () => {
    const store = storeFactice({ updateMission: async () => null });
    await expect(
      updateMission(SESSION_ORGANISATEUR as SessionRecord, MISSION_ID, CORPS, { store }),
    ).rejects.toBeInstanceOf(MissionNotFoundError);
  });
});

describe('états admin et volontaire — assemblage couverture dérivée', () => {
  const etat = {
    secteurs: [SECTEUR],
    missions: [
      {
        id: 'mission-1',
        secteurId: '00000000-0000-0000-0000-00000000e5e1',
        type: 'accueil' as const,
        titre: 'Accueil village',
        debutLe: DEBUT,
        finLe: FIN,
        consignes: null,
        estArrivee: false,
        barriereLe: null,
        createdAt: new Date(),
      },
      {
        id: 'mission-2',
        secteurId: '00000000-0000-0000-0000-00000000e5e1',
        type: 'scan_checkpoint' as const,
        titre: 'Scan PK 12',
        debutLe: FIN,
        finLe: new Date('2027-05-16T18:00:00.000Z'),
        consignes: null,
        estArrivee: false,
        barriereLe: new Date('2027-05-16T14:30:00.000Z'),
        createdAt: new Date(),
      },
    ],
    affectations: [
      { missionId: 'mission-1', volontaireId: '00000000-0000-0000-0000-0000000000b1', volontaireNom: 'Kahina', createdAt: new Date() },
    ],
  };

  it('admin : mission 1 couverte (1 affectation), mission 2 vacante, volontaires listés', async () => {
    const state = await getMissionsAdminState(SESSION_ORGANISATEUR as SessionRecord, {
      store: storeFactice({
        listMissionsEtat: async () => etat,
        listVolontaires: async () => [
          {
            id: 'v-1',
            nom: 'Kahina',
            email: 'kahina@exemple.dz',
            telephone: null,
            statutInvitation: 'active',
            createdAt: new Date(),
          },
        ],
      }),
    });
    expect(state.edition).toEqual(EDITION);
    expect(state.secteurs[0]?.missions.map((m) => [m.titre, m.couverture])).toEqual([
      ['Accueil village', 'couverte'],
      ['Scan PK 12', 'vacante'],
    ]);
    expect(state.secteurs[0]?.missions[0]?.affectations).toEqual([
      { volontaireId: '00000000-0000-0000-0000-0000000000b1', volontaireNom: 'Kahina' },
    ]);
    expect(state.volontaires).toEqual([{ id: 'v-1', nom: 'Kahina' }]);
    // Story 5.2 — la barrière remonte au summary (ISO), null quand absente.
    expect(state.secteurs[0]?.missions.map((m) => m.barriereLe)).toEqual([
      null,
      '2027-05-16T14:30:00.000Z',
    ]);
  });

  it('volontaire : ses missions filtrées par son compte, couverture générale', async () => {
    const state = await getMissionsVolontaireState(SESSION_VOLONTAIRE as SessionRecord, {
      store: storeFactice({
        listMissionsEtat: async () => etat,
        findVolontaireIdByAccount: async () => '00000000-0000-0000-0000-0000000000b1',
      }),
    });
    expect(state.editionNom).toBe(EDITION.nom);
    expect(state.mesMissions.map((m) => m.titre)).toEqual(['Accueil village']);
    expect(state.missions.map((m) => m.couverture)).toEqual(['couverte', 'vacante']);
    expect(state.missions[0]?.secteurNom).toBe('Village');
    expect(state.missions[1]?.typeLabel).toBe('Scan checkpoint');
  });

  it('fiche 3.3 : lieu et contact du secteur portés sur chaque mission, null si absents', async () => {
    const avecContact: SecteurRecord = { ...SECTEUR, contact: '+213 555 010 203' };
    const state = await getMissionsVolontaireState(SESSION_VOLONTAIRE as SessionRecord, {
      store: storeFactice({
        listMissionsEtat: async () => ({
          ...etat,
          secteurs: [avecContact],
        }),
        findVolontaireIdByAccount: async () => '00000000-0000-0000-0000-0000000000b1',
      }),
    });
    // Contact renseigné → présent (gros bouton tel:) ; lieu toujours porté.
    expect(state.mesMissions[0]).toMatchObject({
      secteurNom: 'Village',
      secteurLieu: 'Place du village',
      secteurContact: '+213 555 010 203',
    });
    // Sans contact : null — jamais de chaîne vide, jamais de lien mort.
    const sansContact = await getMissionsVolontaireState(SESSION_VOLONTAIRE as SessionRecord, {
      store: storeFactice({
        listMissionsEtat: async () => etat,
        findVolontaireIdByAccount: async () => '00000000-0000-0000-0000-0000000000b1',
      }),
    });
    expect(sansContact.mesMissions[0]?.secteurContact).toBeNull();
    expect(sansContact.mesMissions[0]?.secteurLieu).toBe('Place du village');
  });

  it('sans édition : états vides sans erreur', async () => {
    const store = storeFactice({ findCurrentEdition: async () => null });
    await expect(
      getMissionsAdminState(SESSION_ORGANISATEUR as SessionRecord, { store }),
    ).resolves.toEqual({ edition: null, secteurs: [], volontaires: [] });
    await expect(
      getMissionsVolontaireState(SESSION_VOLONTAIRE as SessionRecord, { store }),
    ).resolves.toEqual({ editionNom: null, mesMissions: [], missions: [] });
  });
});

describe('enveloppes secteurs/missions — statuts et codes', () => {
  it('suppression secteur occupé : 409 avec l’action « retire ses missions d’abord »', () => {
    const apiError = toMissionsApiError(new SecteurOccupeError(2));
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.missions.secteur_occupe');
    expect(apiError.envelope.error.action).toContain('Retire ses missions d’abord');
  });

  it('deleteSecteur introuvable → 404, jamais 500', async () => {
    await expect(
      deleteSecteur(SESSION_ORGANISATEUR as SessionRecord, 'inconnu', {
        store: storeFactice({ deleteSecteur: async () => false }),
      }),
    ).rejects.toBeInstanceOf(SecteurNotFoundError);
  });
});

describe('ids non-UUID — gardes avant postgres (jamais de 22P02 → 500)', () => {
  const CORPS_MISSION = {
    secteurId: '00000000-0000-0000-0000-0000000000f1',
    type: 'accueil',
    titre: 'Accueil village',
    debutLe: DEBUT.toISOString(),
    finLe: FIN.toISOString(),
  };

  it('chemin secteur « pas-un-uuid » : update et delete → 404 NotFound, store non appelé', async () => {
    const store = storeFactice();
    await expect(
      updateSecteur(SESSION_ORGANISATEUR as SessionRecord, 'pas-un-uuid', { nom: 'V', lieu: 'P' }, {
        store,
      }),
    ).rejects.toBeInstanceOf(SecteurNotFoundError);
    await expect(
      deleteSecteur(SESSION_ORGANISATEUR as SessionRecord, 'pas-un-uuid', { store }),
    ).rejects.toBeInstanceOf(SecteurNotFoundError);
  });

  it('chemin mission « pas-un-uuid » : update et delete → 404 NotFound', async () => {
    const store = storeFactice();
    await expect(
      updateMission(SESSION_ORGANISATEUR as SessionRecord, 'pas-un-uuid', CORPS_MISSION, {
        store,
      }),
    ).rejects.toBeInstanceOf(MissionNotFoundError);
    await expect(
      deleteMission(SESSION_ORGANISATEUR as SessionRecord, 'pas-un-uuid', { store }),
    ).rejects.toBeInstanceOf(MissionNotFoundError);
  });

  it('corps affectation « pas-un-uuid » : InvalidAffectationError → 400', async () => {
    await expect(
      affecterVolontaire(SESSION_ORGANISATEUR as SessionRecord, {
        missionId: 'pas-un-uuid',
        volontaireId: '00000000-0000-0000-0000-0000000000f2',
      }),
    ).rejects.toBeInstanceOf(InvalidAffectationError);
    await expect(
      affecterVolontaire(SESSION_ORGANISATEUR as SessionRecord, {
        missionId: '00000000-0000-0000-0000-0000000000f3',
        volontaireId: 'pas-un-uuid',
      }),
    ).rejects.toBeInstanceOf(InvalidAffectationError);
  });

  it('secteurId « pas-un-uuid » en corps mission (create/update) → SecteurNotFoundError 404', async () => {
    const store = storeFactice();
    await expect(
      createMission(SESSION_ORGANISATEUR as SessionRecord, {
        ...CORPS_MISSION,
        secteurId: 'pas-un-uuid',
      }, { store }),
    ).rejects.toBeInstanceOf(SecteurNotFoundError);
    await expect(
      updateMission(SESSION_ORGANISATEUR as SessionRecord, '00000000-0000-0000-0000-0000000000f4', {
        ...CORPS_MISSION,
        secteurId: 'pas-un-uuid',
      }, { store }),
    ).rejects.toBeInstanceOf(SecteurNotFoundError);
  });
});
