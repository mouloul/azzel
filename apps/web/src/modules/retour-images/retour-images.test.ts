import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_CITATION_LENGTH,
  MAX_EDITION_LENGTH,
  MAX_PRENOM_LENGTH,
  MAX_TEMOIGNAGE_ORDRE,
  MIN_TEMOIGNAGE_ORDRE,
  avecLectureImmediate,
  initiales,
  isHttpsUrl,
  normalizeTemoignageInput,
  normalizeTrailerUrlInput,
  ordreTypeError,
  resolveRetourImagesPage,
  resolveTrailerPlayer,
  temoignageTypeErrors,
  validateTemoignageInput,
  validateTrailerUrl,
  type ResolvableTemoignage,
} from './domain';
import {
  InvalidTemoignageFieldsError,
  InvalidTrailerUrlError,
  TemoignageNotFoundError,
  TemoignagesLimitError,
  toRetourImagesApiError,
} from './errors';
import {
  createTemoignage,
  deleteTemoignage,
  getRetourImagesPage,
  getRetourImagesAdminState,
  setTrailerUrl,
  updateTemoignage,
} from './service';
import { DbUnavailableError } from '@/modules/iam/errors';
import type { SessionRecord } from '@/modules/iam/store';
import type { RetourImagesStore, TemoignageRecord, MediaConfigRecord } from './store';

