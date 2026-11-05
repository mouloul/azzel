import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from '@/modules/iam/errors';
import type { SessionRecord } from '@/modules/iam/store';

import { NoEditionError } from './errors';
import { obtenirEdossard } from './service';
import type { EditionRecord, EdossardCoureurData, InscriptionsStore } from './store';

// Story 4.1 — tests unitaires du service e-dossard : assemblage de l'état
// (jeton + identité + édition), garde NoEditionError, null quand le dossier
// n'est pas validé. La création paresseuse/atomique du jeton vit dans le
// store — prouvée en intégration (edossard.integration.test.ts).

const session: SessionRecord = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const EDITION: EditionRecord = {
  id: 'edition-1',
  organisationId: 'org-1',
  slug: '2027',
  nom: 'Édition 2027',
  dateCourse: '2027-03-26',
  registrationClosesAt: new Date('2100-01-01T00:00:00.000Z'),
  capacite: 600,
  seuilAffichagePlaces: 200,
  capaciteHebergement: 200,
  prixDossardDa: 2000,
  prixHebergementDa: 1500,
  delaiPreuveJours: 2,
};

const DONNEES: EdossardCoureurData = {
  jeton: 'AbCdEf0123456789-_XyZa',
  dossard: 12,
  prenom: 'Yani',
  nom: 'Ulahianne',
  epreuveNom: 'La Longue — 35 km',
};

function buildStore(scenario: {
  edition?: EditionRecord | null;
  donnees?: EdossardCoureurData | null;
} = {}): InscriptionsStore & {
  obtenirOuCreerJetonEdossard: ReturnType<typeof vi.fn>;
  findCurrentEdition: ReturnType<typeof vi.fn>;
} {
  const store = {
    findCurrentEdition: vi.fn(async () =>
      scenario.edition !== undefined ? scenario.edition : EDITION,
    ),
    listEpreuves: vi.fn(async () => []),
    findDocuments: vi.fn(async () => []),
    findCoureurByAccount: vi.fn(async () => null),
    findActivePreuveByAccount: vi.fn(async () => null),
    upsertCoureur: vi.fn(),
    acceptDocuments: vi.fn(),
    savePreuve: vi.fn(),
    decideDossier: vi.fn(),
    listCoureurs: vi.fn(),
    findDossierDetail: vi.fn(),
    findPreuveByIdForOrganisation: vi.fn(),
    obtenirOuCreerJetonEdossard: vi.fn(async () =>
      scenario.donnees !== undefined ? scenario.donnees : DONNEES,
    ),
  };
  return store as unknown as InscriptionsStore & {
    obtenirOuCreerJetonEdossard: ReturnType<typeof vi.fn>;
    findCurrentEdition: ReturnType<typeof vi.fn>;
  };
}

describe('obtenirEdossard — assemblage de l’état e-dossard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('coureur validé : état complet (jeton, dossard, identité, épreuve, édition)', async () => {
    const store = buildStore();
    const etat = await obtenirEdossard(session, { store });
    expect(etat).toEqual({
      jeton: 'AbCdEf0123456789-_XyZa',
      dossard: 12,
      prenom: 'Yani',
      nom: 'Ulahianne',
      epreuveNom: 'La Longue — 35 km',
      editionNom: 'Édition 2027',
    });
    expect(store.obtenirOuCreerJetonEdossard).toHaveBeenCalledWith({
      organisationId: 'org-1',
      accountId: 'account-1',
      editionId: 'edition-1',
    });
  });

  it('validé non numéroté : dossard null conservé (le QR existe dès consultation)', async () => {
    const store = buildStore({
      donnees: { ...DONNEES, dossard: null },
    });
    const etat = await obtenirEdossard(session, { store });
    expect(etat).not.toBeNull();
    expect(etat?.dossard).toBeNull();
  });

  it('dossier non validé (ou sans coureur) : null — la page affichera l’attente', async () => {
    const store = buildStore({ donnees: null });
    await expect(obtenirEdossard(session, { store })).resolves.toBeNull();
  });

  it('aucune édition : NoEditionError (même garde que l’attribution des dossards)', async () => {
    const store = buildStore({ edition: null });
    await expect(obtenirEdossard(session, { store })).rejects.toBeInstanceOf(NoEditionError);
  });

  it('base indisponible : DbUnavailableError remonte (page → enveloppe 503)', async () => {
    const store = buildStore();
    store.findCurrentEdition.mockRejectedValue(new DbUnavailableError());
    await expect(obtenirEdossard(session, { store })).rejects.toBeInstanceOf(DbUnavailableError);
  });
});
