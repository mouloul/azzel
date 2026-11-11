import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DbUnavailableError } from '@/modules/iam/errors';
import type { SessionRecord } from '@/modules/iam/store';

import {
  CHECKLIST_PREUVE_INDISPONIBLE,
  CHECKLIST_VALIDATION_APRES_PREUVE,
  CHECKLIST_VALIDATION_EN_ATTENTE,
  getChecklistState,
} from './service';
import type { CoureurRecord, EditionRecord, InscriptionsStore, PreuveRecord } from './store';

const RACE_DATE = '2027-03-26';

const session: SessionRecord = {
  accountId: 'account-1',
  organisationId: 'org-1',
  email: 'coureur@exemple.dz',
  role: 'coureur',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
};

const PREUVE: PreuveRecord = {
  id: 'preuve-1',
  organisationId: 'org-1',
  coureurId: 'coureur-1',
  storageKey: 'preuves/preuve-1.jpg',
  mime: 'image/jpeg',
  sizeBytes: 1234,
  sha256: 'abc',
  status: 'active',
  createdAt: new Date('2026-10-21T10:00:00.000Z'),
  numeroTransaction: null,
};

interface ChecklistScenario {
  edition?: Partial<EditionRecord> | null;
  coureur?: Partial<CoureurRecord> | null;
  preuve?: PreuveRecord | null;
}

function buildChecklistStore(scenario: ChecklistScenario = {}): InscriptionsStore & {
  findCurrentEdition: ReturnType<typeof vi.fn>;
  findActivePreuveByAccount: ReturnType<typeof vi.fn>;
  upsertCoureur: ReturnType<typeof vi.fn>;
  acceptDocuments: ReturnType<typeof vi.fn>;
  savePreuve: ReturnType<typeof vi.fn>;
  decideDossier: ReturnType<typeof vi.fn>;
} {
  const edition: EditionRecord | null =
    scenario.edition === null
      ? null
      : {
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
          delaiPreuveJours: 2,
          dateCoursePublique: false,
          ...(scenario.edition ?? {}),
        };
  const coureur: CoureurRecord | null =
    scenario.coureur === null
      ? null
      : {
          id: 'coureur-1',
          organisationId: 'org-1',
          accountId: session.accountId,
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
          ...(scenario.coureur ?? {}),
        };
  const store = {
    findCurrentEdition: vi.fn(async () => edition),
    listEpreuves: vi.fn(async () => []),
    findDocuments: vi.fn(async () => []),
    findCoureurByAccount: vi.fn(async () => coureur),
    findActivePreuveByAccount: vi.fn(async () => scenario.preuve ?? null),
    upsertCoureur: vi.fn(),
    acceptDocuments: vi.fn(),
    savePreuve: vi.fn(),
    decideDossier: vi.fn(),
    listCoureurs: vi.fn(),
    findDossierDetail: vi.fn(),
    findPreuveByIdForOrganisation: vi.fn(),
  };
  return store as unknown as InscriptionsStore & {
    findCurrentEdition: ReturnType<typeof vi.fn>;
    findActivePreuveByAccount: ReturnType<typeof vi.fn>;
    upsertCoureur: ReturnType<typeof vi.fn>;
    acceptDocuments: ReturnType<typeof vi.fn>;
    savePreuve: ReturnType<typeof vi.fn>;
    decideDossier: ReturnType<typeof vi.fn>;
  };
}

const ACCEPTATIONS_ACCEPTEES: Partial<CoureurRecord> = {
  dechargeAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
  dechargeVersion: 'v1',
  reglementAcceptedAt: new Date('2026-10-21T09:30:00.000Z'),
  reglementVersion: 'v1',
};

const FERMEES = { registrationClosesAt: new Date('2000-01-01T00:00:00.000Z') };

function piece(state: Awaited<ReturnType<typeof getChecklistState>>, id: string) {
  const found = state.pieces.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`pièce ${id} absente`);
  }
  return found;
}