const SESSION: SessionRecord = {
  accountId: 'account-org',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function temoignageRecord(overrides: Partial<TemoignageRecord> = {}): TemoignageRecord {
  return {
    id: 'temoignage-1',
    organisationId: 'org-1',
    citation: 'Des sentiers magnifiques.',
    prenom: 'Yacine',
    editionReference: 'Trail 2026',
    ordre: 1,
    createdAt: new Date('2026-10-22T09:00:00.000Z'),
    ...overrides,
  };
}

function mediaConfig(overrides: Partial<MediaConfigRecord> = {}): MediaConfigRecord {
  return {
    organisationId: 'org-1',
    trailerUrl: null,
    updatedAt: new Date('2026-10-22T09:00:00.000Z'),
    ...overrides,
  };
}

function fakeStore(overrides: Partial<RetourImagesStore> = {}): RetourImagesStore {
  return {
    listTemoignages: vi.fn(),
    findTemoignageById: vi.fn(),
    createTemoignage: vi.fn(),
    updateTemoignage: vi.fn(),
    deleteTemoignage: vi.fn(),
    findMediaConfig: vi.fn(),
    setTrailerUrl: vi.fn(),
    readDefaultOrgRetourImages: vi.fn(),
    ...overrides,
  };
}

function resolvable(overrides: Partial<ResolvableTemoignage> = {}): ResolvableTemoignage {
  return {
    id: 'temoignage-1',
    citation: 'Une organisation impeccable.',
    prenom: 'Yacine',
    editionReference: 'Trail 2026',
    ordre: 1,
    ...overrides,
  };
}

describe('retour-images — domaine', () => {
  it('isHttpsUrl : https accepté, tout le reste refusé', () => {
    expect(isHttpsUrl('https://video.exemple.dz/trailer.mp4')).toBe(true);
    expect(isHttpsUrl('http://video.exemple.dz/trailer.mp4')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('video.exemple.dz')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
  });

  it('normalizeTemoignageInput : trim, champs texte, ordre entier ou null', () => {
    expect(
      normalizeTemoignageInput({
        citation: '  Super course.  ',
        prenom: ' Yacine ',
        editionReference: ' Trail 2026 ',
        ordre: 3,
      }),
    ).toEqual({
      citation: 'Super course.',
      prenom: 'Yacine',
      editionReference: 'Trail 2026',
      ordre: 3,
    });
    expect(normalizeTemoignageInput({ citation: 'x', ordre: 1.5 })).toMatchObject({
      ordre: null,
    });
    expect(normalizeTemoignageInput({ citation: 'x', ordre: '2' })).toMatchObject({
      ordre: null,
    });
    expect(normalizeTemoignageInput(null)).toEqual({
      citation: '',
      prenom: '',
      editionReference: '',
      ordre: null,
    });
  });

  it('validation : citation requise ≤ 280, prénom ≤ 40, édition ≤ 40', () => {
    expect(
      validateTemoignageInput({
        citation: 'Super course.',
        prenom: 'Yacine',
        editionReference: 'Trail 2026',
        ordre: null,
      }),
    ).toEqual({});
    expect(
      validateTemoignageInput({ citation: '', prenom: '', editionReference: '', ordre: null }),
    ).toEqual({
      citation: 'La citation est obligatoire.',
      prenom: 'Le prénom est obligatoire.',
      editionReference: 'L’édition de référence est obligatoire (ex. « Trail 2026 »).',
    });
    expect(
      validateTemoignageInput({
        citation: 'x'.repeat(MAX_CITATION_LENGTH + 1),
        prenom: 'y'.repeat(MAX_PRENOM_LENGTH + 1),
        editionReference: 'z'.repeat(MAX_EDITION_LENGTH + 1),
        ordre: null,
      }).citation,
    ).toContain('280 caractères maximum');
    expect(
      validateTemoignageInput({
        citation: 'x',
        prenom: 'y'.repeat(MAX_PRENOM_LENGTH + 1),
        editionReference: 'Trail 2026',
        ordre: null,
      }).prenom,
    ).toContain('40 caractères maximum');
    expect(
      validateTemoignageInput({
        citation: 'x',
        prenom: 'Yacine',
        editionReference: 'z'.repeat(MAX_EDITION_LENGTH + 1),
        ordre: null,
      }).editionReference,
    ).toContain('40 caractères maximum');
  });

  it('validation : ordre borné 1–9999 quand il est fourni', () => {
    const base = {
      citation: 'Super course.',
      prenom: 'Yacine',
      editionReference: 'Trail 2026',
    };
    expect(validateTemoignageInput({ ...base, ordre: null }).ordre).toBeUndefined();
    expect(validateTemoignageInput({ ...base, ordre: MIN_TEMOIGNAGE_ORDRE }).ordre).toBeUndefined();
    expect(validateTemoignageInput({ ...base, ordre: MAX_TEMOIGNAGE_ORDRE }).ordre).toBeUndefined();
    expect(validateTemoignageInput({ ...base, ordre: 0 }).ordre).toContain('entre 1 et 9999');
    expect(validateTemoignageInput({ ...base, ordre: -3 }).ordre).toContain('entre 1 et 9999');
    expect(
      validateTemoignageInput({ ...base, ordre: MAX_TEMOIGNAGE_ORDRE + 1 }).ordre,
    ).toContain('entre 1 et 9999');
  });

  it('avecLectureImmediate : autoplay=1 au premier clic (geste utilisateur), query préservée', () => {
    expect(avecLectureImmediate('https://www.youtube.com/embed/AbCdEf12345')).toBe(
      'https://www.youtube.com/embed/AbCdEf12345?autoplay=1',
    );
    expect(avecLectureImmediate('https://player.vimeo.com/video/123?title=0')).toBe(
      'https://player.vimeo.com/video/123?title=0&autoplay=1',
    );
  });

  it('types bruts : citation/prenom/editionReference non-chaîne refusés champ nommé', () => {
    expect(temoignageTypeErrors({ citation: 42 }).citation).toContain('texte');
    expect(temoignageTypeErrors({ prenom: [] }).prenom).toContain('texte');
    expect(temoignageTypeErrors({ editionReference: null, citation: 'x' })).toEqual({});
    expect(temoignageTypeErrors('pas un objet')).toEqual({});
  });

  it('ordreTypeError : non-entier refusé, absent/nul/entier acceptés', () => {
    expect(ordreTypeError({ ordre: 'deux' })).toContain('nombre entier');
    expect(ordreTypeError({ ordre: 1.5 })).toContain('nombre entier');
    expect(ordreTypeError({ ordre: 2 })).toBeNull();
    expect(ordreTypeError({ ordre: null })).toBeNull();
    expect(ordreTypeError({})).toBeNull();
  });

  it('initiales : première lettre de chaque mot, plafonné à deux', () => {
    expect(initiales('Yacine')).toBe('Y');
    expect(initiales('nadia')).toBe('N');
    expect(initiales('Amina L.')).toBe('AL');
    expect(initiales('  Karim   Ali  Djamel ')).toBe('KA');
    expect(initiales('Jean-Pierre')).toBe('J');
  });

  it('normalizeTrailerUrlInput : trim, vide → null, non-chaîne → null', () => {
    expect(normalizeTrailerUrlInput({ trailerUrl: '  https://v.dz/t.mp4  ' })).toEqual({
      trailerUrl: 'https://v.dz/t.mp4',
    });
    expect(normalizeTrailerUrlInput({ trailerUrl: '   ' })).toEqual({ trailerUrl: null });
    expect(normalizeTrailerUrlInput({})).toEqual({ trailerUrl: null });
  });

  it('validateTrailerUrl : null passe (pas de vidéo), http refusé, https ≤ 2048 accepté', () => {
    expect(validateTrailerUrl(null)).toBeNull();
    expect(validateTrailerUrl('http://video.dz/t.mp4')).toContain('https://');
    expect(validateTrailerUrl('pas-une-url')).toContain('https://');
    expect(validateTrailerUrl('https://video.dz/t.mp4')).toBeNull();
    expect(validateTrailerUrl(`https://video.dz/${'a'.repeat(2100)}`)).toContain(
      '2048 caractères maximum',
    );
  });

  describe('resolveTrailerPlayer — détection du lecteur', () => {
    it('YouTube watch/youtu.be/shorts/live/embed → iframe embed', () => {
      const attendu = { kind: 'iframe', url: 'https://www.youtube.com/embed/AbCdEf12345' };
      expect(resolveTrailerPlayer('https://www.youtube.com/watch?v=AbCdEf12345')).toEqual(
        attendu,
      );
      expect(resolveTrailerPlayer('https://youtube.com/watch?v=AbCdEf12345&t=2s')).toEqual(
        attendu,
      );
      expect(resolveTrailerPlayer('https://youtu.be/AbCdEf12345')).toEqual(attendu);
      expect(resolveTrailerPlayer('https://www.youtube.com/shorts/AbCdEf12345')).toEqual(
        attendu,
      );
      expect(resolveTrailerPlayer('https://www.youtube.com/live/AbCdEf12345')).toEqual(
        attendu,
      );
      expect(resolveTrailerPlayer('https://www.youtube-nocookie.com/embed/AbCdEf12345')).toEqual(
        attendu,
      );
    });

    it('Vimeo → iframe player', () => {
      expect(resolveTrailerPlayer('https://vimeo.com/123456789')).toEqual({
        kind: 'iframe',
        url: 'https://player.vimeo.com/video/123456789',
      });
      expect(resolveTrailerPlayer('https://player.vimeo.com/video/123456789')).toEqual({
        kind: 'iframe',
        url: 'https://player.vimeo.com/video/123456789',
      });
    });

    it('URL directe https → vidéo native', () => {
      expect(resolveTrailerPlayer('https://media.exemple.dz/trailer-2026.mp4')).toEqual({
        kind: 'video',
        url: 'https://media.exemple.dz/trailer-2026.mp4',
      });
    });

    it('non https ou illisible → null (garde de rendu : bloc absent)', () => {
      expect(resolveTrailerPlayer('http://www.youtube.com/watch?v=AbCdEf12345')).toBeNull();
      expect(resolveTrailerPlayer('http://media.dz/t.mp4')).toBeNull();
      expect(resolveTrailerPlayer('pas-une-url')).toBeNull();
      expect(resolveTrailerPlayer('https://www.youtube.com/watch?x=1')).toBeNull();
      expect(resolveTrailerPlayer('https://youtu.be/')).toBeNull();
    });
  });

  describe('resolveRetourImagesPage — dégradations propres', () => {
    it('sans trailer ni témoignages : page vide, aucun bloc fantôme', () => {
      expect(resolveRetourImagesPage({ trailerUrl: null, temoignages: [] })).toEqual({
        trailer: null,
        temoignages: [],
      });
    });

    it('trailer configuré : lecteur résolu (youtube → iframe)', () => {
      const view = resolveRetourImagesPage({
        trailerUrl: 'https://youtu.be/AbCdEf12345',
        temoignages: [],
      });
      expect(view.trailer).toEqual({
        kind: 'iframe',
        url: 'https://www.youtube.com/embed/AbCdEf12345',
      });
    });

    it('URL non https échappée en base : bloc trailer absent (défense en profondeur)', () => {
      const view = resolveRetourImagesPage({
        trailerUrl: 'http://media.dz/trailer.mp4',
        temoignages: [resolvable()],
      });
      expect(view.trailer).toBeNull();
      expect(view.temoignages).toHaveLength(1);
    });

    it('témoignages triés par ordre, id conservé (clé de rendu), initiales résolues', () => {
      const view = resolveRetourImagesPage({
        trailerUrl: null,
        temoignages: [
          resolvable({ id: 't2', prenom: 'Nadia', ordre: 2 }),
          resolvable({ id: 't1', prenom: 'Yacine', ordre: 1 }),
          resolvable({ id: 't3', prenom: 'Yacine', ordre: 1 }),
        ],
      });
      expect(view.temoignages.map((temoignage) => temoignage.id)).toEqual([
        't1',
        't3',
        't2',
      ]);
      expect(view.temoignages.map((temoignage) => temoignage.initiales)).toEqual([
        'Y',
        'Y',
        'N',
      ]);
    });
  });
});

describe('retour-images — service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getRetourImagesAdminState : défaut sans config = trailer null + liste', async () => {
    const store = fakeStore({
      findMediaConfig: vi.fn().mockResolvedValue(null),
      listTemoignages: vi.fn().mockResolvedValue([temoignageRecord()]),
    });
    const state = await getRetourImagesAdminState(SESSION, { store });
    expect(state.trailerUrl).toBeNull();
    expect(state.temoignages).toEqual([
      {
        id: 'temoignage-1',
        citation: 'Des sentiers magnifiques.',
        prenom: 'Yacine',
        editionReference: 'Trail 2026',
        ordre: 1,
        createdAt: '2026-10-22T09:00:00.000Z',
      },
    ]);
    expect(store.listTemoignages).toHaveBeenCalledWith('org-1');
  });

  it('setTrailerUrl : https écrit, vide retire (null), http refusé champ nommé', async () => {
    const store = fakeStore({
      setTrailerUrl: vi.fn().mockResolvedValue(
        mediaConfig({ trailerUrl: 'https://youtu.be/AbCdEf12345' }),
      ),
    });
    await setTrailerUrl(SESSION, { trailerUrl: 'https://youtu.be/AbCdEf12345' }, { store });
    expect(store.setTrailerUrl).toHaveBeenCalledWith({
      organisationId: 'org-1',
      trailerUrl: 'https://youtu.be/AbCdEf12345',
    });

    const storeRetrait = fakeStore({
      setTrailerUrl: vi.fn().mockResolvedValue(mediaConfig()),
    });
    await setTrailerUrl(SESSION, { trailerUrl: '  ' }, { store: storeRetrait });
    expect(storeRetrait.setTrailerUrl).toHaveBeenCalledWith({
      organisationId: 'org-1',
      trailerUrl: null,
    });

    await expect(
      setTrailerUrl(SESSION, { trailerUrl: 'http://video.dz/t.mp4' }, { store }),
    ).rejects.toBeInstanceOf(InvalidTrailerUrlError);
    await expect(setTrailerUrl(SESSION, { trailerUrl: 42 }, { store })).rejects.toBeInstanceOf(
      InvalidTrailerUrlError,
    );
    expect(store.setTrailerUrl).toHaveBeenCalledTimes(1);
  });

  it('setTrailerUrl : clé absente refusée — jamais un effacement silencieux', async () => {
    const store = fakeStore({ setTrailerUrl: vi.fn() });
    for (const corps of [{}, { autre: 'x' }, null]) {
      await expect(setTrailerUrl(SESSION, corps, { store })).rejects.toBeInstanceOf(
        InvalidTrailerUrlError,
      );
    }
    expect(store.setTrailerUrl).not.toHaveBeenCalled();
  });

  it('normalizeTrailerUrlInput : schéma en majuscules ramené en minuscules (CHECK SQL ^https://)', () => {
    expect(normalizeTrailerUrlInput({ trailerUrl: 'HTTPS://Video.dz/T.mp4' })).toEqual({
      trailerUrl: 'https://Video.dz/T.mp4',
    });
  });

  it('createTemoignage : champs invalides → erreur nommée, sinon écrit avec ordre', async () => {
    const store = fakeStore({
      createTemoignage: vi.fn().mockResolvedValue(temoignageRecord()),
    });
    await expect(
      createTemoignage(SESSION, { citation: '   ', prenom: '', editionReference: '' }, { store }),
    ).rejects.toBeInstanceOf(InvalidTemoignageFieldsError);
    expect(store.createTemoignage).not.toHaveBeenCalled();

    await createTemoignage(
      SESSION,
      { citation: 'Super course.', prenom: 'Yacine', editionReference: 'Trail 2026', ordre: 2 },
      { store },
    );
    expect(store.createTemoignage).toHaveBeenCalledWith({
      organisationId: 'org-1',
      citation: 'Super course.',
      prenom: 'Yacine',
      editionReference: 'Trail 2026',
      ordre: 2,
    });
  });

  it('createTemoignage : ordre non-entier refusé champ nommé, non-chaîne refusée', async () => {
    const store = fakeStore({
      createTemoignage: vi.fn().mockResolvedValue(temoignageRecord()),
    });
    await expect(
      createTemoignage(
        SESSION,
        { citation: 'x', prenom: 'Yacine', editionReference: 'Trail 2026', ordre: 'premier' },
        { store },
      ),
    ).rejects.toBeInstanceOf(InvalidTemoignageFieldsError);
    await expect(
      createTemoignage(SESSION, { citation: 42, prenom: 'Yacine', editionReference: 'T' }, {
        store,
      }),
    ).rejects.toBeInstanceOf(InvalidTemoignageFieldsError);
    expect(store.createTemoignage).not.toHaveBeenCalled();
  });

  it('updateTemoignage : introuvable → NotFound, sinon fusion des champs fournis', async () => {
    const absent = fakeStore({ findTemoignageById: vi.fn().mockResolvedValue(null) });
    await expect(
      updateTemoignage(SESSION, 'absent', { citation: 'x' }, { store: absent }),
    ).rejects.toBeInstanceOf(TemoignageNotFoundError);

    const store = fakeStore({
      findTemoignageById: vi.fn().mockResolvedValue(
        temoignageRecord({ citation: 'Ancienne', prenom: 'Yacine', ordre: 4 }),
      ),
      updateTemoignage: vi.fn().mockResolvedValue(temoignageRecord({ citation: 'Nouvelle' })),
    });
    await updateTemoignage(SESSION, 'temoignage-1', { citation: 'Nouvelle' }, { store });
    // citation fournie, le reste hérité — jamais d'écrasement silencieux.
    expect(store.updateTemoignage).toHaveBeenCalledWith('temoignage-1', {
      organisationId: 'org-1',
      citation: 'Nouvelle',
      prenom: 'Yacine',
      editionReference: 'Trail 2026',
      ordre: 4,
    });
  });

  it('updateTemoignage : citation non-chaîne (ex. 42) refusée champ nommé', async () => {
    const store = fakeStore({
      findTemoignageById: vi.fn().mockResolvedValue(temoignageRecord()),
    });
    await expect(
      updateTemoignage(SESSION, 'temoignage-1', { citation: 42 }, { store }),
    ).rejects.toBeInstanceOf(InvalidTemoignageFieldsError);
    expect(store.updateTemoignage).not.toHaveBeenCalled();
  });

  it('deleteTemoignage : booléen du store mappé en NotFound', async () => {
    const ok = fakeStore({ deleteTemoignage: vi.fn().mockResolvedValue(true) });
    await expect(deleteTemoignage(SESSION, 'temoignage-1', { store: ok })).resolves.toEqual({
      ok: true,
    });
    const absent = fakeStore({ deleteTemoignage: vi.fn().mockResolvedValue(false) });
    await expect(
      deleteTemoignage(SESSION, 'temoignage-1', { store: absent }),
    ).rejects.toBeInstanceOf(TemoignageNotFoundError);
  });

  it('getRetourImagesPage : base indisponible → page vide (jamais de crash)', async () => {
    const store = fakeStore({
      readDefaultOrgRetourImages: vi.fn().mockRejectedValue(new DbUnavailableError()),
    });
    await expect(getRetourImagesPage({ store })).resolves.toEqual({
      trailer: null,
      temoignages: [],
    });
  });

  it('getRetourImagesPage : erreur de code repropagée (un bug doit éclater)', async () => {
    const store = fakeStore({
      readDefaultOrgRetourImages: vi.fn().mockRejectedValue(new Error('boom')),
    });
    await expect(getRetourImagesPage({ store })).rejects.toThrow('boom');
  });

  it('getRetourImagesPage : résolution du rendu depuis la lecture publique', async () => {
    const store = fakeStore({
      readDefaultOrgRetourImages: vi.fn().mockResolvedValue({
        trailerUrl: 'https://media.dz/trailer.mp4',
        temoignages: [temoignageRecord()],
      }),
    });
    await expect(getRetourImagesPage({ store })).resolves.toEqual({
      trailer: { kind: 'video', url: 'https://media.dz/trailer.mp4' },
      temoignages: [
        {
          id: 'temoignage-1',
          citation: 'Des sentiers magnifiques.',
          prenom: 'Yacine',
          editionReference: 'Trail 2026',
          initiales: 'Y',
        },
      ],
    });
  });
});

