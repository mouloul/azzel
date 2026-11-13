import { describe, expect, it } from 'vitest';

import { estExpiree, lireSurchargeDelaiPreuve, limitePreuve } from './domain';

/**
 * Délai de dépôt de la preuve : une durée glissante en heures (décision PO du
 * 13/11/2026), plus « J+N jours à 23h59 ». Les heures d'Alger des cas de la
 * matrice sont écrites en UTC (Alger = UTC+1, sans heure d'été).
 */
describe('limitePreuve — durée glissante, sans arrondi', () => {
  it('formulaire envoyé le 13/11 à 10:05 (Alger), délai 48 h → 15/11 à 10:05', () => {
    const limite = limitePreuve(new Date('2026-11-13T09:05:00Z'), 48);
    expect(limite.toISOString()).toBe('2026-11-15T09:05:00.000Z');
  });

  it('acceptations validées à 10:09 : l’échéance repart de 10:09 → 15/11 à 10:09', () => {
    // L'appelant redémarre le calcul depuis l'instant d'acceptation.
    const limite = limitePreuve(new Date('2026-11-13T09:09:00Z'), 48);
    expect(limite.toISOString()).toBe('2026-11-15T09:09:00.000Z');
  });

  it('aucun arrondi à la fin de journée : inscrit à 23:30, échéance à 23:30', () => {
    const limite = limitePreuve(new Date('2027-03-24T22:30:00Z'), 48);
    expect(limite.toISOString()).toBe('2027-03-26T22:30:00.000Z');
  });

  it('la réservation dure le même temps quelle que soit l’heure d’inscription', () => {
    for (const debut of ['2027-03-24T00:01:00Z', '2027-03-24T12:00:00Z', '2027-03-24T22:59:00Z']) {
      const instant = new Date(debut);
      expect(limitePreuve(instant, 48).getTime() - instant.getTime()).toBe(48 * 3_600_000);
    }
  });

  it('passage de mois, d’année et 29 février : simple arithmétique de durée', () => {
    expect(limitePreuve(new Date('2027-01-31T10:00:00Z'), 48).toISOString()).toBe(
      '2027-02-02T10:00:00.000Z',
    );
    expect(limitePreuve(new Date('2026-12-31T10:00:00Z'), 24).toISOString()).toBe(
      '2027-01-01T10:00:00.000Z',
    );
    expect(limitePreuve(new Date('2028-02-28T10:00:00Z'), 24).toISOString()).toBe(
      '2028-02-29T10:00:00.000Z',
    );
  });

  it('bornes du réglage : 1 heure et 720 heures', () => {
    const debut = new Date('2026-11-13T09:05:00Z');
    expect(limitePreuve(debut, 1).toISOString()).toBe('2026-11-13T10:05:00.000Z');
    expect(limitePreuve(debut, 720).toISOString()).toBe('2026-12-13T09:05:00.000Z');
  });

  it('surcharge de développement : 4 minutes remplacent le délai en heures', () => {
    const limite = limitePreuve(new Date('2026-11-13T09:05:00Z'), 48, 4);
    expect(limite.toISOString()).toBe('2026-11-13T09:09:00.000Z');
  });

  it('surcharge absente : le délai en heures s’applique', () => {
    const debut = new Date('2026-11-13T09:05:00Z');
    for (const surcharge of [null, undefined, 0, -3]) {
      expect(limitePreuve(debut, 48, surcharge).toISOString(), String(surcharge)).toBe(
        '2026-11-15T09:05:00.000Z',
      );
    }
  });
});

describe('lireSurchargeDelaiPreuve — AZZEL_DELAI_PREUVE_MINUTES', () => {
  it('en développement : un entier positif est pris en compte', () => {
    expect(lireSurchargeDelaiPreuve('4', 'development')).toBe(4);
    expect(lireSurchargeDelaiPreuve(' 4 ', 'development')).toBe(4);
  });

  it('en test : prise en compte (liste blanche development / test)', () => {
    expect(lireSurchargeDelaiPreuve('4', 'test')).toBe(4);
  });

  it('en production : ignorée, le délai en heures s’applique', () => {
    expect(lireSurchargeDelaiPreuve('4', 'production')).toBeNull();
  });

  it('sans NODE_ENV (script tsx : seed, seed:reset) ou autre valeur : ignorée', () => {
    expect(lireSurchargeDelaiPreuve('4', undefined)).toBeNull();
    expect(lireSurchargeDelaiPreuve('4', null)).toBeNull();
    expect(lireSurchargeDelaiPreuve('4', '')).toBeNull();
    expect(lireSurchargeDelaiPreuve('4', 'staging')).toBeNull();
  });

  it('valeur invalide : ignorée', () => {
    for (const valeur of ['abc', '0', '-3', '4.5', '4min', '', '   ']) {
      expect(lireSurchargeDelaiPreuve(valeur, 'development'), valeur).toBeNull();
    }
  });

  it('plafonnée au délai maximal (720 h = 43 200 min) : au-delà, ignorée — jamais une date invalide', () => {
    expect(lireSurchargeDelaiPreuve('43200', 'development')).toBe(43_200);
    for (const valeur of ['43201', '99999999999', '99999999999999999999999']) {
      expect(lireSurchargeDelaiPreuve(valeur, 'development'), valeur).toBeNull();
    }
    const limite = limitePreuve(new Date('2026-11-13T09:05:00Z'), 48, 43_200);
    expect(Number.isNaN(limite.getTime())).toBe(false);
  });

  it('variable absente : aucune surcharge', () => {
    expect(lireSurchargeDelaiPreuve(null, 'development')).toBeNull();
    expect(lireSurchargeDelaiPreuve(undefined, 'development')).toBeNull();
  });
});

describe('estExpiree — la milliseconde près', () => {
  const limite = new Date('2026-11-15T09:05:00.000Z');

  it('une milliseconde avant la limite : encore dans les temps', () => {
    expect(estExpiree(limite, new Date('2026-11-15T09:04:59.999Z'))).toBe(false);
  });

  it('pile à la limite : encore dans les temps — la limite est incluse', () => {
    expect(estExpiree(limite, limite)).toBe(false);
  });

  it('une milliseconde après : expirée', () => {
    expect(estExpiree(limite, new Date('2026-11-15T09:05:00.001Z'))).toBe(true);
  });

  it('aucune limite enregistrée : jamais expirée — on ne supprime pas sur une absence', () => {
    expect(estExpiree(null, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});
