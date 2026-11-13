import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionRecord } from '@/modules/iam/store';

import {
  CHAMPS_REGLAGES,
  ENV_DELAI_PREUVE_MINUTES,
  LIBELLES_JOURNAL_REGLAGES,
  LIBELLES_REGLAGES,
} from './domain';
import { getReglagesAdmin, normaliserReglages } from './service';
import type { EditionRecord, InscriptionsStore, LigneJournalReglage } from './store';

describe('réglage « afficher la date exacte de la course »', () => {
  it('fait partie des réglages pilotables, avec son libellé', () => {
    expect(CHAMPS_REGLAGES).toContain('dateCoursePublique');
    expect(LIBELLES_REGLAGES.dateCoursePublique).toMatch(/date/i);
  });

  it('accepte 0 (cachée) et 1 (publiée)', () => {
    expect(normaliserReglages({ dateCoursePublique: 0 }).reglages.dateCoursePublique).toBe(0);
    expect(normaliserReglages({ dateCoursePublique: '1' }).reglages.dateCoursePublique).toBe(1);
  });

  it('refuse toute autre valeur : ce n’est pas un nombre, c’est un choix oui / non', () => {
    // Un 2 ou un 600 « passerait » comme entier positif ordinaire et serait
    // écrit tel quel : la contrainte SQL le refuserait, en 500.
    for (const valeur of [2, 600, -1]) {
      const { reglages, erreurs } = normaliserReglages({ dateCoursePublique: valeur });
      expect(erreurs.dateCoursePublique, String(valeur)).toBeDefined();
      expect(reglages.dateCoursePublique, String(valeur)).toBeUndefined();
    }
  });

  it('absent de l’envoi : ni écrit ni journalisé', () => {
    const { reglages, erreurs } = normaliserReglages({ capacite: 700 });
    expect(reglages.dateCoursePublique).toBeUndefined();
    expect(erreurs.dateCoursePublique).toBeUndefined();
  });
});

describe('réglage « délai de dépôt de la preuve », en heures', () => {
  it('remplace le délai en jours, avec son libellé', () => {
    expect(CHAMPS_REGLAGES).toContain('delaiPreuveHeures');
    expect(CHAMPS_REGLAGES).not.toContain('delaiPreuveJours');
    expect(LIBELLES_REGLAGES.delaiPreuveHeures).toBe('Délai de dépôt de la preuve (heures)');
  });

  it('accepte 1, 48 et 720 heures', () => {
    for (const valeur of [1, 48, '72', 720]) {
      const { reglages, erreurs } = normaliserReglages({ delaiPreuveHeures: valeur });
      expect(erreurs.delaiPreuveHeures, String(valeur)).toBeUndefined();
      expect(reglages.delaiPreuveHeures, String(valeur)).toBe(Number(valeur));
    }
  });

  it('hors bornes (0, 721, 100 001) : refus nommé sur le champ, rien n’est retenu', () => {
    // 100 001 dépasse aussi le garde-fou commun : c'est pourtant le message
    // du délai qui doit sortir, pas « 100000 au maximum ».
    for (const valeur of [0, 721, 100_000, 100_001]) {
      const { reglages, erreurs } = normaliserReglages({ delaiPreuveHeures: valeur, capacite: 600 });
      expect(erreurs.delaiPreuveHeures, String(valeur)).toBe(
        'Indique un délai entre 1 et 720 heures (30 jours).',
      );
      expect(reglages.delaiPreuveHeures, String(valeur)).toBeUndefined();
      // Le refus est nommé : il ne déborde pas sur les autres champs.
      expect(erreurs.capacite).toBeUndefined();
    }
  });

  it('non entier ou négatif : le même refus nommé, qui donne la plage', () => {
    for (const valeur of [1.5, -3, 'abc']) {
      const { reglages, erreurs } = normaliserReglages({ delaiPreuveHeures: valeur });
      expect(erreurs.delaiPreuveHeures, String(valeur)).toBe(
        'Indique un délai entre 1 et 720 heures (30 jours).',
      );
      expect(reglages.delaiPreuveHeures, String(valeur)).toBeUndefined();
    }
  });

  it('les autres réglages gardent le garde-fou commun', () => {
    expect(normaliserReglages({ capacite: -3 }).erreurs.capacite).toBe(
      'Indique un nombre entier positif.',
    );
    expect(normaliserReglages({ capacite: 100_001 }).erreurs.capacite).toBe('100000 au maximum.');
  });

  it('l’ancien champ en jours, envoyé par un vieil onglet, est ignoré', () => {
    const { reglages, erreurs } = normaliserReglages({ delaiPreuveJours: 2 });
    expect(reglages).toEqual({});
    expect(erreurs).toEqual({});
  });
});

describe('écran d’administration — délai de preuve', () => {
  const session: SessionRecord = {
    accountId: 'compte-orga',
    organisationId: 'org-1',
    email: 'orga@example.dz',
    role: 'organisateur',
    createdAt: new Date('2026-11-13T09:00:00Z'),
  };

  const edition: EditionRecord = {
    id: 'edition-2027',
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

  function storeAvecJournal(journal: LigneJournalReglage[]): InscriptionsStore {
    return {
      findCurrentEdition: async () => edition,
      countPlacesOccupees: async () => 0,
      countHebergementsOccupes: async () => 0,
      listListeAttente: async () => [],
      listJournalReglages: async () => journal,
    } as unknown as InscriptionsStore;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('expose le délai en heures', async () => {
    vi.stubEnv(ENV_DELAI_PREUVE_MINUTES, '');
    const etat = await getReglagesAdmin(session, { store: storeAvecJournal([]) });
    expect(etat.reglages.delaiPreuveHeures).toBe(48);
    expect(etat.surchargeDelaiPreuveMinutes).toBeNull();
  });

  it('surcharge de développement active : exposée à l’écran', async () => {
    vi.stubEnv(ENV_DELAI_PREUVE_MINUTES, '4');
    vi.stubEnv('NODE_ENV', 'development');
    const etat = await getReglagesAdmin(session, { store: storeAvecJournal([]) });
    expect(etat.surchargeDelaiPreuveMinutes).toBe(4);
  });

  it('surcharge en production : ignorée, rien n’est annoncé', async () => {
    vi.stubEnv(ENV_DELAI_PREUVE_MINUTES, '4');
    vi.stubEnv('NODE_ENV', 'production');
    const etat = await getReglagesAdmin(session, { store: storeAvecJournal([]) });
    expect(etat.surchargeDelaiPreuveMinutes).toBeNull();
  });

  it('historique : les lignes de l’ancien réglage en jours restent lisibles, valeurs non converties', async () => {
    const etat = await getReglagesAdmin(session, {
      store: storeAvecJournal([
        {
          champ: 'delaiPreuveHeures',
          ancienneValeur: 48,
          nouvelleValeur: 72,
          modifieLe: new Date('2026-11-14T10:00:00Z'),
          modifiePar: 'orga@example.dz',
        },
        {
          champ: 'delaiPreuveJours',
          ancienneValeur: 2,
          nouvelleValeur: 3,
          modifieLe: new Date('2026-11-01T10:00:00Z'),
          modifiePar: null,
        },
      ]),
    });
    expect(etat.journal.map((ligne) => [ligne.libelle, ligne.ancienneValeur, ligne.nouvelleValeur])).toEqual([
      ['Délai de dépôt de la preuve (heures)', 48, 72],
      [LIBELLES_JOURNAL_REGLAGES.delaiPreuveJours, 2, 3],
    ]);
    expect(LIBELLES_JOURNAL_REGLAGES.delaiPreuveJours).toMatch(/jours/);
  });
});
