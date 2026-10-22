import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import { NoEditionError, DossardsEpuisesError, toAdminApiError } from './errors';
import { attribuerDossards } from './service';
import { assertCapaciteDossards, type InscriptionsStore } from './store';

// Story 3.4 — service d'attribution des dossards : délégation au store avec
// l'édition courante, garde « aucune édition », plafond 1–9999 défendu AVANT
// écriture (enveloppe claire, jamais un CHECK SQL brut en 500). Les libellés
// du résultat vivent dans lib/attribution-dossards (client-safe).

const SESSION: SessionRecord = {
  accountId: 'account-admin',
  organisationId: '5f0d0a30-93a1-4b0f-8c0a-2f2b64f2a001',
  email: 'organisateur@exemple.dz',
  role: 'organisateur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const EDITION = {
  id: 'edition-1',
  organisationId: SESSION.organisationId,
  slug: '2027',
  nom: 'Édition 2027',
  dateCourse: '2027-03-26',
  registrationClosesAt: new Date('2027-03-16T22:59:59.000Z'),
};

function buildStore(
  resultat: { attribues: number; premier: number | null; dernier: number | null },
): InscriptionsStore & { attribuerDossards: ReturnType<typeof vi.fn> } {
  const store = {
    findCurrentEdition: vi.fn(async () => EDITION),
    attribuerDossards: vi.fn(async () => resultat),
  };
  return store as unknown as InscriptionsStore & {
    attribuerDossards: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attribuerDossards — service avec store stubbé', () => {
  it('délègue au store avec l’édition courante de l’organisation', async () => {
    const store = buildStore({ attribues: 12, premier: 101, dernier: 112 });
    const resultat = await attribuerDossards(SESSION, { store });
    expect(store.attribuerDossards).toHaveBeenCalledWith({
      organisationId: SESSION.organisationId,
      editionId: 'edition-1',
    });
    expect(resultat).toEqual({ attribues: 12, premier: 101, dernier: 112 });
  });

  it('aucune édition : NoEditionError (503 admin.no_edition via le mapper)', async () => {
    const store = {
      findCurrentEdition: vi.fn(async () => null),
      attribuerDossards: vi.fn(),
    } as unknown as InscriptionsStore & { attribuerDossards: ReturnType<typeof vi.fn> };
    await expect(attribuerDossards(SESSION, { store })).rejects.toBeInstanceOf(NoEditionError);
    expect(store.attribuerDossards).not.toHaveBeenCalled();
  });

  it('édition épuisée : DossardsEpuisesError remonte, mappée en 409 admin.dossards_epuises', async () => {
    // Fixture « max à 9998 » : le lot suivant (2 coureurs) déborde le plafond.
    const store = {
      findCurrentEdition: vi.fn(async () => EDITION),
      attribuerDossards: vi.fn(async () => {
        assertCapaciteDossards(9998, 2);
        throw new Error('inatteint');
      }),
    } as unknown as InscriptionsStore;
    await expect(attribuerDossards(SESSION, { store })).rejects.toBeInstanceOf(
      DossardsEpuisesError,
    );
    const apiError = toAdminApiError(new DossardsEpuisesError());
    expect(apiError.status).toBe(409);
    expect(apiError.envelope.error.code).toBe('admin.dossards_epuises');
    expect(apiError.envelope.error.message).toContain('9999');
  });
});

describe('assertCapaciteDossards — plafond du lot (pure)', () => {
  it('base 9998 + 1 coureur : passe (dernier numéro 9999)', () => {
    expect(() => assertCapaciteDossards(9998, 1)).not.toThrow();
  });

  it('base 9998 + 2 coureurs : DossardsEpuisesError (le lot entier échoue)', () => {
    expect(() => assertCapaciteDossards(9998, 2)).toThrowError(DossardsEpuisesError);
  });

  it('édition neuve à plat (base 0, 9999 coureurs) : passe ; 1 de plus : échoue', () => {
    expect(() => assertCapaciteDossards(0, 9999)).not.toThrow();
    expect(() => assertCapaciteDossards(0, 10000)).toThrowError(DossardsEpuisesError);
    expect(() => assertCapaciteDossards(9999, 1)).toThrowError(DossardsEpuisesError);
  });
});
