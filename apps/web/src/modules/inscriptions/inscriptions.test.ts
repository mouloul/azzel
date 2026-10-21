import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AGE_CATEGORY_LABELS,
  MAX_AGE_AT_RACE,
  MIN_AGE_AT_RACE,
  deriveAgeAndCategory,
  isRegistrationOpen,
  isValidPhone,
  normalizeInscriptionInput,
  validateInscriptionInput,
  type InscriptionFormInput,
} from './domain';
import {
  DossierValidatedError,
  InvalidFieldsError,
  RegistrationClosedError,
  toApiError,
} from './errors';
import { submitInscription } from './service';
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