describe('getChecklistState — consolidation des six pièces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dossier complet : six pièces faites, seule action « Modifier mon inscription »', async () => {
    const store = buildChecklistStore({
      coureur: { ...ACCEPTATIONS_ACCEPTEES, status: 'validé' },
      preuve: PREUVE,
    });
    const state = await getChecklistState(session, { store });
    expect(state.edition?.slug).toBe('2027');
    expect(state.pieces.map((entry) => entry.id)).toEqual([
      'email',
      'epreuve',
      'decharge',
      'reglement',
      'preuve',
      'validation',
    ]);
    expect(state.pieces.every((entry) => entry.fait)).toBe(true);
    expect(piece(state, 'epreuve').actionLabel).toBe('Modifier mon inscription');
    expect(piece(state, 'epreuve').actionHref).toBe('/inscription');
    for (const id of ['decharge', 'reglement', 'preuve', 'validation'] as const) {
      expect(piece(state, id).actionLabel, id).toBeUndefined();
      expect(piece(state, id).actionHref, id).toBeUndefined();
      expect(piece(state, id).motifRefus, id).toBeUndefined();
      expect(piece(state, id).texteSecondaire, id).toBeUndefined();
    }
  });

  it('dossier en constitution avec preuve : remplaçable, validation en attente, récap porté', async () => {
    const store = buildChecklistStore({
      coureur: ACCEPTATIONS_ACCEPTEES,
      preuve: PREUVE,
    });
    const state = await getChecklistState(session, { store });
    expect(state.pieces.filter((entry) => entry.fait)).toHaveLength(5);
    expect(piece(state, 'epreuve').actionLabel).toBe('Modifier mon inscription');
    expect(piece(state, 'preuve').fait).toBe(true);
    expect(piece(state, 'preuve').actionLabel).toBe('Remplacer ma preuve de paiement');
    expect(piece(state, 'preuve').actionHref).toBe('/preuve');
    const validation = piece(state, 'validation');
    expect(validation.fait).toBe(false);
    expect(validation.texteSecondaire).toBe(CHECKLIST_VALIDATION_EN_ATTENTE);
    expect(validation.actionLabel).toBeUndefined();
    expect(validation.motifRefus).toBeUndefined();
    expect(state.recap).toEqual({
      epreuve: 'La Longue — 35 km',
      distanceKm: 35,
      categorieAge: 'Senior (18–39 ans)',
      tshirt: 'M',
      contactUrgenceNom: 'Lounis Ulahianne',
      contactUrgenceTelephone: '0555010204',
      dateCourse: RACE_DATE,
      // Cachée par défaut : le public lit la saison, pas le jour.
      dateCourseLibelle: 'printemps 2027',
    });
  });

  it('preuve manquante sur dossier validé : 5/6, aucun lien mort vers /preuve', async () => {
    const store = buildChecklistStore({
      coureur: { ...ACCEPTATIONS_ACCEPTEES, status: 'validé' },
      preuve: null,
    });
    const state = await getChecklistState(session, { store });
    expect(state.pieces.filter((entry) => entry.fait)).toHaveLength(5);
    const preuve = piece(state, 'preuve');
    expect(preuve.fait).toBe(false);
    expect(preuve.actionLabel).toBeUndefined();
    expect(preuve.actionHref).toBeUndefined();
    expect(piece(state, 'validation').fait).toBe(true);
  });

  it('dossier refusé : motif + « Déposer une nouvelle preuve », preuve remplaçable', async () => {
    const store = buildChecklistStore({
      coureur: {
        ...ACCEPTATIONS_ACCEPTEES,
        status: 'refusé',
        refusalReason: 'reçu illisible',
      },
      preuve: PREUVE,
    });
    const state = await getChecklistState(session, { store });
    const validation = piece(state, 'validation');
    expect(validation.fait).toBe(false);
    expect(validation.motifRefus).toBe('reçu illisible');
    expect(validation.actionLabel).toBe('Déposer une nouvelle preuve');
    expect(validation.actionHref).toBe('/preuve');
    expect(validation.texteSecondaire).toBeUndefined();
    const preuve = piece(state, 'preuve');
    expect(preuve.fait).toBe(true);
    expect(preuve.actionLabel).toBe('Remplacer ma preuve de paiement');
    expect(preuve.actionHref).toBe('/preuve');
  });

  it('non inscrit : email vert, actions directes, validation neutre, récap absent', async () => {
    const store = buildChecklistStore({ coureur: null, preuve: null });
    const state = await getChecklistState(session, { store });
    expect(piece(state, 'email').fait).toBe(true);
    expect(state.pieces.filter((entry) => entry.fait)).toHaveLength(1);
    expect(state.recap).toBeNull();

    const epreuve = piece(state, 'epreuve');
    expect(epreuve.fait).toBe(false);
    expect(epreuve.actionLabel).toBe('M’inscrire à l’édition 2027');
    expect(epreuve.actionHref).toBe('/inscription');

    expect(piece(state, 'decharge').actionLabel).toBe('Accepter la décharge et le règlement');
    expect(piece(state, 'decharge').actionHref).toBe('/acceptations');

    const reglement = piece(state, 'reglement');
    expect(reglement.actionLabel).toBe('Les deux documents s’acceptent ensemble');
    expect(reglement.actionHref).toBeUndefined();

    expect(piece(state, 'preuve').actionLabel).toBe('Dépose ta preuve de paiement CCP');
    expect(piece(state, 'preuve').actionHref).toBe('/preuve');

    const validation = piece(state, 'validation');
    expect(validation.fait).toBe(false);
    expect(validation.actionLabel).toBeUndefined();
    expect(validation.motifRefus).toBeUndefined();
    expect(validation.texteSecondaire).toBeUndefined();
  });

  it('acceptations partielles : la deuxième ligne rappelle le bloc commun sans doublon de lien', async () => {
    const store = buildChecklistStore({
      coureur: { dechargeAcceptedAt: new Date('2026-10-21T09:30:00.000Z'), dechargeVersion: 'v1' },
      preuve: null,
    });
    const state = await getChecklistState(session, { store });
    expect(piece(state, 'decharge').fait).toBe(true);
    expect(piece(state, 'decharge').actionLabel).toBeUndefined();
    expect(piece(state, 'reglement').fait).toBe(false);
    expect(piece(state, 'reglement').actionLabel).toBe('Les deux documents s’acceptent ensemble');
    expect(piece(state, 'reglement').actionHref).toBeUndefined();
  });

  it('inscriptions fermées : checklist lisible, actions inscription/preuve neutralisées sans lien mort', async () => {
    const store = buildChecklistStore({
      edition: FERMEES,
      coureur: null,
      preuve: null,
    });
    const state = await getChecklistState(session, { store });
    expect(state.edition?.registrationOpen).toBe(false);
    expect(state.pieces).toHaveLength(6);
    for (const id of ['epreuve', 'preuve'] as const) {
      expect(piece(state, id).actionLabel, id).toBe('Inscriptions fermées');
      expect(piece(state, id).actionHref, id).toBeUndefined();
    }
    expect(piece(state, 'decharge').actionHref).toBe('/acceptations');

    const inscrit = buildChecklistStore({
      edition: FERMEES,
      coureur: ACCEPTATIONS_ACCEPTEES,
      preuve: PREUVE,
    });
    const etatInscrit = await getChecklistState(session, { store: inscrit });
    expect(piece(etatInscrit, 'epreuve').actionLabel).toBeUndefined();
    expect(piece(etatInscrit, 'preuve').actionLabel).toBe('Inscriptions fermées');
    expect(piece(etatInscrit, 'preuve').actionHref).toBeUndefined();
  });

  it('aucune édition configurée : liste vide, récap absent, sans erreur', async () => {
    const store = buildChecklistStore({ edition: null });
    const state = await getChecklistState(session, { store });
    expect(state).toEqual({ edition: null, pieces: [], recap: null });
  });

  it('store indisponible : DbUnavailableError propagée pour l’enveloppe côté page', async () => {
    const store = buildChecklistStore();
    store.findCurrentEdition.mockRejectedValue(new DbUnavailableError(new Error('boom')));
    await expect(getChecklistState(session, { store })).rejects.toBeInstanceOf(DbUnavailableError);
  });

  it('sans preuve : la validation n’est PAS « en attente de l’organisation »', async () => {
    const store = buildChecklistStore({ coureur: ACCEPTATIONS_ACCEPTEES, preuve: null });
    const state = await getChecklistState(session, { store });
    const validation = piece(state, 'validation');
    expect(validation.texteSecondaire).toBe(CHECKLIST_VALIDATION_APRES_PREUVE);
    expect(validation.texteSecondaire).not.toBe(CHECKLIST_VALIDATION_EN_ATTENTE);
  });

  it('lecture preuve indisponible : la pièce dégrade sans faire tomber la checklist', async () => {
    const store = buildChecklistStore({
      coureur: ACCEPTATIONS_ACCEPTEES,
      preuve: null,
    });
    store.findActivePreuveByAccount.mockRejectedValue(new Error('boom'));
    const state = await getChecklistState(session, { store });
    expect(state.pieces).toHaveLength(6);
    expect(piece(state, 'email').fait).toBe(true);
    expect(piece(state, 'epreuve').fait).toBe(true);
    expect(piece(state, 'decharge').fait).toBe(true);
    const preuve = piece(state, 'preuve');
    expect(preuve.fait).toBe(false);
    expect(preuve.texteSecondaire).toBe(CHECKLIST_PREUVE_INDISPONIBLE);
    expect(preuve.actionLabel).toBeUndefined();
    // Preuve illisible : on ne sait pas qu'elle est déposée, donc on n'annonce
    // pas que l'organisation a quelque chose à valider.
    expect(piece(state, 'validation').texteSecondaire).toBe(CHECKLIST_VALIDATION_APRES_PREUVE);
  });

  it('lecture seule : aucune méthode d’écriture du store n’est appelée', async () => {
    const store = buildChecklistStore({
      coureur: { ...ACCEPTATIONS_ACCEPTEES, status: 'refusé', refusalReason: 'reçu illisible' },
      preuve: PREUVE,
    });
    await getChecklistState(session, { store });
    expect(store.upsertCoureur).not.toHaveBeenCalled();
    expect(store.acceptDocuments).not.toHaveBeenCalled();
    expect(store.savePreuve).not.toHaveBeenCalled();
    expect(store.decideDossier).not.toHaveBeenCalled();
  });
});
