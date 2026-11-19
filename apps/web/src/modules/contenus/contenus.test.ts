import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BALISE_A_CONFIRMER,
  CONTENU_SLUGS,
  MAX_CORPS_LENGTH,
  MAX_GPX_URL_LENGTH,
  MAX_TITRE_LENGTH,
  PARCOURS_SLUGS,
  REGION_SLUGS,
  estBaliséÀConfirmer,
  isContenuSlug,
  isHttpsUrl,
  normalizeContenuInput,
  ordonnerParSlugs,
  splitParagraphes,
  validateContenuInput,
  contenuTypeErrors,
} from './domain';
import {
  ContenuConflitError,
  ContenuNotFoundError,
  EpreuveAbsenteError,
  InvalidContenuFieldsError,
  toContenusApiError,
} from './errors';
import {
  getContenu,
  getContenusAdminState,
  getParcoursPage,
  getRegionPage,
  updateContenu,
} from './service';
import { DbUnavailableError } from '@/modules/iam/errors';
import type { SessionRecord } from '@/modules/iam/store';
import type { ContenuRecord, ContenusStore, EpreuveParcoursRecord } from './store';

const SESSION: SessionRecord = {
  accountId: 'account-org',
  organisationId: 'org-1',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const UPDATED_AT = new Date('2026-10-22T09:00:00.000Z');
const UPDATED_AT_ISO = '2026-10-22T09:00:00.000Z';

function contenu(overrides: Partial<ContenuRecord> = {}): ContenuRecord {
  return {
    id: 'contenu-1',
    organisationId: 'org-1',
    slug: 'parcours-longue',
    titre: 'Trail long — 35 km',
    corps: `L’épreuve phare.\n\nDénivelé positif : ${BALISE_A_CONFIRMER}.`,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function epreuve(overrides: Partial<EpreuveParcoursRecord> = {}): EpreuveParcoursRecord {
  return {
    id: 'epreuve-1',
    slug: 'longue',
    nom: 'La Grande Boucle — 35 km',
    distanceKm: 35,
    gpxUrl: null,
    ...overrides,
  };
}

function fakeStore(overrides: Partial<ContenusStore> = {}): ContenusStore {
  return {
    listContenusBySlugs: vi.fn(),
    findContenuBySlug: vi.fn(),
    saveContenu: vi.fn(),
    listEpreuvesParcours: vi.fn(),
    readDefaultOrgPageParcours: vi.fn(),
    readDefaultOrgPageRegion: vi.fn(),
    ...overrides,
  };
}

describe('contenus — domaine', () => {
  it('isContenuSlug : les 7 slugs connus, tout le reste refusé', () => {
    expect(CONTENU_SLUGS).toEqual([
      'parcours-longue',
      'parcours-moyenne',
      'consignes-securite',
      'region',
      'hebergement',
      'restauration',
      'annexes',
    ]);
    for (const slug of CONTENU_SLUGS) {
      expect(isContenuSlug(slug)).toBe(true);
    }
    expect(isContenuSlug('parcours-courte')).toBe(false);
    expect(isContenuSlug('PARCOURS-LONGUE')).toBe(false);
    expect(isContenuSlug('')).toBe(false);
  });

  it('pages : PARCOURS_SLUGS (2 blocs) et REGION_SLUGS (5 blocs, consignes en dernier)', () => {
    expect(PARCOURS_SLUGS).toEqual(['parcours-longue', 'parcours-moyenne']);
    expect(REGION_SLUGS).toEqual([
      'region',
      'hebergement',
      'restauration',
      'annexes',
      'consignes-securite',
    ]);
  });

  it('isHttpsUrl : https uniquement — http, javascript:, texte nu refusés', () => {
    expect(isHttpsUrl('https://exemple.dz/trace.gpx')).toBe(true);
    expect(isHttpsUrl('http://exemple.dz/trace.gpx')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('exemple.dz/trace.gpx')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
  });

  it('normalizeContenuInput : schéma en majuscules ramené en minuscules (CHECK SQL ^https://)', () => {
    // new URL() accepte HTTPS://, la contrainte SQL est sensible à la casse :
    // sans normalisation, l'écriture finissait en 23514 → 500.
    expect(normalizeContenuInput({ titre: 'T', corps: 'C', gpxUrl: 'HTTPS://Files.dz/T.gpx' })).toEqual({
      titre: 'T',
      corps: 'C',
      gpxUrl: 'https://Files.dz/T.gpx',
    });
  });

  it('normalizeContenuInput : trim, vide → null pour gpxUrl, non-chaîne ignorée', () => {
    expect(
      normalizeContenuInput({ titre: '  Titre ', corps: ' Corps ', gpxUrl: '  ' }),
    ).toEqual({ titre: 'Titre', corps: 'Corps', gpxUrl: null });
    expect(
      normalizeContenuInput({ titre: 'T', corps: 'C', gpxUrl: ' https://x.dz/t.gpx ' }),
    ).toEqual({ titre: 'T', corps: 'C', gpxUrl: 'https://x.dz/t.gpx' });
    expect(normalizeContenuInput({ gpxUrl: 42 })).toEqual({
      titre: '',
      corps: '',
      gpxUrl: null,
    });
    expect(normalizeContenuInput(null)).toEqual({ titre: '', corps: '', gpxUrl: null });
  });

  it('validation : titre requis ≤ 120, corps requis ≤ 20 000, gpx https facultative', () => {
    expect(
      validateContenuInput({ titre: 'Titre', corps: 'Corps', gpxUrl: null }),
    ).toEqual({});
    expect(validateContenuInput({ titre: '', corps: 'C', gpxUrl: null }).titre).toContain(
      'obligatoire',
    );
    expect(
      validateContenuInput({ titre: 'x'.repeat(MAX_TITRE_LENGTH + 1), corps: 'C', gpxUrl: null })
        .titre,
    ).toContain('120 caractères maximum');
    expect(validateContenuInput({ titre: 'T', corps: '', gpxUrl: null }).corps).toContain(
      'obligatoire',
    );
    expect(
      validateContenuInput({ titre: 'T', corps: 'x'.repeat(MAX_CORPS_LENGTH + 1), gpxUrl: null })
        .corps,
    ).toContain('20000 caractères maximum');
    expect(
      validateContenuInput({ titre: 'T', corps: 'C', gpxUrl: 'http://x.dz/t.gpx' }).gpxUrl,
    ).toContain('https://');
    expect(
      validateContenuInput({ titre: 'T', corps: 'C', gpxUrl: `https://x.dz/${'a'.repeat(MAX_GPX_URL_LENGTH)}` })
        .gpxUrl,
    ).toContain('2048 caractères maximum');
  });

  it('types bruts : titre/corps/gpxUrl non-chaîne refusés champ nommé', () => {
    expect(contenuTypeErrors({ titre: 42 }).titre).toContain('texte');
    expect(contenuTypeErrors({ corps: ['x'] }).corps).toContain('texte');
    expect(contenuTypeErrors({ gpxUrl: {} }).gpxUrl).toContain('texte');
    expect(contenuTypeErrors({ titre: 'T', corps: 'C', gpxUrl: null })).toEqual({});
    expect(contenuTypeErrors('pas un objet')).toEqual({});
  });

  it('estBaliséÀConfirmer : détecte le balisage des seeds, insensible à la casse', () => {
    expect(estBaliséÀConfirmer(`Dénivelé : ${BALISE_A_CONFIRMER}.`)).toBe(true);
    expect(estBaliséÀConfirmer('Dénivelé : À CONFIRMER PAR LE COMITÉ.')).toBe(true);
    expect(estBaliséÀConfirmer('Dénivelé : 1 200 m.')).toBe(false);
  });

  it('splitParagraphes : paragraphes sur lignes vides, vides filtrés, sauts simples conservés', () => {
    expect(splitParagraphes('Un.\n\nDeux.\n\n\nTrois.')).toEqual(['Un.', 'Deux.', 'Trois.']);
    expect(splitParagraphes('  \n\n  Espacé.  \n\n\n')).toEqual(['Espacé.']);
    expect(splitParagraphes('Ligne A\nLigne B\n\nParagraphe 2')).toEqual([
      'Ligne A\nLigne B',
      'Paragraphe 2',
    ]);
    expect(splitParagraphes('')).toEqual([]);
  });

  it('ordonnerParSlugs : ordre de la liste de référence, inconnus en queue (tri stable)', () => {
    const items = [
      { slug: 'region', v: 1 },
      { slug: 'inconnu', v: 2 },
      { slug: 'parcours-longue', v: 3 },
      { slug: 'parcours-moyenne', v: 4 },
    ];
    expect(ordonnerParSlugs(items, PARCOURS_SLUGS).map((item) => item.slug)).toEqual([
      'parcours-longue',
      'parcours-moyenne',
      'region',
      'inconnu',
    ]);
    expect(ordonnerParSlugs([], REGION_SLUGS)).toEqual([]);
  });
});

describe('contenus — service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getContenusAdminState : blocs dans l’ordre canonique, épreuve attachée aux parcours, balise à confirmer', async () => {
    const longue = contenu();
    const region = contenu({ id: 'contenu-2', slug: 'region', titre: 'La région', corps: 'Stable.' });
    const store = fakeStore({
      listContenusBySlugs: vi.fn().mockResolvedValue([region, longue]),
      listEpreuvesParcours: vi
        .fn()
        .mockResolvedValue([epreuve(), epreuve({ id: 'e2', slug: 'moyenne', nom: 'La Boucle Moyenne — 12 km', distanceKm: 12 })]),
    });
    const state = await getContenusAdminState(SESSION, { store });
    expect(state.blocs.map((bloc) => bloc.slug)).toEqual(['parcours-longue', 'region']);
    expect(state.blocs[0]?.epreuve).toMatchObject({ slug: 'longue', distanceKm: 35 });
    expect(state.blocs[0]?.aConfirmer).toBe(true);
    expect(state.blocs[1]?.epreuve).toBeNull();
    expect(state.blocs[1]?.aConfirmer).toBe(false);
    expect(store.listContenusBySlugs).toHaveBeenCalledWith('org-1', CONTENU_SLUGS);
  });

  it('getContenu : slug inconnu ou bloc absent → ContenuNotFoundError', async () => {
    const store = fakeStore({ findContenuBySlug: vi.fn().mockResolvedValue(null) });
    await expect(getContenu(SESSION, 'inconnu', { store })).rejects.toBeInstanceOf(
      ContenuNotFoundError,
    );
    await expect(getContenu(SESSION, 'region', { store })).rejects.toBeInstanceOf(
      ContenuNotFoundError,
    );
  });

  it('updateContenu : updatedAt à jour → fusion acceptée, gpxUrl absente conservée', async () => {
    const store = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(contenu({ corps: 'Ancien corps.' })),
      saveContenu: vi.fn().mockResolvedValue({
        contenu: contenu({ titre: 'Trail long — 35 km', corps: 'Nouveau corps.' }),
        epreuve: null,
      }),
      listEpreuvesParcours: vi
        .fn()
        .mockResolvedValue([epreuve({ gpxUrl: 'https://exemple.dz/existant.gpx' })]),
    });
    const bloc = await updateContenu(
      SESSION,
      'parcours-longue',
      { corps: 'Nouveau corps.', updatedAt: UPDATED_AT_ISO },
      { store },
    );
    expect(store.saveContenu).toHaveBeenCalledWith({
      organisationId: 'org-1',
      slug: 'parcours-longue',
      titre: 'Trail long — 35 km',
      corps: 'Nouveau corps.',
      ancienUpdatedAt: UPDATED_AT,
      gpx: undefined,
    });
    expect(bloc.epreuve?.gpxUrl).toBe('https://exemple.dz/existant.gpx');
  });

  it('updateContenu : updatedAt absente, non-chaîne ou obsolète → 409 conflit, rien d’écrit', async () => {
    for (const updatedAt of [undefined, 42, '2026-10-21T09:00:00.000Z']) {
      const store = fakeStore({
        findContenuBySlug: vi.fn().mockResolvedValue(contenu()),
      });
      await expect(
        updateContenu(SESSION, 'parcours-longue', { titre: 'T', corps: 'C', updatedAt }, { store }),
      ).rejects.toBeInstanceOf(ContenuConflitError);
      expect(store.saveContenu).not.toHaveBeenCalled();
    }
  });

  it('updateContenu : course concurrente (store → null) → 409 conflit', async () => {
    const store = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(contenu()),
      saveContenu: vi.fn().mockResolvedValue(null),
    });
    await expect(
      updateContenu(
        SESSION,
        'parcours-longue',
        { titre: 'T', corps: 'C', updatedAt: UPDATED_AT_ISO },
        { store },
      ),
    ).rejects.toBeInstanceOf(ContenuConflitError);
  });

  it('updateContenu : bloc absent → création (upsert, aucune version requise)', async () => {
    const cree = contenu({ id: 'contenu-9', slug: 'region', titre: 'La région', corps: 'Texte.' });
    const store = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(null),
      saveContenu: vi.fn().mockResolvedValue({ contenu: cree, epreuve: null }),
    });
    const bloc = await updateContenu(
      SESSION,
      'region',
      { titre: 'La région', corps: 'Texte.' },
      { store },
    );
    expect(store.saveContenu).toHaveBeenCalledWith({
      organisationId: 'org-1',
      slug: 'region',
      titre: 'La région',
      corps: 'Texte.',
      ancienUpdatedAt: null,
      gpx: undefined,
    });
    expect(bloc.titre).toBe('La région');
  });

  it('updateContenu : gpxUrl fournie sur un bloc parcours → écrite (vide = effacée)', async () => {
    const store = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(contenu()),
      saveContenu: vi.fn().mockResolvedValue({
        contenu: contenu(),
        epreuve: epreuve({ gpxUrl: 'https://exemple.dz/longue.gpx' }),
      }),
    });
    await updateContenu(
      SESSION,
      'parcours-longue',
      { titre: 'Trail long — 35 km', corps: 'Corps.', gpxUrl: 'https://exemple.dz/longue.gpx', updatedAt: UPDATED_AT_ISO },
      { store },
    );
    expect(store.saveContenu).toHaveBeenCalledWith(
      expect.objectContaining({
        gpx: { epreuveSlug: 'longue', url: 'https://exemple.dz/longue.gpx' },
      }),
    );

    const efface = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(contenu()),
      saveContenu: vi.fn().mockResolvedValue({
        contenu: contenu(),
        epreuve: epreuve({ gpxUrl: null }),
      }),
    });
    await updateContenu(
      SESSION,
      'parcours-longue',
      { gpxUrl: '  ', updatedAt: UPDATED_AT_ISO },
      { store: efface },
    );
    expect(efface.saveContenu).toHaveBeenCalledWith(
      expect.objectContaining({ gpx: { epreuveSlug: 'longue', url: null } }),
    );
  });

  it('updateContenu : épreuve absente (gpx sans épreuve dans l’org) → EpreuveAbsenteError, pas un 500', async () => {
    const store = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(contenu()),
      saveContenu: vi.fn().mockRejectedValue(new EpreuveAbsenteError()),
    });
    await expect(
      updateContenu(
        SESSION,
        'parcours-longue',
        { titre: 'T', corps: 'C', gpxUrl: 'https://x.dz/t.gpx', updatedAt: UPDATED_AT_ISO },
        { store },
      ),
    ).rejects.toBeInstanceOf(EpreuveAbsenteError);
  });

  it('updateContenu : gpxUrl sur un bloc sans tracé → erreur champ nommé, rien d’écrit', async () => {
    const store = fakeStore({
      findContenuBySlug: vi.fn().mockResolvedValue(contenu({ slug: 'region' })),
    });
    await expect(
      updateContenu(SESSION, 'region', { gpxUrl: 'https://x.dz/t.gpx', updatedAt: UPDATED_AT_ISO }, { store }),
    ).rejects.toBeInstanceOf(InvalidContenuFieldsError);
    expect(store.saveContenu).not.toHaveBeenCalled();
  });

  it('updateContenu : champs invalides → InvalidContenuFieldsError nommés', async () => {
    const store = fakeStore({ findContenuBySlug: vi.fn().mockResolvedValue(contenu()) });
    const erreur = await updateContenu(
      SESSION,
      'parcours-longue',
      { titre: ' ', corps: '', updatedAt: UPDATED_AT_ISO },
      { store },
    ).catch((error: unknown) => error);
    expect(erreur).toBeInstanceOf(InvalidContenuFieldsError);
    expect((erreur as InvalidContenuFieldsError).fields.titre).toContain('obligatoire');
    expect((erreur as InvalidContenuFieldsError).fields.corps).toContain('obligatoire');
    await expect(
      updateContenu(
        SESSION,
        'parcours-longue',
        { titre: 'T', corps: 'C', gpxUrl: 'http://x.dz', updatedAt: UPDATED_AT_ISO },
        { store },
      ),
    ).rejects.toBeInstanceOf(InvalidContenuFieldsError);
  });

  it('updateContenu : gpxUrl non-chaîne (ex. 42) refusée champ nommé', async () => {
    const store = fakeStore({ findContenuBySlug: vi.fn().mockResolvedValue(contenu()) });
    await expect(
      updateContenu(
        SESSION,
        'parcours-longue',
        { titre: 'T', corps: 'C', gpxUrl: 42, updatedAt: UPDATED_AT_ISO },
        { store },
      ),
    ).rejects.toBeInstanceOf(InvalidContenuFieldsError);
    expect(store.saveContenu).not.toHaveBeenCalled();
  });

  it('updateContenu : slug inconnu → ContenuNotFoundError', async () => {
    const store = fakeStore();
    await expect(updateContenu(SESSION, 'annexes-x', {}, { store })).rejects.toBeInstanceOf(
      ContenuNotFoundError,
    );
    expect(store.saveContenu).not.toHaveBeenCalled();
  });

  it('pages publiques : base indisponible → blocs vides (la vitrine ne casse pas)', async () => {
    const store = fakeStore({
      readDefaultOrgPageParcours: vi.fn().mockRejectedValue(new DbUnavailableError()),
      readDefaultOrgPageRegion: vi.fn().mockRejectedValue(new DbUnavailableError()),
    });
    await expect(getParcoursPage({ store })).resolves.toEqual({ blocs: [] });
    await expect(getRegionPage({ store })).resolves.toEqual({ blocs: [] });
  });

  it('pages publiques : bug de code (autre erreur) → repropagé, pas de silence', async () => {
    const store = fakeStore({
      readDefaultOrgPageParcours: vi.fn().mockRejectedValue(new Error('boom')),
      readDefaultOrgPageRegion: vi.fn().mockRejectedValue(new TypeError('pas un objet')),
    });
    await expect(getParcoursPage({ store })).rejects.toThrow('boom');
    await expect(getRegionPage({ store })).rejects.toThrow('pas un objet');
  });

  it('getParcoursPage : blocs ordonnés avec épreuve associée (bloc sans épreuve → null)', async () => {
    const store = fakeStore({
      readDefaultOrgPageParcours: vi.fn().mockResolvedValue({
        contenus: [
          contenu({ slug: 'parcours-moyenne', titre: 'Moyenne' }),
          contenu({ slug: 'parcours-longue', titre: 'Longue' }),
        ],
        epreuves: [epreuve()],
      }),
    });
    const page = await getParcoursPage({ store });
    expect(page.blocs.map((bloc) => bloc.titre)).toEqual(['Longue', 'Moyenne']);
    expect(page.blocs[0]?.epreuve?.slug).toBe('longue');
    expect(page.blocs[1]?.epreuve).toBeNull();
  });
});

