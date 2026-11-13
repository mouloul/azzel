import { describe, expect, it, vi } from 'vitest';

import { PLACES_MUETTES, getPlacesState, getPlacesVitrine } from './service';
import type { EditionRecord, InscriptionsStore } from './store';

const EDITION: EditionRecord = {
  id: 'ed-1',
  organisationId: 'org-1',
  slug: '2027',
  nom: 'Édition 2027',
  dateCourse: '2027-03-26',
  registrationClosesAt: new Date('2027-03-16T22:59:59Z'),
  capacite: 600,
  seuilAffichagePlaces: 200,
  capaciteHebergement: 200,
  prixDossardDa: 2000,
  prixHebergementDa: 1500,
  delaiPreuveHeures: 48,
  dateCoursePublique: false,
};

function buildStore(
  edition: EditionRecord | null,
  occupees = 0,
): InscriptionsStore {
  return {
    findCurrentEdition: vi.fn().mockResolvedValue(edition),
    countPlacesOccupees: vi.fn().mockResolvedValue(occupees),
  } as unknown as InscriptionsStore;
}

describe('getPlacesState — compteur public du contingent', () => {
  it('reste muet tant qu’il reste plus de places que le seuil', async () => {
    const etat = await getPlacesState('org-1', { store: buildStore(EDITION, 100) });
    expect(etat).toEqual({ capacite: 600, restantes: 500, afficher: false, complet: false });
  });

  it('s’affiche au seuil', async () => {
    const etat = await getPlacesState('org-1', { store: buildStore(EDITION, 400) });
    expect(etat).toEqual({ capacite: 600, restantes: 200, afficher: true, complet: false });
  });

  it('complet : zéro place, affiché, et le signale', async () => {
    const etat = await getPlacesState('org-1', { store: buildStore(EDITION, 600) });
    expect(etat).toEqual({ capacite: 600, restantes: 0, afficher: true, complet: true });
  });

  it('capacité abaissée sous le nombre d’inscrits : zéro, jamais un négatif', async () => {
    const etat = await getPlacesState('org-1', {
      store: buildStore({ ...EDITION, capacite: 400 }, 414),
    });
    expect(etat.restantes).toBe(0);
    expect(etat.complet).toBe(true);
  });

  it('aucune édition : rien à compter, rien à afficher', async () => {
    const etat = await getPlacesState('org-1', { store: buildStore(null) });
    expect(etat).toEqual({ capacite: 0, restantes: 0, afficher: false, complet: false });
  });

  it('base indisponible : le compteur se tait, il ne casse pas la page', async () => {
    // Un compteur est un agrément : son absence ne doit jamais empêcher
    // quelqu'un de s'inscrire, ni faire tomber l'accueil.
    const store = {
      findCurrentEdition: vi.fn().mockRejectedValue(new Error('base indisponible')),
      countPlacesOccupees: vi.fn(),
    } as unknown as InscriptionsStore;
    const etat = await getPlacesState('org-1', { store });
    expect(etat).toEqual({ capacite: 0, restantes: 0, afficher: false, complet: false });
  });
});

describe('getPlacesVitrine — compteur de l’accueil, sans session', () => {
  it('sert le compteur de l’organisation par défaut', async () => {
    const store = {
      readDefaultOrgPlaces: vi
        .fn()
        .mockResolvedValue({ capacite: 600, seuil: 200, occupees: 450 }),
    } as unknown as InscriptionsStore;
    expect(await getPlacesVitrine({ store })).toEqual({
      capacite: 600,
      restantes: 150,
      afficher: true,
      complet: false,
    });
  });

  it('aucune édition : muet', async () => {
    const store = {
      readDefaultOrgPlaces: vi.fn().mockResolvedValue(null),
    } as unknown as InscriptionsStore;
    expect(await getPlacesVitrine({ store })).toEqual(PLACES_MUETTES);
  });

  it('base indisponible : muet, l’accueil reste debout', async () => {
    const store = {
      readDefaultOrgPlaces: vi.fn().mockRejectedValue(new Error('base indisponible')),
    } as unknown as InscriptionsStore;
    expect(await getPlacesVitrine({ store })).toEqual(PLACES_MUETTES);
  });
});