describe('retour-images — enveloppes d’erreur admin', () => {
  it('champs invalides : 400 avec fields nommés', () => {
    const apiError = toRetourImagesApiError(
      new InvalidTemoignageFieldsError({ citation: 'La citation est obligatoire.' }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.citation).toContain('obligatoire');
    expect(apiError.envelope.error.code).toBe('admin.retour-images.invalid_fields');
  });

  it('trailer invalide : 400 avec field trailerUrl', () => {
    const apiError = toRetourImagesApiError(
      new InvalidTrailerUrlError({ trailerUrl: 'L’adresse de la vidéo doit commencer par https://.' }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.trailerUrl).toContain('https://');
    expect(apiError.envelope.error.code).toBe('admin.retour-images.invalid_trailer_url');
  });

  it('introuvable : 404, limite : 400', () => {
    expect(toRetourImagesApiError(new TemoignageNotFoundError()).status).toBe(404);
    const limite = toRetourImagesApiError(new TemoignagesLimitError(6));
    expect(limite.status).toBe(400);
    expect(limite.envelope.error.message).toContain('6');
  });

  it('base indisponible : 503, erreur inconnue : 500 sans fuite', () => {
    expect(toRetourImagesApiError(new DbUnavailableError()).status).toBe(503);
    const interne = toRetourImagesApiError(new Error('boom'));
    expect(interne.status).toBe(500);
    expect(interne.envelope.error.message).not.toContain('boom');
  });
});