describe('contenus — enveloppes d’erreur admin', () => {
  it('champs invalides : 400 avec fields nommés', () => {
    const apiError = toContenusApiError(
      new InvalidContenuFieldsError({ titre: 'Le titre est obligatoire.' }),
    );
    expect(apiError.status).toBe(400);
    expect(apiError.fields?.titre).toContain('obligatoire');
    expect(apiError.envelope.error.code).toBe('admin.contenus.invalid_fields');
  });

  it('introuvable : 404 sans détail', () => {
    expect(toContenusApiError(new ContenuNotFoundError()).status).toBe(404);
    expect(toContenusApiError(new ContenuNotFoundError()).envelope.error.code).toBe(
      'admin.contenus.not_found',
    );
  });

  it('conflit d’édition : 409 admin.contenus.conflit avec action « Recharge la page »', () => {
    const apiError = toContenusApiError(new ContenuConflitError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.contenus.conflit');
    expect(apiError.envelope.error.action).toContain('Recharge la page');
  });

  it('épreuve absente : 400 admin.contenus.epreuve_absente (pas un 500)', () => {
    const apiError = toContenusApiError(new EpreuveAbsenteError());
    expect(apiError.status).toBe(400);
    expect(apiError.envelope.error.code).toBe('admin.contenus.epreuve_absente');
  });

  it('base indisponible : 503 admin.contenus.db_unavailable, erreur inconnue : 500 sans fuite', () => {
    expect(toContenusApiError(new DbUnavailableError()).status).toBe(503);
    expect(toContenusApiError(new DbUnavailableError()).envelope.error.code).toBe(
      'admin.contenus.db_unavailable',
    );
    const interne = toContenusApiError(new Error('boom'));
    expect(interne.status).toBe(500);
    expect(interne.envelope.error.message).not.toContain('boom');
  });
});
