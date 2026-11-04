import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import { processOutbox } from '@/modules/notifications/worker';

import {
  AGE_CATEGORY_LABELS,
  MAX_AGE_AT_RACE,
  MAX_REFUSAL_REASON_LENGTH,
  MIN_AGE_AT_RACE,
  PASTILLE_STATUT,
  canDepositPreuve,
  deriveAgeAndCategory,
  isRegistrationOpen,
  isValidPhone,
  normalizeInscriptionInput,
  normalizeRefusalReason,
  validateInscriptionInput,
  type InscriptionFormInput,
} from './domain';
import {
  BothAcceptancesRequiredError,
  DecisionInvalidError,
  DossierIncompletError,
  DossierNotFoundError,
  DossierValidatedError,
  DocumentsMissingError,
  InvalidFieldsError,
  PreuveNotFoundError,
  RefusalReasonRequiredError,
  RefusalReasonTooLongError,
  RegistrationClosedError,
  NoCoureurError,
  toAdminApiError,
  toApiError,
  toAcceptancesApiError,
} from './errors';
import {
  acceptDocuments,
  decideDossier,
  normalizeAcceptancesInput,
  submitInscription,
} from './service';
import type { CoureurRecord, EditionRecord, InscriptionsStore } from './store';
import type { SessionRecord } from '@/modules/iam/store';

const RACE_DATE = '2027-03-26';

function validInput(overrides: Partial<InscriptionFormInput> = {}): InscriptionFormInput {
  return {
    epreuve: 'longue',
    prenom: 'Yani',
    nom: 'Ulahianne',
    telephone: '+213555010203',
    contactUrgenceNom: 'Lounis Ulahianne',
    contactUrgenceTelephone: '0555010204',
    dateNaissance: '1990-05-12',
    tailleTshirt: 'M',
    ...overrides,
  };
}

describe('deriveAgeAndCategory — bornes à la date de course', () => {
  it('anniversaire le jour même : nouvel âge atteint', () => {
    expect(deriveAgeAndCategory('2007-03-26', RACE_DATE)).toEqual({
      age: 20,
      category: 'Senior',
    });
  });

  it('la veille de ses 20 ans : U20', () => {
    expect(deriveAgeAndCategory('2007-03-27', RACE_DATE)).toEqual({ age: 19, category: 'U20' });
  });

  it('bornes Senior / V1 / V2 / V3', () => {
    expect(deriveAgeAndCategory('1988-03-26', RACE_DATE)).toEqual({ age: 39, category: 'Senior' });
    expect(deriveAgeAndCategory('1987-03-26', RACE_DATE)).toEqual({ age: 40, category: 'V1' });
    expect(deriveAgeAndCategory('1977-03-26', RACE_DATE)).toEqual({ age: 50, category: 'V2' });
    expect(deriveAgeAndCategory('1967-03-26', RACE_DATE)).toEqual({ age: 60, category: 'V3' });
    expect(deriveAgeAndCategory('1967-03-27', RACE_DATE)).toEqual({ age: 59, category: 'V2' });
  });

  it('dates invalides : null', () => {
    expect(deriveAgeAndCategory('2027-13-01', RACE_DATE)).toBeNull();
    expect(deriveAgeAndCategory('31/12/1990', RACE_DATE)).toBeNull();
    expect(deriveAgeAndCategory('', RACE_DATE)).toBeNull();
  });
});

