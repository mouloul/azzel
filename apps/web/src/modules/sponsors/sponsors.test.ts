import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SPONSOR_MODE,
  MAX_EMPLOCHEMENTS_VITRINE,
  MAX_SPONSOR_NAME_LENGTH,
  isHttpUrl,
  normalizeSponsorInput,
  parseSponsorMode,
  resolvePartenaires,
  sponsorTypeErrors,
  validateSponsorInput,
  type ResolvableSponsor,
} from './domain';
import {
  InvalidSponsorFieldsError,
  SponsorModeInvalidError,
  SponsorNotFoundError,
  toSponsorsApiError,
} from './errors';
import {
  createSponsor,
  deleteSponsor,
  getPartenairesSection,
  getSponsorsAdminState,
  setSponsorMode,
  updateSponsor,
} from './service';
import { DbUnavailableError } from '@/modules/iam/errors';
import type { SessionRecord } from '@/modules/iam/store';
import type { SponsorsStore, SponsorRecord } from './store';

const SESSION: SessionRecord = {
  accountId: 'account-org',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

function record(overrides: Partial<SponsorRecord> = {}): SponsorRecord {
  return {
    id: 'sponsor-1',
    organisationId: 'org-1',
    name: 'Ifri',
    url: null,
    logoUrl: null,
    isSignature: false,
    createdAt: new Date('2026-10-21T09:00:00.000Z'),
    ...overrides,
  };
}

function resolvable(overrides: Partial<ResolvableSponsor> = {}): ResolvableSponsor {
  return {
    id: 's1',
    name: 'Ifri',
    url: null,
    logoUrl: null,
    isSignature: false,
    ...overrides,
  };
}

function fakeStore(overrides: Partial<SponsorsStore> = {}): SponsorsStore {
  return {
    listSponsors: vi.fn(),
    findSponsorById: vi.fn(),
    createSponsor: vi.fn(),
    updateSponsor: vi.fn(),
    deleteSponsor: vi.fn(),
    findConfig: vi.fn(),
    setConfig: vi.fn(),
    readDefaultOrgPartenaires: vi.fn(),
    ...overrides,
  };
}

describe('sponsors — domaine', () => {
  it('isHttpUrl : http/https avec hôte acceptés, tout le reste refusé', () => {
    expect(isHttpUrl('https://ifri.dz')).toBe(true);
    expect(isHttpUrl('http://exemple.com/logo.png')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('ifri.dz')).toBe(false);
    expect(isHttpUrl('ftp://ifri.dz')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl('https://')).toBe(false);
  });

  it('parseSponsorMode : A/B acceptés, tout le reste null', () => {
    expect(parseSponsorMode('A')).toBe('A');
    expect(parseSponsorMode('B')).toBe('B');
    expect(parseSponsorMode('a')).toBeNull();
    expect(parseSponsorMode('C')).toBeNull();
    expect(parseSponsorMode(null)).toBeNull();
    expect(parseSponsorMode({ mode: 'A' })).toBeNull();
  });

  it('normalizeSponsorInput : trim, vide → null, non-chaîne ignorée', () => {
    expect(
      normalizeSponsorInput({ name: '  Ifri  ', url: '  ', logoUrl: ' https://x.dz/l.png ' }),
    ).toEqual({ name: 'Ifri', url: null, logoUrl: 'https://x.dz/l.png' });
    expect(normalizeSponsorInput({ url: 42 })).toEqual({ name: '', url: null, logoUrl: null });
    expect(normalizeSponsorInput(null)).toEqual({ name: '', url: null, logoUrl: null });
  });

  it('validation : nom requis, ≤ 80 caractères, url/logo http(s) si fournis', () => {
    expect(validateSponsorInput({ name: 'Ifri', url: null, logoUrl: null })).toEqual({});
    expect(validateSponsorInput({ name: '', url: null, logoUrl: null }).name).toBe(
      'Le nom du sponsor est obligatoire.',
    );
    expect(
      validateSponsorInput({ name: 'x'.repeat(MAX_SPONSOR_NAME_LENGTH + 1), url: null, logoUrl: null }).name,
    ).toContain('80 caractères maximum');
    expect(
      validateSponsorInput({ name: 'Ifri', url: 'ifri.dz', logoUrl: null }).url,
    ).toContain('http');
    expect(
      validateSponsorInput({ name: 'Ifri', url: null, logoUrl: 'javascript:x' }).logoUrl,
    ).toContain('http');
    expect(validateSponsorInput({ name: 'Ifri', url: 'http://ifri.dz', logoUrl: 'https://ifri.dz/l.png' })).toEqual({});
  });

  it('validation : url/logo_url plafonnées à 2048 caractères côté serveur', () => {
    const longue = `https://exemple.dz/${'a'.repeat(2100)}`;
    expect(
      validateSponsorInput({ name: 'Ifri', url: longue, logoUrl: null }).url,
    ).toContain('2048 caractères maximum');
    expect(
      validateSponsorInput({ name: 'Ifri', url: null, logoUrl: longue }).logoUrl,
    ).toContain('2048 caractères maximum');
  });

  it('types bruts : url/logo/name non-chaîne (ex. 42) refusés champ nommé', () => {
    expect(sponsorTypeErrors({ url: 42 }).url).toContain('texte');
    expect(sponsorTypeErrors({ logoUrl: [] }).logoUrl).toContain('texte');
    expect(sponsorTypeErrors({ name: 42 }).name).toContain('texte');
    expect(sponsorTypeErrors({ name: 'Ifri', url: null, logoUrl: 'https://x.dz' })).toEqual({});
    expect(sponsorTypeErrors('pas un objet')).toEqual({});
  });

  describe('resolvePartenaires — résolution du rendu', () => {
    it('aucun sponsor : null, quelle que soit l’option (section absente)', () => {
      expect(resolvePartenaires('A', [])).toBeNull();
      expect(resolvePartenaires('B', [])).toBeNull();
    });

    it('option A + sponsor signature : l’emplacement signature est le sponsor marqué', () => {
      const signature = resolvable({ id: 's2', name: 'Deuxième', isSignature: true });
      const view = resolvePartenaires('A', [resolvable({ id: 's1', name: 'Premier' }), signature]);
      expect(view).toEqual({
        mode: 'A',
        signature: { id: 's2', nom: 'Deuxième', url: null, logoUrl: null },
        sponsors: [{ id: 's2', nom: 'Deuxième', url: null, logoUrl: null }],
      });
    });

    it('option A sans flag : le premier sponsor devient la signature effective', () => {
      const view = resolvePartenaires('A', [
        resolvable({ id: 's1', name: 'Premier' }),
        resolvable({ id: 's2', name: 'Deuxième' }),
      ]);
      expect(view?.signature?.nom).toBe('Premier');
      expect(view?.sponsors).toHaveLength(1);
    });

    it('option B : grille équivalente dans l’ordre de création, signature ignorée', () => {
      const view = resolvePartenaires('B', [
        resolvable({ id: 's1', name: 'Premier' }),
        resolvable({ id: 's2', name: 'Deuxième', isSignature: true }),
        resolvable({ id: 's3', name: 'Troisième' }),
      ]);
      expect(view?.mode).toBe('B');
      expect(view?.signature).toBeNull();
      expect(view?.sponsors.map((sponsor) => sponsor.nom)).toEqual([
        'Premier',
        'Deuxième',
        'Troisième',
      ]);
    });

    it('option B : rendu plafonné à 12 emplacements, ordre de création respecté', () => {
      const nombreux = Array.from({ length: 15 }, (_, i) =>
        resolvable({ id: `s${i}`, name: `Sponsor ${i + 1}` }),
      );
      const view = resolvePartenaires('B', nombreux);
      expect(view?.sponsors).toHaveLength(MAX_EMPLOCHEMENTS_VITRINE);
      expect(view?.sponsors[0]?.nom).toBe('Sponsor 1');
      expect(view?.sponsors[11]?.nom).toBe('Sponsor 12');
    });
  });
});

describe('sponsors — service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSponsorsAdminState : mode par défaut A sans ligne de config', async () => {
    const store = fakeStore({
      findConfig: vi.fn().mockResolvedValue(null),
      listSponsors: vi.fn().mockResolvedValue([record()]),
    });
    const state = await getSponsorsAdminState(SESSION, { store });
    expect(state.mode).toBe(DEFAULT_SPONSOR_MODE);
    expect(state.sponsors).toEqual([
      {
        id: 'sponsor-1',
        nom: 'Ifri',
        url: null,
        logoUrl: null,
        signature: false,
        createdAt: '2026-10-21T09:00:00.000Z',
      },
    ]);
    expect(store.listSponsors).toHaveBeenCalledWith('org-1');
  });

  it('createSponsor : champs invalides → InvalidSponsorFieldsError nommé (nom, url)', async () => {
    const store = fakeStore({
      createSponsor: vi.fn().mockResolvedValue(record()),
    });
    await expect(
      createSponsor(SESSION, { name: '   ', url: 'pas-une-url' }, { store }),
    ).rejects.toBeInstanceOf(InvalidSponsorFieldsError);
    await expect(createSponsor(SESSION, { name: 'Ifri' }, { store })).resolves.toMatchObject({
      nom: 'Ifri',
    });
    expect(store.createSponsor).toHaveBeenCalledWith({
      organisationId: 'org-1',
      name: 'Ifri',
      url: null,
      logoUrl: null,
      isSignature: false,
    });
  });

  it('createSponsor : flag signature transmis quand fourni', async () => {
    const store = fakeStore({
      createSponsor: vi.fn().mockResolvedValue(record({ isSignature: true })),
    });
    await createSponsor(SESSION, { name: 'Ifri', signature: true }, { store });
    expect(store.createSponsor).toHaveBeenCalledWith(
      expect.objectContaining({ isSignature: true }),
    );
  });

  it('updateSponsor : introuvable → SponsorNotFoundError, sinon fusion des champs fournis', async () => {
    const absent = fakeStore({ findSponsorById: vi.fn().mockResolvedValue(null) });
    await expect(
      updateSponsor(SESSION, 'absent', { name: 'X' }, { store: absent }),
    ).rejects.toBeInstanceOf(SponsorNotFoundError);

    const store = fakeStore({
      findSponsorById: vi.fn().mockResolvedValue(
        record({ name: 'Ancien', url: 'https://ancien.dz', isSignature: true }),
      ),
      updateSponsor: vi.fn().mockResolvedValue(record({ name: 'Ifri' })),
    });
    await updateSponsor(SESSION, 'sponsor-1', { name: 'Ifri' }, { store });
    // name fourni, url/logoUrl hérités, signature conservée (absente du corps)
    expect(store.updateSponsor).toHaveBeenCalledWith('sponsor-1', {
      organisationId: 'org-1',
      name: 'Ifri',
      url: 'https://ancien.dz',
      logoUrl: null,
      isSignature: true,
    });
  });

  it('updateSponsor : url/logoUrl non-chaîne (ex. 42) refusée champ nommé — jamais d’écrasement silencieux', async () => {
    const store = fakeStore({
      findSponsorById: vi.fn().mockResolvedValue(
        record({ name: 'Ancien', url: 'https://ancien.dz', isSignature: true }),
      ),
    });
    await expect(
      updateSponsor(SESSION, 'sponsor-1', { url: 42 }, { store }),
    ).rejects.toBeInstanceOf(InvalidSponsorFieldsError);
    await expect(
      updateSponsor(SESSION, 'sponsor-1', { logoUrl: ['x'] }, { store }),
    ).rejects.toBeInstanceOf(InvalidSponsorFieldsError);
    expect(store.updateSponsor).not.toHaveBeenCalled();
  });

  it('updateSponsor : signature explicitement false l’ retire, clé absente la préserve', async () => {
    const store = fakeStore({
      findSponsorById: vi
        .fn()
        .mockResolvedValue(record({ isSignature: true })),
      updateSponsor: vi.fn().mockResolvedValue(record({ isSignature: false })),
    });
    await updateSponsor(SESSION, 'sponsor-1', { signature: false }, { store });
    expect(store.updateSponsor).toHaveBeenCalledWith(
      'sponsor-1',
      expect.objectContaining({ isSignature: false }),
    );
  });

  it('updateSponsor : signature mal typée refusée champ nommé, jamais lue comme false', async () => {
    const store = fakeStore({
      findSponsorById: vi.fn().mockResolvedValue(record({ isSignature: true })),
      updateSponsor: vi.fn(),
    });
    for (const signature of ['true', 1, {}]) {
      const erreur = await updateSponsor(SESSION, 'sponsor-1', { signature }, { store }).catch(
        (e: unknown) => e,
      );
      expect(erreur).toBeInstanceOf(InvalidSponsorFieldsError);
      expect((erreur as InvalidSponsorFieldsError).fields).toMatchObject({
        signature: expect.any(String),
      });
    }
    expect(store.updateSponsor).not.toHaveBeenCalled();
  });

  it('createSponsor : valeurs non-chaîne refusées champ nommé', async () => {
    const store = fakeStore({ createSponsor: vi.fn().mockResolvedValue(record()) });
    await expect(
      createSponsor(SESSION, { name: 'Ifri', url: 42 }, { store }),
    ).rejects.toBeInstanceOf(InvalidSponsorFieldsError);
    await expect(
      createSponsor(SESSION, { name: 42 }, { store }),
    ).rejects.toBeInstanceOf(InvalidSponsorFieldsError);
    expect(store.createSponsor).not.toHaveBeenCalled();
  });

  it('deleteSponsor : booléen du store mappé en NotFound', async () => {
    const ok = fakeStore({ deleteSponsor: vi.fn().mockResolvedValue(true) });
    await expect(deleteSponsor(SESSION, 'sponsor-1', { store: ok })).resolves.toEqual({ ok: true });
    const absent = fakeStore({ deleteSponsor: vi.fn().mockResolvedValue(false) });
    await expect(deleteSponsor(SESSION, 'sponsor-1', { store: absent })).rejects.toBeInstanceOf(
      SponsorNotFoundError,
    );
  });

  it('setSponsorMode : mode invalide refusé, mode valide écrit', async () => {
    const store = fakeStore({
      setConfig: vi
        .fn()
        .mockResolvedValue({ organisationId: 'org-1', mode: 'B', updatedAt: new Date('2026-10-21T10:00:00Z') }),
    });
    await expect(setSponsorMode(SESSION, { mode: 'C' }, { store })).rejects.toBeInstanceOf(
      SponsorModeInvalidError,
    );
    await expect(setSponsorMode(SESSION, { mode: 'B' }, { store })).resolves.toEqual({
      mode: 'B',
      updatedAt: '2026-10-21T10:00:00.000Z',
    });
  });

  it('getPartenairesSection : base indisponible → null (la vitrine ne casse jamais)', async () => {
    const store = fakeStore({
      readDefaultOrgPartenaires: vi.fn().mockRejectedValue(new DbUnavailableError()),
    });
    await expect(getPartenairesSection({ store })).resolves.toBeNull();
  });

  it('getPartenairesSection : un bug de code éclate au lieu de masquer la section', async () => {
    const store = fakeStore({
      readDefaultOrgPartenaires: vi.fn().mockRejectedValue(new TypeError('bug')),
    });
    await expect(getPartenairesSection({ store })).rejects.toBeInstanceOf(TypeError);
  });

  it('getPartenairesSection : table vide → null, sinon résolution du mode', async () => {
    const vide = fakeStore({
      readDefaultOrgPartenaires: vi.fn().mockResolvedValue({ mode: 'A', sponsors: [] }),
    });
    await expect(getPartenairesSection({ store: vide })).resolves.toBeNull();

    const pleine = fakeStore({
      readDefaultOrgPartenaires: vi.fn().mockResolvedValue({
        mode: 'A',
        sponsors: [record()],
      }),
    });
    await expect(getPartenairesSection({ store: pleine })).resolves.toMatchObject({
      mode: 'A',
      signature: { nom: 'Ifri' },
    });
  });
});

describe('sponsors — enveloppes d’erreur admin', () => {
  it('champs invalides : 400 avec fields nommés', () => {
    const apiError = toSponsorsApiError(
      new InvalidSponsorFieldsError({ name: 'Le nom du sponsor est obligatoire.' }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.name).toContain('obligatoire');
    expect(apiError.envelope.error.code).toBe('admin.sponsors.invalid_fields');
  });

  it('introuvable : 404 sans détail', () => {
    const apiError = toSponsorsApiError(new SponsorNotFoundError());
    expect(apiError.status).toBe(404);
    expect(apiError.envelope.error.code).toBe('admin.sponsors.not_found');
  });

  it('mode invalide : 400', () => {
    expect(toSponsorsApiError(new SponsorModeInvalidError()).envelope.error.code).toBe(
      'admin.sponsors.mode_invalid',
    );
  });

  it('base indisponible : 503, erreur inconnue : 500 sans fuite', () => {
    expect(toSponsorsApiError(new DbUnavailableError()).status).toBe(503);
    const interne = toSponsorsApiError(new Error('boom'));
    expect(interne.status).toBe(500);
    expect(interne.envelope.error.message).not.toContain('boom');
  });
});
