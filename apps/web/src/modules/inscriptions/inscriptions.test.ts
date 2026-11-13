import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/notifications/worker', async () => {
  const { createSilentOutboxWorker } = await import('@/test/outbox-worker-mock');
  return createSilentOutboxWorker();
});

import { processOutbox } from '@/modules/notifications/worker';

import {
  AGE_CATEGORY_LABELS,
  FIELD_ORDER,
  MAX_AGE_AT_RACE,
  MESSAGE_HEBERGEMENT_TIZI_OUZOU,
  choisirWilaya,
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
import {
  PAYS,
  WILAYAS,
  WILAYA_ETRANGER,
  WILAYA_TIZI_OUZOU,
  libelleProvenance,
} from './provenance';
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
    genre: 'H',
    wilaya: '16',
    pays: '',
    hebergement: '',
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

  it('19 ans : Senior — U20 n’existe plus, la course est réservée aux majeurs', () => {
    expect(deriveAgeAndCategory('2007-03-27', RACE_DATE)).toEqual({
      age: 19,
      category: 'Senior',
    });
  });

  it('18 ans tout juste le jour de la course : admis, Senior', () => {
    expect(deriveAgeAndCategory('2009-03-26', RACE_DATE)).toEqual({
      age: 18,
      category: 'Senior',
    });
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
        genre: ' h ',
        wilaya: ' 16 ',
        hebergement: '',
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

  it('chaque champ OBLIGATOIRE manquant est nommé individuellement', () => {
    // L'hébergement est la seule option du formulaire : son absence est un
    // choix, pas une erreur. Le pays n'est exigé que pour l'étranger (voir
    // la matrice de provenance). Tout le reste est exigé.
    const keys = (Object.keys(validInput()) as (keyof InscriptionFormInput)[]).filter(
      (key) => key !== 'hebergement' && key !== 'pays',
    );
    for (const key of keys) {
      const input = validInput({ [key]: '' });
      const errors = validateInscriptionInput(input, slugs, RACE_DATE);
      expect(Object.keys(errors), `champ ${key}`).toEqual([key]);
    }
  });

  it('formulaire vide : les dix champs obligatoires sont signalés', () => {
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
        genre: '',
        wilaya: '',
        pays: '',
        hebergement: '',
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
        'genre',
        'wilaya',
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

  it('âge imbroglio : moins de 18 ans ou plus de 100 ans à la course', () => {
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
      capacite: 600,
      seuilAffichagePlaces: 200,
      capaciteHebergement: 200,
      prixDossardDa: 2000,
      prixHebergementDa: 1500,
      delaiPreuveHeures: 48,
      dateCoursePublique: false,
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
      genre: 'H',
      wilaya: null,
      pays: null,
      hebergement: false,
      preuveDueAt: null,
      expiredAt: null,
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
        'genre',
        'wilaya',
      ].sort(),
    );
    expect(store.upsertCoureur).not.toHaveBeenCalled();
  });

  it('wilaya hors Tizi Ouzou + hébergement : inscrit avec la demande d’hébergement', async () => {
    const store = buildStore();
    await submitInscription(session, validInput({ wilaya: '16', hebergement: 'oui' }), { store });
    expect(store.upsertCoureur).toHaveBeenCalledWith(
      expect.objectContaining({ wilaya: '16', hebergement: true }),
    );
  });

  it('Tizi Ouzou + hébergement : refus 400 nommé sur hebergement, rien d’écrit', async () => {
    const store = buildStore();
    const error = await submitInscription(
      session,
      validInput({ wilaya: '15', hebergement: 'oui' }),
      { store },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvalidFieldsError);
    const apiError = toApiError(error);
    expect(apiError.status).toBe(400);
    expect(apiError.fields).toEqual({ hebergement: MESSAGE_HEBERGEMENT_TIZI_OUZOU });
    expect(store.upsertCoureur).not.toHaveBeenCalled();
  });

  it('Tizi Ouzou sans hébergement : inscrit', async () => {
    const store = buildStore();
    await submitInscription(session, validInput({ wilaya: '15' }), { store });
    expect(store.upsertCoureur).toHaveBeenCalledWith(
      expect.objectContaining({ wilaya: '15', hebergement: false }),
    );
  });

  it('étranger avec pays : pays transmis au store', async () => {
    const store = buildStore();
    await submitInscription(session, validInput({ wilaya: 'ETR', pays: 'FR' }), { store });
    expect(store.upsertCoureur).toHaveBeenCalledWith(
      expect.objectContaining({ wilaya: 'ETR', pays: 'FR' }),
    );
  });

  it('pays envoyé hors étranger : inscrit (le store le force à NULL — voir l’intégration)', async () => {
    const store = buildStore();
    await submitInscription(session, validInput({ wilaya: '16', pays: 'FR' }), { store });
    expect(store.upsertCoureur).toHaveBeenCalledWith(expect.objectContaining({ wilaya: '16' }));
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
    expect(AGE_CATEGORY_LABELS.Senior).toContain('18');
    expect(AGE_CATEGORY_LABELS.V3).toContain('60');
    expect(Object.keys(AGE_CATEGORY_LABELS)).toEqual(['Senior', 'V1', 'V2', 'V3']);
  });
});

describe('majorité obligatoire à la date de la course', () => {
  const slugs = ['longue', 'moyenne'];

  it('17 ans la veille de ses 18 ans : refusé', () => {
    const errors = validateInscriptionInput(
      validInput({ dateNaissance: '2009-03-27' }),
      slugs,
      RACE_DATE,
    );
    expect(errors.dateNaissance).toBeDefined();
  });

  it('18 ans le jour de la course : accepté', () => {
    const errors = validateInscriptionInput(
      validInput({ dateNaissance: '2009-03-26' }),
      slugs,
      RACE_DATE,
    );
    expect(errors.dateNaissance).toBeUndefined();
  });

  it('le message dit la règle, pas seulement un intervalle', () => {
    const message = validateInscriptionInput(
      validInput({ dateNaissance: '2015-01-01' }),
      slugs,
      RACE_DATE,
    ).dateNaissance;
    expect(message).toContain('18');
    expect(message).toMatch(/majeur|18 ans/i);
  });
});

describe('genre du coureur', () => {
  const slugs = ['longue', 'moyenne'];

  it('obligatoire : absent, erreur nommée sur le champ', () => {
    const errors = validateInscriptionInput(
      validInput({ genre: '' }),
      slugs,
      RACE_DATE,
    );
    expect(errors.genre).toBeDefined();
  });

  it('refuse une valeur hors liste', () => {
    expect(
      validateInscriptionInput(validInput({ genre: 'X' }), slugs, RACE_DATE).genre,
    ).toBeDefined();
  });

  it('accepte F et H', () => {
    for (const genre of ['F', 'H']) {
      expect(
        validateInscriptionInput(validInput({ genre }), slugs, RACE_DATE).genre,
      ).toBeUndefined();
    }
  });

  it('normalise la saisie brute : espaces et minuscules', () => {
    expect(normalizeInscriptionInput({ genre: ' f ' }).genre).toBe('F');
    expect(normalizeInscriptionInput({ genre: 'h' }).genre).toBe('H');
  });

  it('valeur inconnue : conservée telle quelle pour que la validation la refuse', () => {
    expect(normalizeInscriptionInput({ genre: 'autre' }).genre).toBe('AUTRE');
  });

  it('fait partie de l’ordre des champs — sinon le focus d’erreur l’ignore', () => {
    expect(FIELD_ORDER).toContain('genre');
  });

  it('l’hébergement, facultatif mais refusable (Tizi Ouzou), fait partie de l’ordre', () => {
    expect(FIELD_ORDER).toContain('hebergement');
  });
});

describe('provenance — wilaya, étranger et hébergement (matrice de la spec)', () => {
  const slugs = ['longue', 'moyenne'];
  const valider = (overrides: Partial<InscriptionFormInput>) =>
    validateInscriptionInput(validInput(overrides), slugs, RACE_DATE);
  const MESSAGE_WILAYA = 'Choisis ta wilaya, ou « Étranger ».';
  const MESSAGE_PAYS = 'Indique ton pays de résidence.';

  it('hors Tizi Ouzou + hébergement : aucune erreur', () => {
    expect(valider({ wilaya: '16', hebergement: 'oui' })).toEqual({});
  });

  it('Tizi Ouzou + hébergement : erreur nommée sur hebergement, message de la règle', () => {
    expect(valider({ wilaya: '15', hebergement: 'oui' })).toEqual({
      hebergement:
        'L’hébergement est réservé aux participants venant d’une autre wilaya que Tizi Ouzou.',
    });
  });

  it('Tizi Ouzou sans hébergement : aucune erreur', () => {
    expect(valider({ wilaya: '15', hebergement: '' })).toEqual({});
  });

  it('étranger sans pays : erreur sur pays', () => {
    expect(valider({ wilaya: 'ETR', pays: '' })).toEqual({ pays: MESSAGE_PAYS });
  });

  it('étranger avec pays : aucune erreur', () => {
    expect(valider({ wilaya: 'ETR', pays: 'FR' })).toEqual({});
  });

  it('pays inconnu ou Algérie : erreur sur pays', () => {
    expect(valider({ wilaya: 'ETR', pays: 'XX' })).toEqual({ pays: MESSAGE_PAYS });
    expect(valider({ wilaya: 'ETR', pays: 'DZ' })).toEqual({ pays: MESSAGE_PAYS });
  });

  it('wilaya absente : erreur sur wilaya', () => {
    expect(valider({ wilaya: '' })).toEqual({ wilaya: MESSAGE_WILAYA });
  });

  it('wilaya inconnue : erreur sur wilaya, même message', () => {
    expect(valider({ wilaya: '70' })).toEqual({ wilaya: MESSAGE_WILAYA });
    expect(valider({ wilaya: '00' })).toEqual({ wilaya: MESSAGE_WILAYA });
    expect(valider({ wilaya: '6' })).toEqual({ wilaya: MESSAGE_WILAYA });
  });

  it('pays envoyé hors étranger : ignoré, aucune erreur', () => {
    expect(valider({ wilaya: '16', pays: 'FR' })).toEqual({});
  });

  it('les 69 wilayas sont acceptées', () => {
    for (const { code } of WILAYAS) {
      expect(valider({ wilaya: code }).wilaya, `wilaya ${code}`).toBeUndefined();
    }
  });

  it('normalise la saisie brute : espaces et minuscules', () => {
    const brut = normalizeInscriptionInput({ wilaya: ' etr ', pays: 'fr ' });
    expect(brut.wilaya).toBe('ETR');
    expect(brut.pays).toBe('FR');
  });

  it('wilaya et pays font partie de l’ordre des champs, après le téléphone', () => {
    const telephone = FIELD_ORDER.indexOf('telephone');
    expect(FIELD_ORDER.indexOf('wilaya')).toBe(telephone + 1);
    expect(FIELD_ORDER.indexOf('pays')).toBe(telephone + 2);
  });
});

describe('choisirWilaya — effets du choix dans le formulaire', () => {
  it('Tizi Ouzou décoche l’hébergement déjà demandé', () => {
    const apres = choisirWilaya(validInput({ wilaya: '16', hebergement: 'oui' }), '15');
    expect(apres.wilaya).toBe('15');
    expect(apres.hebergement).toBe('');
    // …et l'envoi qui suit passe : la case décochée ne déclenche plus la règle.
    expect(validateInscriptionInput(apres, ['longue'], RACE_DATE)).toEqual({});
  });

  it('dossier ancien sans wilaya, avec hébergement : choisir Tizi Ouzou le décoche', () => {
    const ancien = validInput({ wilaya: '', hebergement: 'oui' });
    expect(validateInscriptionInput(ancien, ['longue'], RACE_DATE)).toEqual({
      wilaya: 'Choisis ta wilaya, ou « Étranger ».',
    });
    expect(choisirWilaya(ancien, '15').hebergement).toBe('');
  });

  it('une autre wilaya conserve l’hébergement', () => {
    expect(choisirWilaya(validInput({ hebergement: 'oui' }), '06').hebergement).toBe('oui');
  });

  it('quitter « Étranger » efface le pays ; y rester le conserve', () => {
    const etranger = validInput({ wilaya: 'ETR', pays: 'FR' });
    expect(choisirWilaya(etranger, '16').pays).toBe('');
    expect(choisirWilaya(etranger, 'ETR').pays).toBe('FR');
  });
});

describe('référentiels de provenance', () => {
  it('69 wilayas, codes 01 à 69 dans l’ordre, Tizi Ouzou = 15', () => {
    expect(WILAYAS).toHaveLength(69);
    expect(WILAYAS.map((wilaya) => wilaya.code)).toEqual(
      Array.from({ length: 69 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
    expect(WILAYAS.find((wilaya) => wilaya.code === WILAYA_TIZI_OUZOU)?.nom).toBe('Tizi Ouzou');
    expect(WILAYAS.find((wilaya) => wilaya.code === '59')?.nom).toBe('Aflou');
    expect(WILAYAS.find((wilaya) => wilaya.code === '69')?.nom).toBe('Messaad');
  });

  it('pays : codes ISO alpha-2 uniques, libellés français, triés, sans l’Algérie', () => {
    const codes = PAYS.map((pays) => pays.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(codes).not.toContain('DZ');
    expect(PAYS.find((pays) => pays.code === 'FR')?.nom).toBe('France');
    const noms = PAYS.map((pays) => pays.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('libelleProvenance : wilaya, étranger, non renseignée', () => {
    expect(libelleProvenance('06', null)).toBe('Béjaïa (06)');
    expect(libelleProvenance(WILAYA_ETRANGER, 'FR')).toBe('Étranger — France');
    expect(libelleProvenance(null, null)).toBe('non renseignée');
    expect(libelleProvenance(undefined, undefined)).toBe('non renseignée');
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
      capacite: 600,
      seuilAffichagePlaces: 200,
      capaciteHebergement: 200,
      prixDossardDa: 2000,
      prixHebergementDa: 1500,
      delaiPreuveHeures: 48,
      dateCoursePublique: false,
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
  it('canDepositPreuve : en constitution seulement ; en validation, refusé, expirée, validé non', () => {
    expect(canDepositPreuve('en constitution')).toBe(true);
    // En validation : figé, aucun remplacement de preuve (PO, 11/11/2026).
    expect(canDepositPreuve('en validation')).toBe(false);
    // Refusé : la reprise passe par « Modifier mon inscription », pas par un dépôt.
    expect(canDepositPreuve('refusé')).toBe(false);
    expect(canDepositPreuve('expirée')).toBe(false);
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
      capacite: 600,
      seuilAffichagePlaces: 200,
      capaciteHebergement: 200,
      prixDossardDa: 2000,
      prixHebergementDa: 1500,
      delaiPreuveHeures: 48,
      dateCoursePublique: false,
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
      genre: 'H',
      wilaya: null,
      pays: null,
      hebergement: false,
      preuveDueAt: null,
      expiredAt: null,
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