describe('isRegistrationOpen', () => {
  const closesAt = new Date('2027-03-16T23:59:59.000Z');

  it('ouverte avant l’échéance, fermée à l’échéance et après', () => {
    expect(isRegistrationOpen(closesAt, new Date('2027-03-16T23:59:58.000Z'))).toBe(true);
    expect(isRegistrationOpen(closesAt, new Date('2027-03-16T23:59:59.000Z'))).toBe(false);
    expect(isRegistrationOpen(closesAt, new Date('2027-03-17T00:00:01.000Z'))).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepte les formats locaux et internationaux, espacés ou non', () => {
    expect(isValidPhone('+213 555 010 203')).toBe(true);
    expect(isValidPhone('0555 010 204')).toBe(true);
    expect(isValidPhone('0555.010.204')).toBe(true);
    expect(isValidPhone('+213555010203')).toBe(true);
  });

  it('refuse trop court, trop long, lettres, vide', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('+2135550102031234567890')).toBe(false);
    expect(isValidPhone('abc-def-ghij')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('normalizeInscriptionInput', () => {
  it('trim les textes, compacte les téléphones, ignore les non-chaînes', () => {
    expect(
      normalizeInscriptionInput({
        epreuve: ' longue ',
        prenom: '  Yani ',
        nom: 'Ulahianne ',
        telephone: '+213 555 010.203',
        contactUrgenceNom: ' Lounis Ulahianne',
        contactUrgenceTelephone: '0555-010-204',
        dateNaissance: '1990-05-12',
        tailleTshirt: 'M ',
        junk: 42,
      }),
    ).toEqual(validInput({ telephone: '+213555010203', contactUrgenceTelephone: '0555010204' }));
  });

  it('valeurs non objet : tout vide', () => {
    const empty = normalizeInscriptionInput('pas un objet');
    expect(empty.prenom).toBe('');
    expect(empty.epreuve).toBe('');
  });
});

describe('validateInscriptionInput — champ par champ', () => {
  const slugs = ['longue', 'moyenne'];

  it('saisie complète : aucune erreur', () => {
    const errors = validateInscriptionInput(validInput(), slugs, RACE_DATE);
    expect(Object.keys(errors)).toEqual([]);
  });

  it('chaque champ manquant est nommé individuellement', () => {
    const keys = Object.keys(validInput()) as (keyof InscriptionFormInput)[];
    for (const key of keys) {
      const input = validInput({ [key]: '' });
      const errors = validateInscriptionInput(input, slugs, RACE_DATE);
      expect(Object.keys(errors), `champ ${key}`).toEqual([key]);
    }
  });

  it('formulaire vide : les huit champs sont signalés', () => {
    const errors = validateInscriptionInput(
      {
        epreuve: '',
        prenom: '',
        nom: '',
        telephone: '',
        contactUrgenceNom: '',
        contactUrgenceTelephone: '',
        dateNaissance: '',
        tailleTshirt: '',
      },
      slugs,
      RACE_DATE,
    );
    expect(Object.keys(errors).sort()).toEqual(
      [
        'epreuve',
        'prenom',
        'nom',
        'telephone',
        'contactUrgenceNom',
        'contactUrgenceTelephone',
        'dateNaissance',
        'tailleTshirt',
      ].sort(),
    );
  });

  it('épreuve inconnue et taille hors XS–XXL refusées', () => {
    const errors = validateInscriptionInput(
      validInput({ epreuve: 'sprint', tailleTshirt: 'XXXL' }),
      slugs,
      RACE_DATE,
    );
    expect(errors.epreuve).toBeDefined();
    expect(errors.tailleTshirt).toBeDefined();
  });

  it('âge imbroglio : moins de 10 ans ou plus de 100 ans à la course', () => {
    expect(
      validateInscriptionInput(validInput({ dateNaissance: '2020-01-01' }), slugs, RACE_DATE)
        .dateNaissance,
    ).toContain(`${MIN_AGE_AT_RACE}`);
    expect(
      validateInscriptionInput(validInput({ dateNaissance: '1900-01-01' }), slugs, RACE_DATE)
        .dateNaissance,
    ).toContain(`${MAX_AGE_AT_RACE}`);
  });

  it('date dans le futur refusée', () => {
    const errors = validateInscriptionInput(
      validInput({ dateNaissance: '2030-01-01' }),
      slugs,
      RACE_DATE,
      new Date('2026-10-21T00:00:00.000Z'),
    );
    expect(errors.dateNaissance).toContain('futur');
  });

  it('téléphones invalides signalés champ par champ', () => {
    const errors = validateInscriptionInput(
      validInput({ telephone: '123', contactUrgenceTelephone: 'abcd' }),
      slugs,
      RACE_DATE,
    );
    expect(Object.keys(errors).sort()).toEqual(['contactUrgenceTelephone', 'telephone']);
  });
});

describe('toApiError — erreurs inscriptions', () => {
  it('InvalidFieldsError : 400, code inscriptions.invalid_fields, champs portés', () => {
    const apiError = toApiError(new InvalidFieldsError({ prenom: 'Ton prénom est obligatoire.' }));
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.version).toBe(1);
    expect(apiError.envelope.error.code).toBe('inscriptions.invalid_fields');
    expect(apiError.fields).toEqual({ prenom: 'Ton prénom est obligatoire.' });
  });

  it('RegistrationClosedError : 403, code inscriptions.closed, message daté', () => {
    const apiError = toApiError(new RegistrationClosedError(new Date('2027-03-16T23:59:59.000Z')));
    expect(apiError.status).toBe(403);
    expect(apiError.envelope.error.code).toBe('inscriptions.closed');
    expect(apiError.envelope.error.message).toContain('16 mars 2027');
    expect(apiError.envelope.error.action).not.toBe('');
  });

  it('DossierValidatedError : 409', () => {
    expect(toApiError(new DossierValidatedError())).toMatchObject({
      status: 409,
      envelope: { error: { code: 'inscriptions.dossier_valide' } },
    });
  });

  it('erreur inconnue : 500 sans fuiter le message brut', () => {
    const apiError = toApiError(new Error('boom'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('inscriptions.internal_error');
    expect(apiError.envelope.error.message).not.toContain('boom');
  });
});

describe('submitInscription — service avec store stubbé', () => {
  const session: SessionRecord = {
    accountId: 'account-1',
    organisationId: 'org-1',
    email: 'coureur@exemple.dz',
    role: 'coureur',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  function buildStore(edition: Partial<EditionRecord> = {}): InscriptionsStore & {
    upsertCoureur: ReturnType<typeof vi.fn>;
    findCurrentEdition: ReturnType<typeof vi.fn>;
    listEpreuves: ReturnType<typeof vi.fn>;
  } {
    const fullEdition: EditionRecord = {
      id: 'edition-1',
      organisationId: 'org-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: RACE_DATE,
      registrationClosesAt: new Date('2100-01-01T00:00:00.000Z'),
      ...edition,
    };
    const epreuves = [
      { id: 'ep-1', editionId: 'edition-1', slug: 'longue', nom: 'La Longue — 35 km', distanceKm: 35 },
      { id: 'ep-2', editionId: 'edition-1', slug: 'moyenne', nom: 'La Moyenne — 12 km', distanceKm: 12 },
    ];
    const coureurRecord = (input: { epreuveId: string; age: number; categorieAge: string }): CoureurRecord => ({
      id: 'coureur-1',
      organisationId: session.organisationId,
      accountId: session.accountId,
      editionId: 'edition-1',
      epreuveId: input.epreuveId,
      epreuveSlug: 'longue',
      epreuveNom: 'La Longue — 35 km',
      distanceKm: 35,
      prenom: 'Yani',
      nom: 'Ulahianne',
      telephone: '+213555010203',
      contactUrgenceNom: 'Lounis Ulahianne',
      contactUrgenceTelephone: '0555010204',
      dateNaissance: '1990-05-12',
      tailleTshirt: 'M',
      age: input.age,
      categorieAge: input.categorieAge,
      status: 'en constitution',
      dossard: null,
      jetonEdossard: null,
      refusalReason: null,
      decidedBy: null,
      decidedAt: null,
      dechargeAcceptedAt: null,
      dechargeVersion: null,
      reglementAcceptedAt: null,
      reglementVersion: null,
      createdAt: new Date('2026-10-21T08:00:00.000Z'),
      updatedAt: new Date('2026-10-21T08:00:00.000Z'),
    });
    const store = {
      findCurrentEdition: vi.fn(async () => fullEdition),
      listEpreuves: vi.fn(async () => epreuves),
      findCoureurByAccount: vi.fn(async () => null),
      upsertCoureur: vi.fn(async (input: Parameters<InscriptionsStore['upsertCoureur']>[0]) =>
        coureurRecord({ epreuveId: input.epreuveId, age: input.age, categorieAge: input.categorieAge }),
      ),
    };
    return store as unknown as InscriptionsStore & {
      upsertCoureur: ReturnType<typeof vi.fn>;
      findCurrentEdition: ReturnType<typeof vi.fn>;
      listEpreuves: ReturnType<typeof vi.fn>;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dossier complet : upsert avec âge et catégorie dérivés', async () => {
    const store = buildStore();
    const summary = await submitInscription(session, validInput(), { store });
    expect(store.upsertCoureur).toHaveBeenCalledTimes(1);
    expect(store.upsertCoureur).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: session.accountId,
        organisationId: session.organisationId,
        editionId: 'edition-1',
        epreuveId: 'ep-1',
        age: 36,
        categorieAge: 'Senior',
      }),
    );
    expect(summary.categorie).toBe('Senior');
    expect(summary.age).toBe(36);
    expect(summary.status).toBe('en constitution');
    // L’envoi best effort démarre après l’événement, sans le bloquer.
    expect(vi.mocked(processOutbox)).toHaveBeenCalledTimes(1);
  });

  it('après clôture : RegistrationClosedError, rien d’écrit', async () => {
    const store = buildStore({ registrationClosesAt: new Date('2000-01-01T00:00:00.000Z') });
    await expect(submitInscription(session, validInput(), { store })).rejects.toBeInstanceOf(
      RegistrationClosedError,
    );
    expect(store.upsertCoureur).not.toHaveBeenCalled();
  });

  it('épreuve inconnue : InvalidFieldsError nommant epreuve, rien d’écrit', async () => {
    const store = buildStore();
    await expect(
      submitInscription(session, validInput({ epreuve: 'sprint' }), { store }),
    ).rejects.toBeInstanceOf(InvalidFieldsError);
    expect(store.upsertCoureur).not.toHaveBeenCalled();
  });

  it('formulaire incomplet : chaque champ manquant nommé, rien d’écrit', async () => {
    const store = buildStore();
    const error = await submitInscription(session, { prenom: 'Yani' }, { store }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(InvalidFieldsError);
    expect(Object.keys((error as InvalidFieldsError).fields).sort()).toEqual(
      [
        'epreuve',
        'nom',
        'telephone',
        'contactUrgenceNom',
        'contactUrgenceTelephone',
        'dateNaissance',
        'tailleTshirt',
      ].sort(),
    );
    expect(store.upsertCoureur).not.toHaveBeenCalled();
  });

  it('aucune édition configurée : erreur serveur', async () => {
    const store = buildStore();
    store.findCurrentEdition.mockResolvedValue(null);
    await expect(submitInscription(session, validInput(), { store })).rejects.toThrow(
      'Aucune édition configurée',
    );
    expect(store.upsertCoureur).not.toHaveBeenCalled();
  });

  it('labels de catégorie complets pour l’affichage', () => {
    expect(AGE_CATEGORY_LABELS.U20).toContain('U20');
    expect(AGE_CATEGORY_LABELS.V3).toContain('60');
  });
});

describe('normalizeAcceptancesInput', () => {
  it('n’accepte que l’intention booléenne stricte', () => {
    expect(normalizeAcceptancesInput({ decharge: true, reglement: true })).toEqual({
      decharge: true,
      reglement: true,
    });
    expect(normalizeAcceptancesInput({ decharge: true })).toEqual({
      decharge: true,
      reglement: false,
    });
    expect(
      normalizeAcceptancesInput({ decharge: 'oui', reglement: 1, dechargeVersion: 'v1' }),
    ).toEqual({ decharge: false, reglement: false });
    expect(normalizeAcceptancesInput(null)).toEqual({ decharge: false, reglement: false });
  });
});

describe('toAcceptancesApiError — erreurs acceptations', () => {
  it('BothAcceptancesRequiredError : 400, code acceptances.both_required', () => {
    const apiError = toAcceptancesApiError(new BothAcceptancesRequiredError());
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.version).toBe(1);
    expect(apiError.envelope.error.code).toBe('acceptances.both_required');
  });

  it('NoCoureurError : 409, code acceptances.no_coureur', () => {
    const apiError = toAcceptancesApiError(new NoCoureurError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('acceptances.no_coureur');
  });

  it('DocumentsMissingError : 503, code acceptances.documents_missing', () => {
    const apiError = toAcceptancesApiError(new DocumentsMissingError());
    expect(apiError.status).toBe(503);
    expect(apiError.envelope.version).toBe(1);
    expect(apiError.envelope.error.code).toBe('acceptances.documents_missing');
    expect(apiError.envelope.error.message).not.toBe('');
    expect(apiError.envelope.error.action).not.toBe('');
  });

  it('RegistrationClosedError : 403, code inscriptions.closed réutilisé', () => {
    const apiError = toAcceptancesApiError(
      new RegistrationClosedError(new Date('2027-03-16T22:59:59.000Z')),
    );
    expect(apiError.status).toBe(403);
    expect(apiError.envelope.error.code).toBe('inscriptions.closed');
    expect(apiError.envelope.error.message).toContain('16 mars 2027');
  });

  it('DossierValidatedError : 409, code inscriptions.dossier_valide réutilisé', () => {
    const apiError = toAcceptancesApiError(new DossierValidatedError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('inscriptions.dossier_valide');
  });

  it('erreur inconnue : 500 acceptances.internal_error sans fuiter le message brut', () => {
    const apiError = toAcceptancesApiError(new Error('boom'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('acceptances.internal_error');
    expect(apiError.envelope.error.message).not.toContain('boom');
  });
});

describe('acceptDocuments — service avec store stubbé', () => {
  const session: SessionRecord = {
    accountId: 'account-1',
    organisationId: 'org-1',
    email: 'coureur@exemple.dz',
    role: 'coureur',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  const SNAPSHOT = {
    dechargeAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
    dechargeVersion: 'v1',
    reglementAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
    reglementVersion: 'v1',
  };

  function buildStore(edition: Partial<EditionRecord> = {}): InscriptionsStore & {
    acceptDocuments: ReturnType<typeof vi.fn>;
    findCurrentEdition: ReturnType<typeof vi.fn>;
  } {
    const fullEdition: EditionRecord = {
      id: 'edition-1',
      organisationId: 'org-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: RACE_DATE,
      registrationClosesAt: new Date('2100-01-01T00:00:00.000Z'),
      ...edition,
    };
    const store = {
      findCurrentEdition: vi.fn(async () => fullEdition),
      listEpreuves: vi.fn(async () => []),
      findDocuments: vi.fn(async () => []),
      findCoureurByAccount: vi.fn(async () => null),
      upsertCoureur: vi.fn(),
      acceptDocuments: vi.fn(async () => SNAPSHOT),
    };
    return store as unknown as InscriptionsStore & {
      acceptDocuments: ReturnType<typeof vi.fn>;
      findCurrentEdition: ReturnType<typeof vi.fn>;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('les deux cases : snapshot renvoyé en ISO UTC, store appelé avec org/account/édition', async () => {
    const store = buildStore();
    const result = await acceptDocuments(session, { decharge: true, reglement: true }, { store });
    expect(store.acceptDocuments).toHaveBeenCalledTimes(1);
    expect(store.acceptDocuments).toHaveBeenCalledWith({
      organisationId: session.organisationId,
      accountId: session.accountId,
      editionId: 'edition-1',
    });
    expect(result).toEqual({
      decharge: { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' },
      reglement: { acceptedAt: '2026-10-21T09:30:00.000Z', version: 'v1' },
    });
  });

  it('une seule case : BothAcceptancesRequiredError, store non appelé', async () => {
    const store = buildStore();
    await expect(
      acceptDocuments(session, { decharge: true, reglement: false }, { store }),
    ).rejects.toBeInstanceOf(BothAcceptancesRequiredError);
    expect(store.acceptDocuments).not.toHaveBeenCalled();
  });

  it('payload vide : BothAcceptancesRequiredError, store non appelé', async () => {
    const store = buildStore();
    await expect(acceptDocuments(session, {}, { store })).rejects.toBeInstanceOf(
      BothAcceptancesRequiredError,
    );
    expect(store.acceptDocuments).not.toHaveBeenCalled();
  });

  it('le client ne fournit jamais les versions : elles sont ignorées', async () => {
    const store = buildStore();
    await acceptDocuments(
      session,
      { decharge: true, reglement: true, dechargeVersion: 'v0-falsifiée', reglementVersion: 42 },
      { store },
    );
    expect(store.acceptDocuments).toHaveBeenCalledWith({
      organisationId: session.organisationId,
      accountId: session.accountId,
      editionId: 'edition-1',
    });
  });

  it('non inscrit : NoCoureurError propagée', async () => {
    const store = buildStore();
    store.acceptDocuments.mockRejectedValue(new NoCoureurError());
    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(NoCoureurError);
  });

  it('dossier validé : DossierValidatedError propagée', async () => {
    const store = buildStore();
    store.acceptDocuments.mockRejectedValue(new DossierValidatedError());
    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toBeInstanceOf(DossierValidatedError);
  });

  it('aucune édition configurée : erreur serveur', async () => {
    const store = buildStore();
    store.findCurrentEdition.mockResolvedValue(null);
    await expect(
      acceptDocuments(session, { decharge: true, reglement: true }, { store }),
    ).rejects.toThrow('Aucune édition configurée');
    expect(store.acceptDocuments).not.toHaveBeenCalled();
  });
});

describe('cycle de statut — helpers domaine', () => {
  it('canDepositPreuve : en constitution et refusé oui, validé non', () => {
    expect(canDepositPreuve('en constitution')).toBe(true);
    expect(canDepositPreuve('refusé')).toBe(true);
    expect(canDepositPreuve('validé')).toBe(false);
  });

  it('normalizeRefusalReason : trim, non-chaînes → vide', () => {
    expect(normalizeRefusalReason('  reçu illisible  ')).toBe('reçu illisible');
    expect(normalizeRefusalReason(null)).toBe('');
    expect(normalizeRefusalReason(42)).toBe('');
    expect(normalizeRefusalReason(undefined)).toBe('');
  });

  // I9 (revue épopée 10) — l'ancien test épingle coureurStatusChipClass (un
  // variant aa-chip par statut) : la fonction est supprimée, la page détail
  // affiche désormais la MÊME pastille socle que la liste. La correspondance
  // statut → variante socle reste épinglée ici (PASTILLE_STATUT), et le
  // rendu réel est couvert par admin/dossiers/[id]/page.test.tsx.
  it('PASTILLE_STATUT : une variante socle par statut (liste ET détail)', () => {
    expect(PASTILLE_STATUT['validé']).toBe('socle-pastille--succes');
    expect(PASTILLE_STATUT['refusé']).toBe('socle-pastille--danger');
    expect(PASTILLE_STATUT['en constitution']).toBe('socle-pastille--attention');
  });
});

describe('decideDossier — validation d’entrée avec store stubbé', () => {
  const session: SessionRecord = {
    accountId: 'account-admin',
    organisationId: 'org-1',
    email: 'organisateur@exemple.dz',
    role: 'organisateur',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  function buildAdminStore(
    coureur: Partial<CoureurRecord> = {},
  ): InscriptionsStore & {
    findCurrentEdition: ReturnType<typeof vi.fn>;
    decideDossier: ReturnType<typeof vi.fn>;
  } {
    const fullEdition: EditionRecord = {
      id: 'edition-1',
      organisationId: 'org-1',
      slug: '2027',
      nom: 'Édition 2027',
      dateCourse: RACE_DATE,
      registrationClosesAt: new Date('2100-01-01T00:00:00.000Z'),
    };
    const record: CoureurRecord = {
      id: 'coureur-1',
      organisationId: 'org-1',
      accountId: 'account-coureur',
      editionId: 'edition-1',
      epreuveId: 'ep-1',
      epreuveSlug: 'longue',
      epreuveNom: 'La Longue — 35 km',
      distanceKm: 35,
      prenom: 'Yani',
      nom: 'Ulahianne',
      telephone: '+213555010203',
      contactUrgenceNom: 'Lounis Ulahianne',
      contactUrgenceTelephone: '0555010204',
      dateNaissance: '1990-05-12',
      tailleTshirt: 'M',
      age: 36,
      categorieAge: 'Senior',
      status: 'en constitution',
      dossard: null,
      jetonEdossard: null,
      refusalReason: null,
      decidedBy: null,
      decidedAt: null,
      dechargeAcceptedAt: null,
      dechargeVersion: null,
      reglementAcceptedAt: null,
      reglementVersion: null,
      createdAt: new Date('2026-10-21T08:00:00.000Z'),
      updatedAt: new Date('2026-10-21T08:00:00.000Z'),
      ...coureur,
    };
    const store = {
      findCurrentEdition: vi.fn(async () => fullEdition),
      listEpreuves: vi.fn(async () => []),
      findDocuments: vi.fn(async () => []),
      findCoureurByAccount: vi.fn(async () => null),
      upsertCoureur: vi.fn(),
      acceptDocuments: vi.fn(),
      decideDossier: vi.fn(async () => record),
    };
    return store as unknown as InscriptionsStore & {
      findCurrentEdition: ReturnType<typeof vi.fn>;
      decideDossier: ReturnType<typeof vi.fn>;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valider : store appelé avec decision valider, sans motif, traçabilité décidée par la session', async () => {
    const store = buildAdminStore();
    const summary = await decideDossier(session, 'coureur-1', { decision: 'valider' }, { store });
    expect(store.decideDossier).toHaveBeenCalledWith({
      organisationId: session.organisationId,
      editionId: 'edition-1',
      coureurId: 'coureur-1',
      decision: 'valider',
      refusalReason: null,
      decidedBy: session.accountId,
    });
    expect(summary.status).toBe('en constitution');
    expect(vi.mocked(processOutbox)).toHaveBeenCalledTimes(1);
  });

  it('refuser avec motif : store appelé avec le motif trimé et la traçabilité', async () => {
    const store = buildAdminStore();
    await decideDossier(
      session,
      'coureur-1',
      { decision: 'refuser', motif: '  reçu illisible  ' },
      { store },
    );
    expect(store.decideDossier).toHaveBeenCalledWith({
      organisationId: session.organisationId,
      editionId: 'edition-1',
      coureurId: 'coureur-1',
      decision: 'refuser',
      refusalReason: 'reçu illisible',
      decidedBy: session.accountId,
    });
  });

  it('refuser sans motif : RefusalReasonRequiredError, store non appelé', async () => {
    const store = buildAdminStore();
    await expect(
      decideDossier(session, 'coureur-1', { decision: 'refuser' }, { store }),
    ).rejects.toBeInstanceOf(RefusalReasonRequiredError);
    await expect(
      decideDossier(session, 'coureur-1', { decision: 'refuser', motif: '   ' }, { store }),
    ).rejects.toBeInstanceOf(RefusalReasonRequiredError);
    expect(store.decideDossier).not.toHaveBeenCalled();
  });

  it('motif au-delà de 280 caractères : RefusalReasonTooLongError, store non appelé', async () => {
    const store = buildAdminStore();
    await expect(
      decideDossier(
        session,
        'coureur-1',
        { decision: 'refuser', motif: 'x'.repeat(MAX_REFUSAL_REASON_LENGTH + 1) },
        { store },
      ),
    ).rejects.toBeInstanceOf(RefusalReasonTooLongError);
    expect(store.decideDossier).not.toHaveBeenCalled();
  });

  it('décision inconnue ou payload non objet : DecisionInvalidError, store non appelé', async () => {
    const store = buildAdminStore();
    await expect(
      decideDossier(session, 'coureur-1', { decision: 'annuler' }, { store }),
    ).rejects.toBeInstanceOf(DecisionInvalidError);
    await expect(decideDossier(session, 'coureur-1', 'valider', { store })).rejects.toBeInstanceOf(
      DecisionInvalidError,
    );
    await expect(decideDossier(session, 'coureur-1', null, { store })).rejects.toBeInstanceOf(
      DecisionInvalidError,
    );
    expect(store.decideDossier).not.toHaveBeenCalled();
  });

  it('le motif est ignoré pour une validation', async () => {
    const store = buildAdminStore();
    await decideDossier(
      session,
      'coureur-1',
      { decision: 'valider', motif: 'peu importe' },
      { store },
    );
    expect(store.decideDossier).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'valider', refusalReason: null }),
    );
  });
});

describe('toAdminApiError — enveloppes admin', () => {
  it('RefusalReasonRequiredError : 400 admin.refusal_reason_required nommant le motif', () => {
    const apiError = toAdminApiError(new RefusalReasonRequiredError());
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.version).toBe(1);
    expect(apiError.envelope.error.code).toBe('admin.refusal_reason_required');
    expect(apiError.envelope.error.message).toContain('motif');
  });

  it('RefusalReasonTooLongError : 400 admin.refusal_reason_too_long avec la limite', () => {
    const apiError = toAdminApiError(new RefusalReasonTooLongError(280));
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.error.code).toBe('admin.refusal_reason_too_long');
    expect(apiError.envelope.error.message).toContain('280');
  });

  it('DecisionInvalidError : 400 admin.decision_invalid', () => {
    const apiError = toAdminApiError(new DecisionInvalidError());
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.error.code).toBe('admin.decision_invalid');
  });

  it('DossierIncompletError : 409 admin.dossier_incomplet nommant les pièces manquantes', () => {
    const apiError = toAdminApiError(new DossierIncompletError(['preuve', 'decharge']));
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.dossier_incomplet');
    expect(apiError.envelope.error.message).toContain('la preuve de paiement');
    expect(apiError.envelope.error.message).toContain('la décharge acceptée');
  });

  it('DossierIncompletError : une seule pièce manquante, message sans « et »', () => {
    const apiError = toAdminApiError(new DossierIncompletError(['reglement']));
    expect(apiError.envelope.error.message).toContain('le règlement intérieur accepté');
    expect(apiError.envelope.error.message).not.toContain(' et ');
  });

  it('DossierNotFoundError : 404 admin.dossier_not_found', () => {
    const apiError = toAdminApiError(new DossierNotFoundError());
    expect(apiError.status).toBe(404);
    expect(apiError.envelope.error.code).toBe('admin.dossier_not_found');
  });

  it('PreuveNotFoundError : 404 admin.preuve_not_found', () => {
    const apiError = toAdminApiError(new PreuveNotFoundError());
    expect(apiError.status).toBe(404);
    expect(apiError.envelope.error.code).toBe('admin.preuve_not_found');
  });

  it('DossierValidatedError : 409 admin.dossier_valide avec wording organisateur', () => {
    const apiError = toAdminApiError(new DossierValidatedError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.dossier_valide');
    expect(apiError.envelope.error.message).toContain('re-validation');
  });

  it('erreur inconnue : 500 admin.internal_error sans fuiter le message brut', () => {
    const apiError = toAdminApiError(new Error('boom'));
    expect(apiError.status).toBe(500);
    expect(apiError.envelope.error.code).toBe('admin.internal_error');
    expect(apiError.envelope.error.message).not.toContain('boom');
  });
});
